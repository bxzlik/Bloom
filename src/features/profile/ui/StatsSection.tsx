import { useMemo, useState } from 'react'
import { useLibStore, useHistoryStore, useActivityStore } from '@features/library'
import { playTrack } from '@features/player'
import { trackRegistry, type Track } from '@entities/track'
import { parseDur, fmtDurLong } from '../lib/formatStats'
import { useArtistAvatars } from '../lib/useArtistAvatars'

/**
 * Полная секция статистики на странице профиля. `#statsSection`
 * / `_renderStats` + `_renderActivityChart`/`_renderActivityHeatmap`.
 *
 * Источник данных, как в StatsModal, — `useHistoryStore` (count = число
 * прослушиваний) + `useActivityStore` (дневной журнал) + `useLibStore.tracks`
 * (количество треков). В старом считалось из `t.playCount`, но в bloom его нет.
 *
 * Аватары топ-артистов подгружаются с SoundCloud (`useArtistAvatars`,
 * `_enrichTopArtistAvas`), fallback — обложка лучшего трека артиста.
 */

const findTrack = (id: string, libTracks: Track[]): Track | undefined =>
  libTracks.find((t) => t.id === id) ?? trackRegistry.get(id)

const NoteIcon = ({ size = 12, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={style}>
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
)

const UserIcon = ({ size = 11, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={style}>
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

export const StatsSection = () => {
  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)
  const log = useActivityStore((s) => s.log)

  const [period, setPeriod] = useState<7 | 30 | 0>(7)

  const stats = useMemo(() => {
    let totalSec = 0
    let totalPlays = 0
    const artistMap = new Map<string, { count: number; cover: string; bestPlays: number }>()
    type Row = { track: Track; plays: number }
    const trackRows: Row[] = []

    for (const e of entries) {
      const t = findTrack(e.id, tracks)
      const plays = e.count || 0
      totalPlays += plays
      if (!t) continue
      totalSec += parseDur(t.dur) * plays
      if (plays > 0) trackRows.push({ track: t, plays })
      const a = t.artist || 'Неизвестный'
      const cur = artistMap.get(a) || { count: 0, cover: '', bestPlays: -1 }
      cur.count += plays
      if (t.cover && plays > cur.bestPlays) {
        cur.cover = t.cover
        cur.bestPlays = plays
      }
      artistMap.set(a, cur)
    }

    const topTracks = trackRows.sort((a, b) => b.plays - a.plays).slice(0, 10)
    const topArtists = [...artistMap.entries()]
      .filter(([, v]) => v.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
    const favArtist = topArtists.length ? topArtists[0]![0] : null

    const logEntries = Object.entries(log)
    const recordDay = logEntries.length ? Math.max(...logEntries.map(([, v]) => v)) : 0
    const recordDate = recordDay > 0 ? logEntries.sort((a, b) => b[1] - a[1])[0]![0] : null
    const recordDateFmt = recordDate
      ? new Date(recordDate).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
      : ''

    return { totalSec, totalPlays, topTracks, topArtists, favArtist, recordDay, recordDateFmt }
  }, [entries, tracks, log])

  const playTop = (id: string) => playTrack(id)

  const artistAvas = useArtistAvatars(stats.topArtists.map(([a]) => a))

  // Клик по артисту `goArtist(name)` — открывает страницу
  // артиста (резолв по имени на SC). Триггерим через общий делегат `.tra-link`
  // (см. App), синтезируя клик — как делает LibSidebar (без импорта search).
  const goArtist = (name: string) => {
    const el = document.createElement('span')
    el.className = 'tra-link'
    el.dataset.artist = name
    document.body.appendChild(el)
    el.click()
    el.remove()
  }

  const todayKey = dayKey(new Date())

  // — Activity bars (7д / 30д) —
  const bars = useMemo(() => {
    if (period === 0) return []
    const out: { key: string; label: string; count: number }[] = []
    const now = new Date()
    const n = period
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = dayKey(d)
      let label: string
      if (period === 7) label = i === 0 ? 'Сег.' : d.toLocaleDateString('ru', { weekday: 'short' })
      else {
        const showLabel = i === 0 || i === 28 || i === 21 || i === 14 || i === 7
        label = i === 0 ? 'Сег.' : showLabel ? d.toLocaleDateString('ru', { day: 'numeric', month: 'numeric' }) : ''
      }
      out.push({ key, label, count: log[key] || 0 })
    }
    return out
  }, [period, log])

  const maxBar = Math.max(1, ...bars.map((b) => b.count))

  // — Activity heatmap (Всё) —
  const heatmap = useMemo(() => {
    if (period !== 0) return null
    const today = new Date()
    const dow = (today.getDay() + 6) % 7 // Пн=0..Вс=6
    const WEEKS = 53
    const maxC = Math.max(1, ...Object.values(log))
    const cols: { cells: { lvl: number; today: boolean; future: boolean; title: string }[] }[] = []
    for (let w = WEEKS - 1; w >= 0; w--) {
      const cells: { lvl: number; today: boolean; future: boolean; title: string }[] = []
      for (let d = 0; d < 7; d++) {
        const offset = w * 7 + (dow - d)
        const dt = new Date(today)
        dt.setDate(today.getDate() - offset)
        const key = dayKey(dt)
        const cnt = log[key] || 0
        const future = offset < 0
        let lvl = 0
        if (cnt > 0) {
          const r = cnt / maxC
          lvl = r >= 0.75 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1
        }
        const title = future
          ? ''
          : `${dt.toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })} · ${cnt} ${cnt === 1 ? 'трек' : 'треков'}`
        cells.push({ lvl, today: key === todayKey, future, title })
      }
      cols.push({ cells })
    }
    return cols
  }, [period, log, todayKey])

  return (
    <div className="stats-page" id="statsSection" style={{ padding: '0 0 8px', flexShrink: 0 }}>
      {/* Hero cards */}
      <div className="stats-hero" id="statsHeroCards">
        <div className="stat-hero-card">
          <div className="shc-icon"><NoteIcon size={15} /></div>
          <div className="shc-val">{tracks.length}</div>
          <div className="shc-lbl">Треков</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" /></svg>
          </div>
          <div className="shc-val">{stats.totalPlays}</div>
          <div className="shc-lbl">Прослушано</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <div className="shc-val">{fmtDurLong(stats.totalSec)}</div>
          <div className="shc-lbl">Время прослушивания</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon"><UserIcon size={15} /></div>
          <div className="shc-val" style={{ fontSize: 13, letterSpacing: 0 }}>{stats.favArtist || '—'}</div>
          <div className="shc-lbl">Любимый исполнитель</div>
        </div>
        <div className="stat-hero-card" style={{ gridColumn: '1/-1' }}>
          <div className="shc-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div className="shc-val">{stats.recordDay}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {stats.recordDay > 0 ? `треков за день · ${stats.recordDateFmt}` : 'нет данных'}
            </div>
          </div>
          <div className="shc-lbl">Рекорд дня</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="stats-row">
        {/* Top tracks */}
        <div className="stats-card">
          <div className="stats-card-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            Топ треков
          </div>
          <div id="statsTopTracks">
            {stats.topTracks.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>Пока нет данных</div>
            ) : (
              stats.topTracks.map(({ track: t, plays }, i) => (
                <div className="top-track-item" key={t.id} onClick={() => playTop(t.id)} style={{ cursor: 'pointer' }}>
                  <div className="top-track-num">{i + 1}</div>
                  <div className="top-track-cov">
                    {t.cover ? <img src={t.cover} alt="" /> : <NoteIcon style={{ opacity: 0.3 }} />}
                  </div>
                  <div className="top-track-info">
                    <div className="top-track-name">{t.name}</div>
                    <div className="top-track-artist">{t.artist || ''}</div>
                  </div>
                  <div className="top-track-plays">{plays} раз</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity + top artists */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
          <div className="stats-card">
            <div className="stats-card-title has-actions">
              <div className="sct-left">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                Активность
              </div>
              <div className="act-period-switcher">
                {([7, 30, 0] as const).map((pp) => (
                  <button
                    key={pp}
                    className={`act-period-btn${period === pp ? ' active' : ''}`}
                    onClick={() => setPeriod(pp)}
                  >
                    {pp === 7 ? '7д' : pp === 30 ? '30д' : 'Всё'}
                  </button>
                ))}
              </div>
            </div>
            <div className={`activity-chart${period === 0 ? ' heatmap-mode' : ''}`} id="statsActivityChart">
              {period === 0 && heatmap ? (
                <>
                  <div className="act-heatmap">
                    {heatmap.map((col, ci) => (
                      <div className="ahm-col" key={ci}>
                        {col.cells.map((c, di) => (
                          <div
                            key={di}
                            className={`ahm-cell ahm-l${c.lvl}${c.today ? ' today' : ''}${c.future ? ' future' : ''}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="act-heatmap-legend">
                    <span>меньше</span>
                    <div className="ahm-cell ahm-l0" /><div className="ahm-cell ahm-l1" /><div className="ahm-cell ahm-l2" /><div className="ahm-cell ahm-l3" /><div className="ahm-cell ahm-l4" />
                    <span>больше</span>
                  </div>
                </>
              ) : (
                bars.map((b) => (
                  <div className="act-bar-wrap" key={b.key}>
                    <div
                      className={`act-bar${b.key === todayKey ? ' today' : ''}`}
                      style={{ height: Math.max(4, Math.round((b.count / maxBar) * 44)) }}
                    />
                    <div className="act-day">{b.label}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="stats-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="stats-card-title">
              <UserIcon size={12} /> Топ исполнителей
            </div>
            <div id="statsTopArtists" style={{ flex: 1, overflowY: 'auto' }}>
              {stats.topArtists.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 0' }}>Пока нет данных</div>
              ) : (
                stats.topArtists.map(([a, v], i) => {
                  const ava = artistAvas[a.toLowerCase()] || v.cover
                  return (
                  <div className="top-artist-item" key={a} onClick={() => goArtist(a)} style={{ cursor: 'pointer' }}>
                    <div className="top-track-num">{i + 1}</div>
                    <div className="top-artist-ava">
                      {ava ? <img src={ava} alt="" /> : <UserIcon style={{ opacity: 0.3 }} />}
                    </div>
                    <div className="top-artist-name">{a}</div>
                    <div className="top-artist-count">{v.count} прослуш.</div>
                  </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
