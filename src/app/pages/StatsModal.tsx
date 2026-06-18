import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useLibStore, useHistoryStore, useActivityStore } from '@features/library'
import { useSearchStore } from '@features/search'
import { trackRegistry, type Track } from '@entities/track'
import { useNavStore } from '../navigationStore'
import { useT, useLocale, t as tt } from '@shared/i18n'

/**
 * Модалка статистики (#statsModalOverlay / openStatsModal).
 * Открывается кликом по `home-stats-bar` на главной.
 *
 * Источник данных в bloom — `useHistoryStore` (поле `count` = число
 * прослушиваний трека, `ts` = последнее) + `useActivityStore` (дневной журнал,
 * для «рекорда дня»). В старом счётчик жил в `t.playCount`/глобальном
 * `playCount`; в bloom playCount на треках не ведётся, поэтому считаем из
 * истории — она и есть фактический журнал прослушиваний.
 *
 * Открытие/закрытие — модальная конвенция `.open` (см. [[project-modal-style]]).
 */

const parseDur = (dur: string | undefined): number => {
  if (!dur || dur === '—') return 0
  const p = dur.split(':').map(Number)
  if (p.some((n) => Number.isNaN(n))) return 0
  if (p.length === 2) return p[0]! * 60 + p[1]!
  if (p.length === 3) return p[0]! * 3600 + p[1]! * 60 + p[2]!
  return 0
}

const findTrack = (id: string, libTracks: Track[]): Track | undefined =>
  libTracks.find((t) => t.id === id) ?? trackRegistry.get(id)

const NoteIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
)

export const StatsModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const t = useT()
  const loc = useLocale()
  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)
  const log = useActivityStore((s) => s.log)
  const setQuery = useSearchStore((s) => s.setQuery)
  const runSearch = useSearchStore((s) => s.runSearch)
  const goNav = useNavStore((s) => s.goNav)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const [tab, setTab] = useState<'tracks' | 'artists'>('tracks')

  const stats = useMemo(() => {
    // Прослушивания по трекам берём из истории (count). Резолвим трек для
    // длительности/имени/обложки/артиста (библиотека → реестр площадок).
    let totalSec = 0
    let totalPlays = 0
    const artistMap = new Map<string, number>()
    type Row = { track: Track; plays: number }
    const trackRows: Row[] = []

    for (const e of entries) {
      const t = findTrack(e.id, tracks)
      const plays = e.count || 0
      totalPlays += plays
      if (!t) continue
      totalSec += parseDur(t.dur) * plays
      trackRows.push({ track: t, plays })
      const a = t.artist || tt('common.unknownArtist')
      artistMap.set(a, (artistMap.get(a) || 0) + plays)
    }

    const uniqueTracks = entries.length
    const avgSec = totalPlays > 0 ? Math.round(totalSec / totalPlays) : 0

    // Разброс дней из временных меток истории.
    let firstTs = Date.now()
    let lastTs = Date.now()
    for (const e of entries) {
      if (e.ts) {
        if (e.ts < firstTs) firstTs = e.ts
        if (e.ts > lastTs) lastTs = e.ts
      }
    }
    const daySpan = Math.max(1, Math.ceil((lastTs - firstTs) / 86400000))

    const topArtists = [...artistMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    const topTracks = trackRows.sort((a, b) => b.plays - a.plays).slice(0, 10)

    // Рекорд дня из журнала активности.
    const logEntries = Object.entries(log)
    const recordDay = logEntries.length ? Math.max(...logEntries.map(([, v]) => v)) : 0
    const recordDate = recordDay > 0 ? logEntries.sort((a, b) => b[1] - a[1])[0]![0] : null
    const recordDateFmt = recordDate
      ? new Date(recordDate).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
      : ''

    return {
      totalSec,
      totalPlays,
      uniqueTracks,
      avgSec,
      daySpan,
      topArtists,
      topTracks,
      uniqueArtists: artistMap.size,
      recordDay,
      recordDateFmt,
    }
  }, [entries, tracks, log])

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (open) {
      setMounted(true)
      setTab('tracks')
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  const h = Math.floor(stats.totalSec / 3600)
  const mn = Math.floor((stats.totalSec % 3600) / 60)
  const avgMin = Math.floor(stats.avgSec / 60)
  const avgS = stats.avgSec % 60
  const avgHoursDay = (stats.totalSec / 3600 / stats.daySpan).toFixed(1)
  const avgTracksDay = (stats.totalPlays / stats.daySpan).toFixed(1)
  const maxTrackPlays = stats.topTracks.length ? stats.topTracks[0]!.plays : 1

  // Клик по артисту → поиск по имени (bloom-эквивалент старого goArtist).
  const goArtist = (artist: string) => {
    onClose()
    goNav('search')
    setQuery(artist)
    void runSearch(artist)
  }

  return createPortal(
    <div
      id="statsModalOverlay"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div className="stats-modal">
        <div className="stats-modal-head">
          <div className="stats-modal-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            {t('stats.title')}
          </div>
          <button className="stats-modal-close" onClick={onClose} aria-label={t('common.close')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="stats-modal-body" id="statsModalBody">
          {/* 4 hero cards */}
          <div className="sm-hero-grid">
            <div className="sm-hero-card">
              <div className="sm-hero-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                {t('stats.totalTime')}
              </div>
              <div className="sm-hero-val">{loc === 'ru' ? `${h}ч ${mn}м` : `${h}h ${mn}m`}</div>
            </div>
            <div className="sm-hero-card">
              <div className="sm-hero-label"><NoteIcon size={11} /> {t('stats.unique')}</div>
              <div className="sm-hero-val">{stats.uniqueTracks}</div>
            </div>
            <div className="sm-hero-card">
              <div className="sm-hero-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" /></svg>
                {t('stats.playsTotal')}
              </div>
              <div className="sm-hero-val">{stats.totalPlays}</div>
            </div>
            <div className="sm-hero-card">
              <div className="sm-hero-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                {t('stats.avgLength')}
              </div>
              <div className="sm-hero-val">{avgMin}:{String(avgS).padStart(2, '0')}</div>
            </div>
          </div>

          {/* Record day */}
          <div className="sm-hero-card sm-record-card">
            <div className="sm-hero-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              {t('stats.recordDay')}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div className="sm-hero-val">{stats.recordDay}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                {stats.recordDay > 0 ? t('stats.recordTracks', { date: stats.recordDateFmt }) : t('stats.noData')}
              </div>
            </div>
          </div>

          {/* Daily averages */}
          <div className="sm-daily-card">
            <div className="sm-daily-label">{t('stats.avgPerDay')}</div>
            <div className="sm-daily-row">
              <div className="sm-daily-item"><div className="sm-daily-num">{avgHoursDay}</div><div className="sm-daily-sub">{t('stats.hoursDay')}</div></div>
              <div className="sm-daily-item"><div className="sm-daily-num">{avgTracksDay}</div><div className="sm-daily-sub">{t('stats.tracksDay')}</div></div>
              <div className="sm-daily-item"><div className="sm-daily-num">{stats.uniqueArtists}</div><div className="sm-daily-sub">{t('stats.artists')}</div></div>
            </div>
          </div>

          {/* Tabs */}
          <div className="sm-tabs">
            <button className={`sm-tab${tab === 'tracks' ? ' active' : ''}`} onClick={() => setTab('tracks')}>{t('search.tab.tracks')}</button>
            <button className={`sm-tab${tab === 'artists' ? ' active' : ''}`} onClick={() => setTab('artists')}>{t('search.tab.artists')}</button>
          </div>

          {/* Tracks list */}
          {tab === 'tracks' && (
            <div className="sm-list">
              {stats.topTracks.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>{t('stats.noData2')}</div>
              ) : (
                stats.topTracks.map(({ track: t, plays }, i) => (
                  <div className="sm-track-row" key={t.id}>
                    <div className={`sm-row-num${i < 3 ? ' sm-row-num-top' : ''}`}>{i + 1}</div>
                    <div className="sm-row-cov">
                      {t.cover ? <img src={t.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : <NoteIcon />}
                    </div>
                    <div className="sm-row-info">
                      <div className="sm-row-name">{t.name}</div>
                      <div className="sm-row-sub">{t.artist || ''}</div>
                      <div className="sm-row-bar"><div className="sm-row-bar-fill" style={{ width: `${Math.round((plays / maxTrackPlays) * 100)}%` }} /></div>
                    </div>
                    <div className="sm-row-count">{plays}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Artists list */}
          {tab === 'artists' && (
            <div className="sm-list">
              {stats.topArtists.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>{t('stats.noData2')}</div>
              ) : (
                stats.topArtists.map(([artist, plays], i) => (
                  <div className="sm-artist-row" style={{ cursor: 'pointer' }} onClick={() => goArtist(artist)} key={artist}>
                    <div className={`sm-row-num${i < 3 ? ' sm-row-num-top' : ''}`}>{i + 1}</div>
                    <div className="sm-artist-name">{artist}</div>
                    <div className="sm-row-count">{plays}</div>
                    {i < 3 && <div className="sm-top-badge">{t('stats.top')}</div>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
