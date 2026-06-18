import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '@entities/track'
import { playTrack } from '@features/player'
import { useDupsStore, useLibStore, usePlaylistStore } from '../model'
import { deleteUploadedTrack } from '../lib'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT, t as tt } from '@shared/i18n'

/**
 * Модалка «Дубликаты треков» (#dupsOverlay). Группирует треки по
 * нормализованному name+artist; группы из >1 трека —
 * дубли. В группе оставляем «лучший» (с обложкой → больше прослушиваний →
 * добавлен раньше), остальные можно удалить.
 *
 * Режим: вся библиотека (plId=null) или внутри плейлиста (plId). В режиме
 * плейлиста удаление = убрать из плейлиста; в библиотеке = удалить трек совсем.
 */

const normStr = (s: string | undefined): string => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Сортировка группы: с обложкой → больше playCount → раньше добавлен. Первый = keep. */
const sortGroup = (group: Track[]): Track[] =>
  [...group].sort((a, b) => {
    if (!!a.cover !== !!b.cover) return a.cover ? -1 : 1
    if ((b.playCount || 0) !== (a.playCount || 0)) return (b.playCount || 0) - (a.playCount || 0)
    return (a.addedAt || 0) - (b.addedAt || 0)
  })

const NoteIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ opacity: 0.3 }}>
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
)

export const DupsModal = () => {
  const t = useT()
  const open = useDupsStore((s) => s.open)
  const plId = useDupsStore((s) => s.plId)
  const close = useDupsStore((s) => s.close)
  const tracks = useLibStore((s) => s.tracks)
  const playlists = usePlaylistStore((s) => s.playlists)
  const removeTrackFromPl = usePlaylistStore((s) => s.removeTrackFromPl)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)

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

  const pl = plId ? playlists.find((p) => p.id === plId) ?? null : null

  // Пул треков + группы дублей. Реактивно: после удаления tracks/playlists
  // меняются → пересчёт → исчезнувшие группы пропадают.
  const { pool, groups } = useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]))
    const poolArr: Track[] = pl
      ? pl.trs.map((id) => byId.get(id)).filter((t): t is Track => !!t)
      : tracks
    const map = new Map<string, Track[]>()
    for (const t of poolArr) {
      const key = normStr(t.name) + '|||' + normStr(t.artist)
      const arr = map.get(key)
      if (arr) arr.push(t)
      else map.set(key, [t])
    }
    const grps = [...map.values()].filter((g) => g.length > 1).map(sortGroup)
    return { pool: poolArr, groups: grps }
  }, [tracks, pl])

  if (!mounted) return null

  const totalDups = groups.reduce((s, g) => s + g.length - 1, 0)

  // Удалить набор треков: из плейлиста (plId) либо из библиотеки целиком.
  const deleteTracks = (toDelete: Track[]) => {
    if (plId) {
      toDelete.forEach((t) => removeTrackFromPl(plId, t.id))
    } else {
      toDelete.forEach((t) => {
        void deleteUploadedTrack(t.id)
        // deleteUploadedTrack не чистит плейлисты — убираем id отовсюду.
        playlists.forEach((p) => {
          if (p.trs.includes(t.id)) removeTrackFromPl(p.id, t.id)
        })
      })
    }
  }
  const deleteGroup = (g: Track[]) => deleteTracks(sortGroup(g).slice(1))
  const deleteAll = () => groups.forEach((g) => deleteTracks(g.slice(1)))

  const plLabel = pl ? t('lib.dups.inPl', { name: pl.name }) : ''

  return createPortal(
    <div
      id="dupsOverlay"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div className="dups-modal">
        <div className="dups-head">
          <div className="dups-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            {t('lib.dups.title')}
          </div>
          <button className="dups-close" onClick={close} aria-label={t('common.close')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="dups-body" id="dupsBody">
          {pool.length === 0 ? (
            <div className="dups-empty">
              <div className="dups-empty-icon"><NoteIcon size={22} /></div>
              <span style={{ fontSize: 13 }}>{pl ? t('lib.dups.noTracksPl') : t('lib.dups.noTracksLib')}</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="dups-empty">
              <div className="dups-empty-icon" style={{ background: 'rgba(0,200,100,.08)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3dd68c" strokeWidth={2} strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t('lib.dups.none')}{plLabel}!</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('lib.dups.checked', { n: pool.length })}</span>
            </div>
          ) : (
            groups.map((group, gi) => (
              <div className="dups-group" key={gi}>
                <div className="dups-group-head">
                  <div className="dups-group-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    {group[0]!.name} — {group[0]!.artist || t('common.unknownArtist')}
                    <span className="dups-group-badge">{t('lib.dups.copies', { n: group.length })}</span>
                  </div>
                  <button className="dups-del-btn" onClick={() => deleteGroup(group)}>{t('lib.dups.delGroup')}</button>
                </div>
                {group.map((t, ti) => (
                  <div className={`dups-track${ti === 0 ? ' keep' : ''}`} key={t.id} onClick={() => playTrack(t.id)}>
                    <div className="dups-track-cov">{t.cover ? <img src={t.cover} alt="" /> : <NoteIcon />}</div>
                    <div className="dups-track-info">
                      <div className="dups-track-name">{t.name}</div>
                      <div className="dups-track-artist">
                        {(t.artist || tt('common.unknownArtist')) + (t.playCount ? ` · ${tt('lib.dups.plays', { n: t.playCount })}` : '')}
                      </div>
                    </div>
                    <div className="dups-track-dur">{t.dur || '—'}</div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {groups.length > 0 && (
          <div className="dups-foot" id="dupsFoot" style={{ display: 'flex' }}>
            <div className="dups-foot-info" id="dupsFootInfo">
              {t('lib.dups.found.a')} <strong>{groups.length}</strong> {t('lib.dups.found.b')} <strong>{totalDups}</strong> {t('lib.dups.found.c')}{plLabel}
            </div>
            <button className="dups-delete-all" onClick={deleteAll}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" />
              </svg>
              {t('lib.dups.delAll')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
