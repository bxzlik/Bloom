import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT, useLocale } from '@shared/i18n'
import { VinylCover } from '@shared/ui'
import type { Track } from '@entities/track'
import { Ico } from '@shared/ui/icons/solar'
import { useLibStore, usePlaylistStore } from '../model'

export interface AddFromLibModalProps {
  open: boolean
  onClose: () => void
  playlistId: string | null
}

// Длительность slide-out (.spanel transform .42s) перед демонтажем.
const ANIM_MS = 440

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
 * Модалка «Добавить треки в плейлист» — боковая панель-drawer
 * (`.spanel-backdrop`/`.spanel`), выезжает справа, как редактор тегов и
 * объединение плейлистов. Содержимое переиспользует `.mpl-*` классы
 * (merge-playlists.css) + локальные `.afs-*` (там же).
 */
export const AddFromLibModal = ({ open, onClose, playlistId }: AddFromLibModalProps) => {
  const t = useT()
  const locale = useLocale()
  const tracks = useLibStore((s) => s.tracks)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const closeTimer = useRef<number | null>(null)

  // Удерживаем id плейлиста на время slide-out (родитель обнуляет playlistId
  // одновременно с open → иначе содержимое «мигнёт» всей библиотекой).
  const [actId, setActId] = useState<string | null>(null)
  const playlist = usePlaylistStore((s) =>
    actId ? s.playlists.find((p) => p.id === actId) : undefined,
  )

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

  // open/close: enter-анимация `.open` + отложенный демонтаж под slide-out.
  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      setActId(playlistId)
      setQuery('')
      setSelected(new Set())
      setSortMode('default')
      setSortDir('asc')
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
    setSortMenuOpen(false)
    closeTimer.current = window.setTimeout(() => {
      setMounted(false)
      closeTimer.current = null
    }, ANIM_MS)
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    () => tracks.filter((tr) => !alreadyInPl.has(tr.id)),
    [tracks, alreadyInPl],
  )

  // Фильтр + сортировка `_afsFiltered` / `_afsSortFn`.
  const filtered = useMemo<Track[]>(() => {
    const q = query.trim().toLowerCase()
    const arr = q
      ? available.filter(
          (tr) =>
            (tr.name || '').toLowerCase().includes(q) ||
            (tr.artist || '').toLowerCase().includes(q),
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
    } else {
      // default: addedAt desc.
      arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    }
    return arr
  }, [available, query, sortMode, sortDir])

  const allSelected =
    filtered.length > 0 && filtered.every((tr) => selected.has(tr.id))
  const someSelected =
    filtered.length > 0 && filtered.some((tr) => selected.has(tr.id))

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
        filtered.forEach((tr) => next.add(tr.id))
        return next
      })
    }
  }

  const onConfirm = () => {
    if (!actId) return
    // addTrackToPl prepend'ит по одному — реверсим, чтобы выбранные легли наверх
    // плейлиста в исходном порядке.
    for (const id of [...selected].reverse()) addTrackToPl(actId, id)
    onClose()
  }

  // ── Labels _afsUpdateChrome ────────────────────────
  const n = selected.size
  const totalAvail = available.length

  const availLabel = totalAvail
    ? locale === 'ru'
      ? `${totalAvail} ${plural(totalAvail, 'трек', 'трека', 'треков')}`
      : `${totalAvail} ${totalAvail === 1 ? 'track' : 'tracks'}`
    : ''
  const sumSec = useMemo(() => {
    if (!n) return 0
    let sec = 0
    for (const id of selected) {
      const tr = tracks.find((x) => x.id === id)
      if (tr) sec += parseDurSec(tr.dur)
    }
    return sec
  }, [selected, tracks, n])
  const confirmText = n ? t('lib.addModal.addN', { n }) : t('lib.addModal.add')

  if (!mounted) return null

  const cover = playlist?.cover
  const plName = playlist?.name ?? ''

  return createPortal(
    <div
      id="addFromLibOverlay"
      className={`spanel-backdrop${opening ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="spanel">
        {/* HERO: обложка плейлиста + заголовок + имя + статистика */}
        <div className="mpl-hero">
          <div className="mpl-cstack" style={{ width: 56, height: 56 }}>
            <div className="mpl-cov" style={{ width: 56, height: 56, top: 0, left: 0 }}>
              {cover ? <img src={cover} alt="" /> : <VinylCover seed={actId ?? ''} />}
            </div>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mpl-htitle">
              <Ico name="add" width={11} height={11} />
              {t('lib.addModal.title')}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '-.2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {plName}
            </div>
            <div className="mpl-stats">
              <span className="mpl-chip accent">{t('lib.addModal.selected', { n })}</span>
              {availLabel && <span className="mpl-chip">{availLabel}</span>}
              {n > 0 && <span className="mpl-chip"><b>{fmtMSS(sumSec)}</b></span>}
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="mpl-body" style={{ overflow: 'hidden', paddingBottom: 14 }}>
          <div className="mpl-section-title" style={{ marginBottom: 0 }}>
            <button
              className="afs-selall"
              onClick={toggleAll}
              disabled={filtered.length === 0}
            >
              <span className={`afs-chk${allSelected ? ' on' : someSelected ? ' part' : ''}`}>
                {allSelected ? (
                  <Ico name="check" variant="bold" width={9} height={9} />
                ) : someSelected ? (
                  <span style={{ width: 7, height: 1.5, background: 'var(--accent)', borderRadius: 1 }} />
                ) : null}
              </span>
              {allSelected ? t('lib.deselectAll') : t('lib.selectAll')}
            </button>
          </div>

          <div className="afs-searchrow">
            <div className="mpl-search">
              <Ico name="search" width={13} height={13} />
              <input
                id="afsSearch"
                type="text"
                placeholder={t('lib.searchTrackArtist')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              ref={sortBtnRef}
              id="afsSortBtn"
              className={`afs-sortbtn${sortMode !== 'default' ? ' active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setSortMenuOpen((v) => !v)
              }}
              aria-label={t('lib.sort.name')}
            >
              <Ico name="sort" width={14} height={14} />
            </button>
          </div>

          <div className="mpl-list afs-list" id="addFromLibList">
            {available.length === 0 ? (
              <div className="mpl-empty">{t('lib.addModal.allAdded')}</div>
            ) : filtered.length === 0 ? (
              <div className="mpl-empty">{t('lib.merge.nothingFound')}</div>
            ) : (
              filtered.map((tr) => {
                const isSel = selected.has(tr.id)
                return (
                  <div
                    className={`mpl-item${isSel ? ' sel' : ''}`}
                    key={tr.id}
                    onClick={() => toggleOne(tr.id)}
                  >
                    <div className="mpl-item-cov">
                      {tr.cover ? (
                        <img src={tr.cover} alt="" />
                      ) : (
                        <Ico name="note" width={16} height={16} style={{ opacity: 0.4 }} />
                      )}
                    </div>
                    <div className="mpl-item-info">
                      <div className="mpl-item-name">{tr.name || ''}</div>
                      <div className="mpl-item-sub">{tr.artist || ''}</div>
                    </div>
                    {tr.dur && <span className="afs-dur">{tr.dur}</span>}
                    <div className="mpl-item-check">
                      {isSel && (
                        <Ico name="check" variant="bold" width={11} height={11} />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="mpl-foot">
          <div className="mpl-foot-hint">
            {n > 0 ? `${t('lib.addModal.selected', { n })} · ${fmtMSS(sumSec)}` : availLabel}
          </div>
          <button className="mpl-btn ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="mpl-btn primary" onClick={onConfirm} disabled={n === 0}>
            {confirmText}
          </button>
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
                l: t('lib.sort.name'),
                ico: <Ico name="sort" width={11} height={11} />,
              },
              {
                k: 'artist',
                l: t('lib.sort.artist'),
                ico: <Ico name="user" width={11} height={11} />,
              },
              {
                k: 'dur',
                l: t('lib.sort.dur'),
                ico: <Ico name="clock" width={11} height={11} />,
              },
              {
                k: 'date',
                l: t('lib.sort.date'),
                ico: <Ico name="calendar" width={11} height={11} />,
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
                    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                  } else {
                    setSortMode(o.k as SortMode)
                    setSortDir('asc')
                  }
                  setSortMenuOpen(false)
                }}
              >
                <span className="ci-icon" style={active ? { color: 'var(--accent)' } : undefined}>
                  {o.ico}
                </span>{' '}
                {o.l}
                {active && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>
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

// Русская плюрализация (1 трек / 2 трека / 5 треков).
const plural = (n: number, one: string, few: string, many: string): string => {
  const m = n % 100
  const m1 = n % 10
  if (m >= 11 && m <= 14) return many
  if (m1 === 1) return one
  if (m1 >= 2 && m1 <= 4) return few
  return many
}
