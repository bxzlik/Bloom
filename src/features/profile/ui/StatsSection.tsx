import { useMemo, useState } from 'react'
import { useLibStore, useHistoryStore, useActivityStore, useUsageStore } from '@features/library'
import { playTrack } from '@features/player'
import { trackRegistry, type Track, ScLogo, YmLogo, YtmLogo, SpLogo, HddLogo, providerBrandColor } from '@entities/track'
import { toast } from '@shared/ui'
import { parseDur, fmtDurLong } from '../lib/formatStats'
import { useArtistAvatars } from '../lib/useArtistAvatars'
import { useAchievementsStore } from '../model/achievementsStore'
import { useT, useLocale, t as tt } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Полная секция статистики на странице профиля. `#statsSection`
 * / `_renderStats` + `_renderActivityChart`/`_renderActivityHeatmap`.
 *
 * Источник данных — `useHistoryStore` (count = число
 * прослушиваний) + `useActivityStore` (дневной журнал) + `useLibStore.tracks`
 * (количество треков). В старом считалось из `t.playCount`, но в bloom его нет.
 *
 * Аватары топ-артистов подгружаются с SoundCloud (`useArtistAvatars`,
 * `_enrichTopArtistAvas`), fallback — обложка лучшего трека артиста.
 */

const findTrack = (id: string, libTracks: Track[]): Track | undefined =>
  libTracks.find((t) => t.id === id) ?? trackRegistry.get(id)

/**
 * Площадка трека по ПРЕФИКСУ его id (`sc_`/`ym_`/`ytm_`/`sp_`, иначе локальный).
 * Берём из id, а не из флагов `_sc/_ym` объекта Track, чтобы разбивка считалась
 * и для треков, которых уже нет в реестре/библиотеке (после перезапуска треки
 * площадок живут только в памяти). Иначе в «где слушали чаще» оставался только
 * SoundCloud — его треки чаще оседают в библиотеке и потому резолвятся.
 */
const sourceFromId = (id: string): string =>
  id.startsWith('ytm_') ? 'ytmusic'
    : id.startsWith('ym_') ? 'yandex'
      : id.startsWith('sp_') ? 'spotify'
        : id.startsWith('sc_') ? 'soundcloud'
          : 'local'

/** Метки + лого источников. local-метка локализуется (см. stats.localFiles). */
const SOURCE_META: Record<string, { label: string; Logo: React.ComponentType<{ size: number }> }> = {
  soundcloud: { label: 'SoundCloud', Logo: ScLogo },
  yandex: { label: 'Yandex Music', Logo: YmLogo },
  ytmusic: { label: 'YouTube Music', Logo: YtmLogo },
  spotify: { label: 'Spotify', Logo: SpLogo },
  local: { label: '', Logo: HddLogo }, // label берётся из i18n в рендере
}

const NoteIcon = ({ size = 12, style }: { size?: number; style?: React.CSSProperties }) => (
  <Ico name="note" width={size} height={size} style={style} />
)

const UserIcon = ({ size = 11, style }: { size?: number; style?: React.CSSProperties }) => (
  <Ico name="user" width={size} height={size} style={style} />
)

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

export const StatsSection = () => {
  const t = useT()
  const loc = useLocale()
  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)
  const log = useActivityStore((s) => s.log)
  const appMs = useUsageStore((s) => s.appMs)

  const [period, setPeriod] = useState<7 | 30 | 0>(7)
  const [confirmClear, setConfirmClear] = useState(false)

  const stats = useMemo(() => {
    let totalSec = 0
    let totalPlays = 0
    const artistMap = new Map<string, { count: number; cover: string; bestPlays: number }>()
    // Разбивка прослушиваний по площадке (Yandex / SoundCloud / …). Считается из
    // той же истории, что и топы — поэтому покрывает и прошлые прослушивания.
    const sourceMap = new Map<string, { plays: number; sec: number }>()
    type Row = { track: Track; plays: number }
    const trackRows: Row[] = []

    for (const e of entries) {
      const plays = e.count || 0
      totalPlays += plays
      // Разбивку по площадке считаем ВСЕГДА (по префиксу id), даже если сам трек
      // уже не резолвится — иначе теряются все площадки кроме SoundCloud.
      const t = findTrack(e.id, tracks)
      const sec = t ? parseDur(t.dur) * plays : 0
      const src = sourceFromId(e.id)
      const sc = sourceMap.get(src) || { plays: 0, sec: 0 }
      sc.plays += plays
      sc.sec += sec
      sourceMap.set(src, sc)
      // Дальше — топы/время прослушивания: им нужен сам трек.
      if (!t) continue
      totalSec += sec
      if (plays > 0) trackRows.push({ track: t, plays })
      const a = t.artist || tt('common.unknownArtist')
      const cur = artistMap.get(a) || { count: 0, cover: '', bestPlays: -1 }
      cur.count += plays
      if (t.cover && plays > cur.bestPlays) {
        cur.cover = t.cover
        cur.bestPlays = plays
      }
      artistMap.set(a, cur)
    }

    const bySource = [...sourceMap.entries()]
      .map(([source, v]) => ({ source, plays: v.plays, sec: v.sec }))
      .filter((s) => s.plays > 0)
      .sort((a, b) => b.plays - a.plays)

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

    // Доп. метрики (перенесены из бывшей модалки статистики): уникальные треки,
    // средняя длина трека и средние за день. Разброс дней — из временных меток
    // истории (первое/последнее прослушивание).
    const uniqueTracks = entries.length
    const uniqueArtists = artistMap.size
    const avgSec = totalPlays > 0 ? Math.round(totalSec / totalPlays) : 0
    let firstTs = Date.now()
    let lastTs = Date.now()
    for (const e of entries) {
      if (e.ts) {
        if (e.ts < firstTs) firstTs = e.ts
        if (e.ts > lastTs) lastTs = e.ts
      }
    }
    const daySpan = Math.max(1, Math.ceil((lastTs - firstTs) / 86400000))

    return { totalSec, totalPlays, topTracks, topArtists, favArtist, bySource, recordDay, recordDateFmt, uniqueTracks, uniqueArtists, avgSec, daySpan }
  }, [entries, tracks, log])

  // Производные значения доп.метрик (для рендера): средняя длина трека mm:ss и
  // средние за день (часы / треки).
  const avgMin = Math.floor(stats.avgSec / 60)
  const avgS = stats.avgSec % 60
  const avgLenFmt = `${avgMin}:${String(avgS).padStart(2, '0')}`
  const avgHoursDay = (stats.totalSec / 3600 / stats.daySpan).toFixed(1)
  const avgTracksDay = (stats.totalPlays / stats.daySpan).toFixed(1)

  const playTop = (id: string) => playTrack(id)

  // Собрать красивое текстовое сообщение со статистикой и скопировать в буфер —
  // чтобы можно было поделиться (в чат/соцсети). Топы/источники режем до 5 строк,
  // чтобы сообщение не разрасталось.
  const copyStats = () => {
    const lines: string[] = [t('stats.shareTitle'), '']
    lines.push(`📚 ${t('stats.tracks')}: ${tracks.length}`)
    lines.push(`🎵 ${t('stats.unique')}: ${stats.uniqueTracks}`)
    lines.push(`▶️ ${t('stats.plays')}: ${stats.totalPlays}`)
    lines.push(`🎧 ${t('stats.time')}: ${fmtDurLong(stats.totalSec)}`)
    lines.push(`📏 ${t('stats.avgLength')}: ${avgLenFmt}`)
    lines.push(`⏱️ ${t('stats.appTime')}: ${fmtDurLong(Math.round(appMs / 1000))}`)
    if (stats.favArtist) lines.push(`⭐ ${t('stats.favArtist')}: ${stats.favArtist}`)
    if (stats.recordDay > 0)
      lines.push(`🏆 ${t('stats.recordDay')}: ${stats.recordDay} ${t('stats.recordTracksDay', { date: stats.recordDateFmt })}`)
    lines.push('', `📈 ${t('stats.avgPerDay')}:`)
    lines.push(`  ${avgHoursDay} ${t('stats.hoursDay')} · ${avgTracksDay} ${t('stats.tracksDay')} · ${stats.uniqueArtists} ${t('stats.artists')}`)

    if (stats.bySource.length) {
      lines.push('', `📡 ${t('stats.sources')}:`)
      stats.bySource.slice(0, 5).forEach((s, i) => {
        const label = s.source === 'local' ? t('stats.localFiles') : (SOURCE_META[s.source]?.label ?? s.source)
        const pct = stats.totalPlays > 0 ? Math.round((s.plays / stats.totalPlays) * 100) : 0
        lines.push(`  ${i + 1}. ${label} — ${s.plays} (${pct}%)`)
      })
    }
    if (stats.topTracks.length) {
      lines.push('', `🔥 ${t('stats.topTracks')}:`)
      stats.topTracks.slice(0, 5).forEach(({ track, plays }, i) => {
        lines.push(`  ${i + 1}. ${track.name}${track.artist ? ' — ' + track.artist : ''} (${tt('stats.playsCount', { n: plays })})`)
      })
    }
    if (stats.topArtists.length) {
      lines.push('', `👤 ${t('stats.topArtists')}:`)
      stats.topArtists.slice(0, 5).forEach(([a, v], i) => {
        lines.push(`  ${i + 1}. ${a} (${v.count})`)
      })
    }
    lines.push('', '— Bloom')

    navigator.clipboard
      ?.writeText(lines.join('\n'))
      .then(() => toast(t('stats.copied')))
      .catch(() => toast(t('stats.copyError')))
  }

  // Очистка всей статистики: история прослушиваний + дневной журнал активности +
  // время в приложении. Двойной клик — подтверждение (без отдельной модалки).
  const clearStats = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setConfirmClear(false)
    useHistoryStore.getState().clear()
    useActivityStore.getState().clear()
    useUsageStore.getState().clear()
    useAchievementsStore.getState().clear()
    toast(t('stats.cleared'))
  }

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
      if (period === 7) label = i === 0 ? t('stats.today') : d.toLocaleDateString(loc, { weekday: 'short' })
      else {
        const showLabel = i === 0 || i === 28 || i === 21 || i === 14 || i === 7
        label = i === 0 ? t('stats.today') : showLabel ? d.toLocaleDateString(loc, { day: 'numeric', month: 'numeric' }) : ''
      }
      out.push({ key, label, count: log[key] || 0 })
    }
    return out
  }, [period, log])

  const maxBar = Math.max(1, ...bars.map((b) => b.count))
  const maxSourcePlays = stats.bySource.length ? stats.bySource[0]!.plays : 1

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
          : `${dt.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })} · ${cnt} ${loc === 'ru' ? (cnt === 1 ? 'трек' : 'треков') : (cnt === 1 ? 'track' : 'tracks')}`
        cells.push({ lvl, today: key === todayKey, future, title })
      }
      cols.push({ cells })
    }
    return cols
  }, [period, log, todayKey])

  return (
    <div className="stats-page" id="statsSection" style={{ padding: '0 0 8px', flexShrink: 0 }}>
      {/* Заголовок секции + действия. */}
      <div className="stats-header">
        <div className="stats-title">
          <Ico name="chart" width={15} height={15} />
          {t('stats.title')}
        </div>
        <div className="stats-toolbar">
        <button className="stats-tool-btn" onClick={copyStats}>
          <Ico name="copy" width={13} height={13} />
          {t('stats.copy')}
        </button>
        <button className={`stats-tool-btn danger${confirmClear ? ' confirm' : ''}`} onClick={clearStats}>
          <Ico name="trash" width={13} height={13} />
          {confirmClear ? t('stats.clearConfirm') : t('stats.clear')}
        </button>
        </div>
      </div>

      {/* Hero cards */}
      <div className="stats-hero" id="statsHeroCards">
        <div className="stat-hero-card">
          <div className="shc-icon"><NoteIcon size={15} /></div>
          <div className="shc-val">{tracks.length}</div>
          <div className="shc-lbl">{t('stats.tracks')}</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon">
            <Ico name="play" width={15} height={15} />
          </div>
          <div className="shc-val">{stats.totalPlays}</div>
          <div className="shc-lbl">{t('stats.plays')}</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon">
            <Ico name="clock" width={15} height={15} />
          </div>
          <div className="shc-val">{fmtDurLong(stats.totalSec)}</div>
          <div className="shc-lbl">{t('stats.time')}</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon">
            <Ico name="stars" width={15} height={15} />
          </div>
          <div className="shc-val">{stats.uniqueTracks}</div>
          <div className="shc-lbl">{t('stats.unique')}</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon">
            <Ico name="chart" width={15} height={15} />
          </div>
          <div className="shc-val">{avgLenFmt}</div>
          <div className="shc-lbl">{t('stats.avgLength')}</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon"><UserIcon size={15} /></div>
          <div className="shc-val" style={{ minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{stats.favArtist || '—'}</span>
          </div>
          <div className="shc-lbl">{t('stats.favArtist')}</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon">
            <Ico name="clock" width={15} height={15} />
          </div>
          <div className="shc-val">{fmtDurLong(Math.round(appMs / 1000))}</div>
          <div className="shc-lbl">{t('stats.appTime')}</div>
        </div>
        <div className="stat-hero-card">
          <div className="shc-icon">
            <Ico name="star" width={15} height={15} />
          </div>
          <div className="shc-val">{stats.recordDay}</div>
          <div className="shc-lbl">{stats.recordDay > 0 ? `${t('stats.recordDay')} · ${stats.recordDateFmt}` : t('stats.recordDay')}</div>
        </div>
      </div>

      {/* В среднем за день (перенесено из бывшей модалки статистики) */}
      <div className="stats-card">
        <div className="stats-card-title">
          <Ico name="clock" width={12} height={12} />
          {t('stats.avgPerDay')}
        </div>
        <div className="stats-daily">
          <div className="sd-item"><div className="sd-num">{avgHoursDay}</div><div className="sd-sub">{t('stats.hoursDay')}</div></div>
          <div className="sd-item"><div className="sd-num">{avgTracksDay}</div><div className="sd-sub">{t('stats.tracksDay')}</div></div>
          <div className="sd-item"><div className="sd-num">{stats.uniqueArtists}</div><div className="sd-sub">{t('stats.artists')}</div></div>
        </div>
      </div>

      {/* Где слушали чаще — разбивка по площадкам */}
      <div className="stats-card">
        <div className="stats-card-title">
          <Ico name="note" width={12} height={12} />
          {t('stats.sources')}
        </div>
        {stats.bySource.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 0' }}>{t('stats.noDataYet')}</div>
        ) : (
          <div className="src-list">
            {stats.bySource.map((s) => {
              const meta = SOURCE_META[s.source] ?? { label: s.source, Logo: HddLogo }
              const label = s.source === 'local' ? t('stats.localFiles') : meta.label
              const color = providerBrandColor(s.source) ?? 'var(--accent)'
              const Logo = meta.Logo
              const pct = stats.totalPlays > 0 ? Math.round((s.plays / stats.totalPlays) * 100) : 0
              const fill = maxSourcePlays > 0 ? Math.round((s.plays / maxSourcePlays) * 100) : 0
              return (
                <div className="src-row" key={s.source}>
                  <div className="src-head">
                    <span className="src-logo" style={{ color }}><Logo size={15} /></span>
                    <span className="src-name">{label}</span>
                    <span className="src-pct">{pct}%</span>
                    <span className="src-meta">{t('lib.dups.plays', { n: s.plays })} · {fmtDurLong(s.sec)}</span>
                  </div>
                  <div className="src-bar"><div className="src-bar-fill" style={{ width: `${fill}%`, background: color }} /></div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="stats-row">
        {/* Top tracks */}
        <div className="stats-card">
          <div className="stats-card-title">
            <Ico name="star" width={12} height={12} />
            {t('stats.topTracks')}
          </div>
          <div id="statsTopTracks">
            {stats.topTracks.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>{t('stats.noDataYet')}</div>
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
                  <div className="top-track-plays">{tt('stats.playsCount', { n: plays })}</div>
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
                <Ico name="chart" width={12} height={12} />
                {t('stats.activity')}
              </div>
              <div className="act-period-switcher">
                {([7, 30, 0] as const).map((pp) => (
                  <button
                    key={pp}
                    className={`act-period-btn${period === pp ? ' active' : ''}`}
                    onClick={() => setPeriod(pp)}
                  >
                    {pp === 7 ? t('stats.7d') : pp === 30 ? t('stats.30d') : t('stats.all')}
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
                    <span>{t('stats.less')}</span>
                    <div className="ahm-cell ahm-l0" /><div className="ahm-cell ahm-l1" /><div className="ahm-cell ahm-l2" /><div className="ahm-cell ahm-l3" /><div className="ahm-cell ahm-l4" />
                    <span>{t('stats.more')}</span>
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
              <UserIcon size={12} /> {t('stats.topArtists')}
            </div>
            <div id="statsTopArtists" style={{ flex: 1, overflowY: 'auto' }}>
              {stats.topArtists.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 0' }}>{t('stats.noDataYet')}</div>
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
                    <div className="top-artist-count">{t('lib.dups.plays', { n: v.count })}</div>
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
