import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Playlist } from '../model'
import { useMergeStore, usePlaylistStore, useLibStore } from '../model'
import { toast } from '@shared/ui'
import { PlCover } from './PlCover'
import { useT } from '@shared/i18n'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Модалка «Объединение плейлистов» (#mergePlOverlay). Источник (A) +
 * мультивыбор других плейлистов → новый плейлист.
 * Опции: «Убрать дубликаты» (по умолчанию вкл), «Удалить исходные» (выкл).
 * Имя автогенерируется, пока пользователь его не тронул.
 */

const PlCov = ({ pl }: { pl: Playlist }) =>
  pl.cover ? <img src={pl.cover} alt="" /> : <PlCover trs={pl.trs} seed={pl.id} />

export const MergeModal = () => {
  const t = useT()
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
  const liveSrc = srcId ? playlists.find((p) => p.id === srcId) ?? null : null
  // Держим последний валидный src на время slide-out: close() обнуляет srcId
  // → liveSrc=null, и без этого `if (!src) return null` размонтировал бы панель
  // мгновенно, до анимации закрытия (как в AddFromLibModal с actId).
  const [heldSrc, setHeldSrc] = useState<Playlist | null>(null)
  const src = liveSrc ?? heldSrc

  useEffect(() => {
    if (liveSrc) setHeldSrc(liveSrc)
  }, [liveSrc])

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
    (p) => p.id !== src.id && (!search.trim() || p.name.toLowerCase().includes(search.toLowerCase().trim())),
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
    toast(t('lib.merge.toast.created', { name: finalName, n: mergedTrs.length }))
  }

  const coverStack = [src, ...selPls].slice(0, 3)

  return createPortal(
    <div
      id="mergePlOverlay"
      className={`spanel-backdrop${opening ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div className="spanel">
        <div className="mpl-hero">
          <div className="mpl-cstack" id="mergePlCStack">
            {coverStack.map((p) => (
              <div className="mpl-cov" key={p.id}><PlCov pl={p} /></div>
            ))}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mpl-htitle">
              <Ico name="merge" width={11} height={11} />
              {t('lib.merge.title')}
            </div>
            <input
              className="mpl-name-input"
              type="text"
              placeholder={t('lib.merge.namePlaceholder')}
              maxLength={80}
              value={nameValue}
              onChange={(e) => {
                setNameTouched(true)
                setName(e.target.value)
              }}
            />
            <div className="mpl-stats" id="mergePlStats">
              <span className="mpl-chip accent"><b>{stats.finalCount}</b> {t('lib.merge.tracksSuffix')}</span>
              <span className="mpl-chip"><b>{selPls.length + 1}</b> {t('lib.merge.playlistsSuffix')}</span>
              {stats.dups > 0 && (
                <span className="mpl-chip"><b>{stats.dups}</b> {dedup ? t('lib.merge.dupsRemoved') : t('lib.merge.dups')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mpl-body">
          <div>
            <div className="mpl-section-title">{t('lib.merge.source')}</div>
            <div className="mpl-source">
              <div className="mpl-src-icon"><PlCov pl={src} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t('search.tracksCount', { n: src.trs.length })}</div>
              </div>
              <div className="mpl-src-badge">A</div>
            </div>
          </div>

          <div>
            <div className="mpl-section-title">
              <span>{t('lib.merge.addPlaylists')}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{t('lib.addModal.selected', { n: sel.size })}</span>
            </div>
            <div className="mpl-search">
              <Ico name="search" width={13} height={13} />
              <input type="text" placeholder={t('lib.merge.searchPlaylists')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="mpl-list">
              {others.length === 0 ? (
                <div className="mpl-empty">{t('lib.merge.nothingFound')}</div>
              ) : (
                others.map((p) => {
                  const isSel = sel.has(p.id)
                  return (
                    <div className={`mpl-item${isSel ? ' sel' : ''}`} key={p.id} onClick={() => toggleSel(p.id)}>
                      <div className="mpl-item-cov"><PlCov pl={p} /></div>
                      <div className="mpl-item-info">
                        <div className="mpl-item-name">{p.name}</div>
                        <div className="mpl-item-sub">{t('search.tracksCount', { n: p.trs.length })}</div>
                      </div>
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

          <div>
            <div className="mpl-section-title">{t('lib.merge.params')}</div>
            <div className="mpl-opts">
              <div className={`mpl-opt${dedup ? ' on' : ''}`} onClick={() => setDedup((v) => !v)}>
                <div className="mpl-opt-info">
                  <div className="mpl-opt-title">{t('lib.merge.dedup')}</div>
                  <div className="mpl-opt-sub">{t('lib.merge.dedup.sub')}</div>
                </div>
                <div className="mpl-toggle" />
              </div>
              <div className={`mpl-opt${del ? ' on' : ''}`} onClick={() => setDel((v) => !v)}>
                <div className="mpl-opt-info">
                  <div className="mpl-opt-title">{t('lib.merge.delSource')}</div>
                  <div className="mpl-opt-sub">{t('lib.merge.delSource.sub')}</div>
                </div>
                <div className="mpl-toggle" />
              </div>
            </div>
          </div>
        </div>

        <div className="mpl-foot">
          <div className="mpl-foot-hint">
            {!sel.size
              ? t('lib.merge.hint.selectOne')
              : del
                ? t('lib.merge.hint.willCreateDelete', { n: sel.size + 1 })
                : t('lib.merge.hint.willCreate')}
          </div>
          <button className="mpl-btn ghost" onClick={close}>{t('common.cancel')}</button>
          <button className="mpl-btn primary" onClick={doMerge} disabled={!sel.size}>{t('lib.merge.merge')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
