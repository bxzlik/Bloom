import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@shared/lib/cn'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import type { Track } from '@entities/track'
import { useLibStore, usePlaylistStore } from '../model'

export interface AddFromLibModalProps {
  open: boolean
  onClose: () => void
  playlistId: string | null
}

const ANIM_MS = 320

type SortMode = 'default' | 'name' | 'artist' | 'dur' | 'date'

/** Длительность "m:ss" → секунды. */
const parseDurSec = (d?: string): number => {
  if (!d || d === '—') return 0
  const p = d.split(':')
  if (p.length === 2) return (+p[0] || 0) * 60 + (+p[1] || 0)
  return +p[0] || 0
}

const fmtMSS = (sec: number): string => {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Модалка «Добавить треки в плейлист»
 * (#addFromLibOverlay / #addFromLibBox).
 *
 * Намеренно НЕ использует классы .modal/.modal-head/.modal-foot — собрана
 * на inline-стилях.
 */
export const AddFromLibModal = ({ open, onClose, playlistId }: AddFromLibModalProps) => {
  const tracks = useLibStore((s) => s.tracks)
  const playlist = usePlaylistStore((s) =>
    playlistId ? s.playlists.find((p) => p.id === playlistId) : undefined,
  )
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)

  const [mounted, setMounted] = useState(open)
  const [openClass, setOpenClass] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [sortMenuPos, setSortMenuPos] = useState<{ top: number; right: number } | null>(null)

  useLayoutEffect(() => {
    if (!sortMenuOpen || !sortBtnRef.current) {
      setSortMenuPos(null)
      return
    }
    const r = sortBtnRef.current.getBoundingClientRect()
    setSortMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
  }, [sortMenuOpen])

  useEffect(() => {
    if (!sortMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (sortBtnRef.current?.contains(e.target as Node)) return
      if (sortMenuRef.current?.contains(e.target as Node)) return
      setSortMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [sortMenuOpen])

  // open/close anim.
  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      setMounted(true)
      return runEnterAnimation(setOpenClass)
    }
    setOpenClass(false)
    closeTimer.current = window.setTimeout(() => {
      setMounted(false)
      setQuery('')
      setSelected(new Set())
      closeTimer.current = null
    }, ANIM_MS)
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // `_afsAvail`: исключаем треки уже в плейлисте.
  const alreadyInPl = useMemo(() => new Set(playlist?.trs ?? []), [playlist])
  const available = useMemo<Track[]>(
    () => tracks.filter((t) => !alreadyInPl.has(t.id)),
    [tracks, alreadyInPl],
  )

  // Фильтр + сортировка `_afsFiltered` / `_afsSortFn`.
  const filtered = useMemo<Track[]>(() => {
    const q = query.trim().toLowerCase()
    let arr = q
      ? available.filter(
          (t) =>
            (t.name || '').toLowerCase().includes(q) ||
            (t.artist || '').toLowerCase().includes(q),
        )
      : available.slice()
    const sd = sortDir === 'asc' ? 1 : -1
    if (sortMode === 'name') {
      arr.sort((a, b) =>
        sd * (a.name || '').localeCompare(b.name || '', 'ru', { sensitivity: 'base' }),
      )
    } else if (sortMode === 'artist') {
      arr.sort((a, b) =>
        sd *
        (a.artist || '').localeCompare(b.artist || '', 'ru', { sensitivity: 'base' }),
      )
    } else if (sortMode === 'dur') {
      arr.sort((a, b) => sd * (parseDurSec(a.dur) - parseDurSec(b.dur)))
    } else if (sortMode === 'date') {
      arr.sort((a, b) => sd * ((a.addedAt || 0) - (b.addedAt || 0)))
    }
    // default: addedAt desc.
    if (sortMode === 'default') arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    return arr
  }, [available, query, sortMode, sortDir])

  const allSelected =
    filtered.length > 0 && filtered.every((t) => selected.has(t.id))
  const someSelected =
    filtered.length > 0 && filtered.some((t) => selected.has(t.id))

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        filtered.forEach((t) => next.add(t.id))
        return next
      })
    }
  }

  const onConfirm = () => {
    if (!playlistId) return
    // addTrackToPl prepend'ит по одному — реверсим, чтобы выбранные легли наверх
    // плейлиста в исходном порядке.
    for (const id of [...selected].reverse()) addTrackToPl(playlistId, id)
    onClose()
  }

  const onBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  // ── Labels _afsUpdateChrome ────────────────────────
  const n = selected.size
  const totalAvail = available.length

  const chipText = `${n} выбрано`
  const availLabel = totalAvail
    ? `${totalAvail} ${plural(totalAvail, 'трек', 'трека', 'треков')} доступно`
    : ''
  const sumLabel = (() => {
    if (n === 0) return ''
    let sec = 0
    for (const id of selected) {
      const t = tracks.find((x) => x.id === id)
      if (t) sec += parseDurSec(t.dur)
    }
    return `${n} · ${fmtMSS(sec)}`
  })()
  const confirmText = n ? `Добавить (${n})` : 'Добавить'

  if (!mounted) return null

  return createPortal(
    <div
      className={cn('mover', openClass && 'open')}
      onClick={onBackdrop}
      style={{ zIndex: 9000 }}
    >
      <div
        id="addFromLibBox"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'color-mix(in srgb, var(--card-solid, var(--card)) 40%, #000 60%)',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 'var(--radius)',
          width: 460,
          maxWidth: '95vw',
          maxHeight: '74vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow:
            '0 40px 120px rgba(0,0,0,.98), 0 0 0 1px rgba(255,255,255,.04) inset',
          transform: openClass ? 'scale(1) translateY(0)' : 'scale(.91) translateY(24px)',
          transition: '.32s cubic-bezier(.34,1.38,.64,1)',
        }}
      >
        {/* HEADER — inline, БЕЗ .modal-head (нет border-bottom) */}
        <div
          style={{
            padding: '16px 18px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Добавить треки в плейлист</div>
            <span
              id="afsCountChip"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text2)',
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(255,255,255,.06)',
                display: n ? 'inline-flex' : 'none',
              }}
            >
              {chipText}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'calc(var(--radius) * 0.7)',
              transition: '.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.07)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* SEARCH ROW */}
        <div
          style={{
            padding: '0 16px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              style={{
                position: 'absolute',
                left: 10,
                color: 'var(--text2)',
                pointerEvents: 'none',
              }}
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="afsSearch"
              type="text"
              placeholder="Поиск трека или артиста..."
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 'calc(var(--radius) * 0.7)',
                padding: '7px 10px 7px 28px',
                fontSize: 12.5,
                color: 'var(--text)',
                fontFamily: 'var(--font)',
                outline: 'none',
                transition: '.15s',
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = 'rgba(255,255,255,.18)')
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)')
              }
            />
          </div>
          <button
            ref={sortBtnRef}
            id="afsSortBtn"
            onClick={(e) => {
              e.stopPropagation()
              setSortMenuOpen((v) => !v)
            }}
            style={{
              width: 30,
              height: 30,
              borderRadius: 'calc(var(--radius) * 0.7)',
              background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.07)',
              color: sortMode !== 'default' ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: '.15s',
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="9" y2="18" />
            </svg>
          </button>
        </div>

        {/* SELECT ALL + AVAIL LABEL */}
        <div
          style={{
            padding: '0 18px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            fontSize: 11.5,
            color: 'var(--text2)',
          }}
        >
          <button
            id="afsSelAllBtn"
            onClick={toggleAll}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text2)',
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 600,
              padding: '2px 0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: '.15s',
              fontFamily: 'var(--font)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text2)')}
          >
            <span
              id="afsSelAllChk"
              style={{
                width: 13,
                height: 13,
                borderRadius: 'calc(var(--radius)*0.3)',
                border: `1.5px solid ${
                  allSelected || someSelected ? 'var(--accent)' : 'var(--border)'
                }`,
                background: allSelected ? 'var(--accent)' : 'transparent',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {allSelected ? (
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent-text)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : someSelected ? (
                <div
                  style={{
                    width: 7,
                    height: 1.5,
                    background: 'var(--accent)',
                    borderRadius: 1,
                  }}
                />
              ) : null}
            </span>
            <span id="afsSelAllLbl">
              {allSelected ? 'Снять выделение' : 'Выбрать всё'}
            </span>
          </button>
          <span id="afsAvailLbl">{availLabel}</span>
        </div>

        {/* LIST */}
        <div
          id="addFromLibList"
          style={{ overflowY: 'auto', padding: '0 10px 12px', flex: 1 }}
        >
          {available.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--text2)',
                fontSize: 13,
              }}
            >
              Все треки уже в плейлисте
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--text2)',
                fontSize: 13,
              }}
            >
              Ничего не найдено
            </div>
          ) : (
            filtered.map((t) => (
              <AfsRow
                key={t.id}
                track={t}
                selected={selected.has(t.id)}
                onToggle={() => toggleOne(t.id)}
              />
            ))
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: '10px 18px 14px',
            borderTop: '1px solid rgba(255,255,255,.07)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span
            id="afsSumLbl"
            style={{ fontSize: 11.5, color: 'var(--text2)' }}
          >
            {sumLabel}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btg" onClick={onClose}>
              Отмена
            </button>
            <button
              className="btn bta"
              id="afsConfirmBtn"
              disabled={n === 0}
              onClick={onConfirm}
              style={n === 0 ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      {/* Sort menu popup */}
      {sortMenuOpen && (
        <div
          ref={sortMenuRef}
          id="afsSortMenu"
          className="open"
          style={{
            top: sortMenuPos?.top ?? -9999,
            right: sortMenuPos?.right ?? -9999,
            left: 'auto',
            position: 'fixed',
            visibility: sortMenuPos ? 'visible' : 'hidden',
          }}
        >
          {(
            [
              {
                k: 'name',
                l: 'По названию',
                ico: (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="15" y2="12" />
                    <line x1="3" y1="18" x2="9" y2="18" />
                  </svg>
                ),
              },
              {
                k: 'artist',
                l: 'По исполнителю',
                ico: (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                  >
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ),
              },
              {
                k: 'dur',
                l: 'По длительности',
                ico: (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                ),
              },
              {
                k: 'date',
                l: 'По дате добавления',
                ico: (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                ),
              },
            ] as const
          ).map((o) => {
            const active = sortMode === o.k
            return (
              <div
                key={o.k}
                className={`ci${active ? ' sort-active' : ''}`}
                onClick={() => {
                  if (active) {
                    // Toggle direction on second click.
                    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                  } else {
                    setSortMode(o.k as SortMode)
                    setSortDir('asc')
                  }
                  setSortMenuOpen(false)
                }}
              >
                <span
                  className="ci-icon"
                  style={active ? { color: 'var(--accent)' } : undefined}
                >
                  {o.ico}
                </span>{' '}
                {o.l}
                {active && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      color: 'var(--accent)',
                      flexShrink: 0,
                    }}
                  >
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>,
    document.body,
  )
}

// ── Row _afsRenderList ────────────────────────────────

const AfsRow = ({
  track,
  selected,
  onToggle,
}: {
  track: Track
  selected: boolean
  onToggle: () => void
}) => (
  <div
    onClick={onToggle}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '7px 8px',
      borderRadius: 'calc(var(--radius) * 0.55)',
      cursor: 'pointer',
      transition: '.15s',
      marginBottom: 2,
      background: selected ? 'var(--hover)' : 'transparent',
    }}
    onMouseEnter={(e) => {
      if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,.04)'
    }}
    onMouseLeave={(e) => {
      if (!selected) e.currentTarget.style.background = 'transparent'
    }}
  >
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: 'calc(var(--radius) * 0.3)',
        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        background: selected ? 'var(--accent)' : 'transparent',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--accent-text)',
      }}
    >
      {selected && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 'calc(var(--radius) * 0.4)',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
      }}
    >
      {track.cover ? (
        <img
          src={track.cover}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      )}
    </div>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {track.name || ''}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text2)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {track.artist || ''}
      </div>
    </div>
    <div
      style={{
        fontSize: 11,
        color: 'var(--text2)',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {track.dur || ''}
    </div>
  </div>
)

// Русская плюрализация (1 трек / 2 трека / 5 треков).
const plural = (n: number, one: string, few: string, many: string): string => {
  const m = n % 100
  const m1 = n % 10
  if (m >= 11 && m <= 14) return many
  if (m1 === 1) return one
  if (m1 >= 2 && m1 <= 4) return few
  return many
}
