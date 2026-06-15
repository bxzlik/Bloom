import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Playlist } from '../model'
import { useMergeStore, usePlaylistStore, useLibStore } from '../model'
import { toast } from '@shared/ui'
import { runEnterAnimation } from '@shared/lib/enterAnimation'

/**
 * Модалка «Объединение плейлистов» (#mergePlOverlay). Источник (A) +
 * мультивыбор других плейлистов → новый плейлист.
 * Опции: «Убрать дубликаты» (по умолчанию вкл), «Удалить исходные» (выкл).
 * Имя автогенерируется, пока пользователь его не тронул.
 */

const PlIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ opacity: 0.6 }}>
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
)
const PlCov = ({ pl, size }: { pl: Playlist; size: number }) =>
  pl.cover ? <img src={pl.cover} alt="" /> : <PlIcon size={size} />

export const MergeModal = () => {
  const srcId = useMergeStore((s) => s.srcId)
  const close = useMergeStore((s) => s.close)
  const playlists = usePlaylistStore((s) => s.playlists)
  const createPl = usePlaylistStore((s) => s.createPl)
  const reorderPlTracks = usePlaylistStore((s) => s.reorderPlTracks)
  const deletePl = usePlaylistStore((s) => s.deletePl)
  const selectPlaylist = useLibStore((s) => s.selectPlaylist)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [dedup, setDedup] = useState(true)
  const [del, setDel] = useState(false)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [search, setSearch] = useState('')

  const open = srcId !== null
  const src = srcId ? playlists.find((p) => p.id === srcId) ?? null : null

  // Сброс локального стейта при открытии.
  useEffect(() => {
    if (!open) return
    setSel(new Set())
    setDedup(true)
    setDel(false)
    setNameTouched(false)
    setSearch('')
    setName(src ? src.name + ' +' : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcId])

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const selPls = useMemo(
    () => [...sel].map((id) => playlists.find((p) => p.id === id)).filter((p): p is Playlist => !!p),
    [sel, playlists],
  )

  // Статистика (треков всего/уникальных/дублей).
  const stats = useMemo(() => {
    if (!src) return { total: 0, unique: 0, dups: 0, finalCount: 0 }
    const allIds = [...src.trs, ...selPls.flatMap((p) => p.trs)]
    const total = allIds.length
    const unique = new Set(allIds).size
    return { total, unique, dups: total - unique, finalCount: dedup ? unique : total }
  }, [src, selPls, dedup])

  if (!mounted || !src) return null

  const autoName = selPls.length
    ? src.name + ' + ' + selPls.map((p) => p.name).join(' + ')
    : src.name + ' +'
  const nameValue = nameTouched ? name : autoName

  const others = playlists.filter(
    (p) => p.id !== srcId && (!search.trim() || p.name.toLowerCase().includes(search.toLowerCase().trim())),
  )

  const toggleSel = (id: string) => {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const doMerge = () => {
    if (!src || !sel.size) return
    const finalName = nameValue.trim() || autoName
    let mergedTrs = [...src.trs, ...selPls.flatMap((p) => p.trs)]
    if (dedup) {
      const seen = new Set<string>()
      mergedTrs = mergedTrs.filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
    }
    const cover = src.cover ?? selPls.find((p) => p.cover)?.cover ?? undefined
    const newPl = createPl(finalName, undefined, cover)
    reorderPlTracks(newPl.id, mergedTrs)
    if (del) {
      deletePl(src.id)
      selPls.forEach((p) => deletePl(p.id))
    }
    close()
    selectPlaylist(newPl.id)
    toast(`Создан плейлист «${finalName}» — ${mergedTrs.length} треков`)
  }

  const coverStack = [src, ...selPls].slice(0, 3)

  return createPortal(
    <div
      id="mergePlOverlay"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div className="mpl-modal">
        <div className="mpl-hero">
          <button className="mpl-close" onClick={close} aria-label="Закрыть">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="mpl-cstack" id="mergePlCStack">
            {coverStack.map((p) => (
              <div className="mpl-cov" key={p.id}><PlCov pl={p} size={18} /></div>
            ))}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mpl-htitle">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
              </svg>
              Объединение плейлистов
            </div>
            <input
              className="mpl-name-input"
              type="text"
              placeholder="Название нового плейлиста"
              maxLength={80}
              value={nameValue}
              onChange={(e) => {
                setNameTouched(true)
                setName(e.target.value)
              }}
            />
            <div className="mpl-stats" id="mergePlStats">
              <span className="mpl-chip accent"><b>{stats.finalCount}</b> треков</span>
              <span className="mpl-chip"><b>{selPls.length + 1}</b> плейлистов</span>
              {stats.dups > 0 && (
                <span className="mpl-chip"><b>{stats.dups}</b> {dedup ? 'дублей убрано' : 'дублей'}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mpl-body">
          <div>
            <div className="mpl-section-title">Источник</div>
            <div className="mpl-source">
              <div className="mpl-src-icon"><PlCov pl={src} size={16} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{src.trs.length} треков</div>
              </div>
              <div className="mpl-src-badge">A</div>
            </div>
          </div>

          <div>
            <div className="mpl-section-title">
              <span>Добавить плейлисты</span>
              <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{sel.size} выбрано</span>
            </div>
            <div className="mpl-search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" placeholder="Поиск по плейлистам..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="mpl-list">
              {others.length === 0 ? (
                <div className="mpl-empty">Ничего не найдено</div>
              ) : (
                others.map((p) => {
                  const isSel = sel.has(p.id)
                  return (
                    <div className={`mpl-item${isSel ? ' sel' : ''}`} key={p.id} onClick={() => toggleSel(p.id)}>
                      <div className="mpl-item-cov"><PlCov pl={p} size={14} /></div>
                      <div className="mpl-item-info">
                        <div className="mpl-item-name">{p.name}</div>
                        <div className="mpl-item-sub">{p.trs.length} треков</div>
                      </div>
                      <div className="mpl-item-check">
                        {isSel && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <div className="mpl-section-title">Параметры</div>
            <div className="mpl-opts">
              <div className={`mpl-opt${dedup ? ' on' : ''}`} onClick={() => setDedup((v) => !v)}>
                <div className="mpl-opt-info">
                  <div className="mpl-opt-title">Убрать дубликаты</div>
                  <div className="mpl-opt-sub">Каждый трек добавится только один раз</div>
                </div>
                <div className="mpl-toggle" />
              </div>
              <div className={`mpl-opt${del ? ' on' : ''}`} onClick={() => setDel((v) => !v)}>
                <div className="mpl-opt-info">
                  <div className="mpl-opt-title">Удалить исходные</div>
                  <div className="mpl-opt-sub">Источник и выбранные плейлисты будут удалены</div>
                </div>
                <div className="mpl-toggle" />
              </div>
            </div>
          </div>
        </div>

        <div className="mpl-foot">
          <div className="mpl-foot-hint">
            {!sel.size
              ? 'Выберите хотя бы один плейлист'
              : del
                ? `Будет создан 1 плейлист, удалено ${sel.size + 1}`
                : 'Будет создан новый плейлист'}
          </div>
          <button className="mpl-btn ghost" onClick={close}>Отмена</button>
          <button className="mpl-btn primary" onClick={doMerge} disabled={!sel.size}>Объединить</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
