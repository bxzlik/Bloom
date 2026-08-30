import { useMemo, useState, type ReactNode } from 'react'
import { useHistoryStore, useActivityStore, useUsageStore } from '@features/library'
import { playTrack } from '@features/player'
import { ScLogo, YmLogo, YtmLogo, HddLogo, providerBrandColor } from '@entities/track'
import { toast } from '@shared/ui'
import { useT, useLocale, t as tt } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { fmtDurLong } from '../lib/formatStats'
import { artistAvatarKey, artistProviderOf, useArtistAvatars } from '../lib/useArtistAvatars'
import { useProfileStats, type ProfileStats } from '../lib/useProfileStats'
import { useAchievementsStore } from '../model/achievementsStore'
import { clearPlayLog } from '@features/wrapped/model/playLog'
import { useWrappedEntries, useWrappedUiStore } from '@features/wrapped'
import { useProfilePanelStore } from '../model/profilePanelStore'
import { ProfilePanelShell } from './ProfilePanelShell'

/**
 * Боковая шторка «Статистика» (`.spanel`) — порт мобильной `stats_sheet.dart`.
 *
 * Раскладка мобильная: лента любимых исполнителей кружками (листается вбок) →
 * топ треков → «Обзор» (сетка цифр с тонкими линиями между рядами) → «Где
 * слушали чаще» → «Активность» с переключателем периода. Копирование сводки и
 * очистка — две кнопки в футере, как внизу мобильной шторки.
 *
 * Цифры считает общий хук `useProfileStats` (те же сторы, что и раньше);
 * здесь только подача. Аватары топ-артистов догружаются `useArtistAvatars`,
 * fallback — обложка лучшего трека артиста.
 */

/** Метки + лого источников. local-метка локализуется (см. stats.localFiles). */
const SOURCE_META: Record<string, { label: string; Logo: React.ComponentType<{ size: number }> }> = {
  soundcloud: { label: 'SoundCloud', Logo: ScLogo },
  yandex: { label: 'Yandex Music', Logo: YmLogo },
  ytmusic: { label: 'YouTube Music', Logo: YtmLogo },
  local: { label: '', Logo: HddLogo }, // label берётся из i18n в рендере
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Недель в теплокарте. На странице их было 53 (год), но в панели шириной 420
 * такие колонки схлопываются в невидимые 4px — берём полгода, чтобы клетка
 * осталась ~11px, как на мобиле.
 */
const HEATMAP_WEEKS = 26

/** Раздел шторки: крупный заголовок без плашки, под ним содержимое. */
const Section = ({
  title,
  trailing,
  bleed,
  children,
}: {
  title: string
  trailing?: ReactNode
  /** Содержимое без боковых полей — ленте артистов они мешают листаться. */
  bleed?: boolean
  children: ReactNode
}) => (
  <div className={`pstat-sec${bleed ? ' bleed' : ''}`}>
    <div className="pstat-sec-head">
      <span className="pstat-sec-title">{title}</span>
      {trailing}
    </div>
    {children}
  </div>
)

const Empty = () => {
  const t = useT()
  return <div className="pstat-empty">{t('stats.noDataYet')}</div>
}

export const StatsPanel = () => {
  const t = useT()
  const loc = useLocale()
  const stats = useProfileStats()

  const [period, setPeriod] = useState<7 | 30 | 0>(7)
  const [confirmClear, setConfirmClear] = useState(false)

  // Постоянный вход в итоги месяца: в профиле он живёт только до первого
  // просмотра, а отсюда их можно пересмотреть в любой день.
  const wrappedMonth = useWrappedEntries().month
  const setWrappedOpen = useWrappedUiStore((s) => s.setOpen)
  const closePanel = useProfilePanelStore((s) => s.closePanel)

  // Аватар каждого ищется у СВОЕЙ площадки — той, где его слушали (см. хук).
  const artistAvas = useArtistAvatars(stats.topArtists)

  // Собрать красивое текстовое сообщение со статистикой и скопировать в буфер —
  // чтобы можно было поделиться (в чат/соцсети). Топы/источники режем до 5 строк,
  // чтобы сообщение не разрасталось.
  const copyStats = () => {
    const lines: string[] = [t('stats.shareTitle'), '']
    lines.push(`📚 ${t('stats.tracks')}: ${stats.libTracks}`)
    lines.push(`🎵 ${t('stats.unique')}: ${stats.uniqueTracks}`)
    lines.push(`▶️ ${t('stats.plays')}: ${stats.totalPlays}`)
    lines.push(`🎧 ${t('stats.time')}: ${fmtDurLong(stats.totalSec)}`)
    lines.push(`📏 ${t('stats.avgLength')}: ${stats.avgLenFmt}`)
    lines.push(`⏱️ ${t('stats.appTime')}: ${fmtDurLong(stats.appSec)}`)
    if (stats.favArtist) lines.push(`⭐ ${t('stats.favArtist')}: ${stats.favArtist}`)
    if (stats.recordDay > 0)
      lines.push(`🏆 ${t('stats.recordDay')}: ${stats.recordDay} ${t('stats.recordTracksDay', { date: stats.recordDateFmt })}`)
    lines.push('', `📈 ${t('stats.avgPerDay')}:`)
    lines.push(`  ${stats.avgHoursDay} ${t('stats.hoursDay')} · ${stats.avgTracksDay} ${t('stats.tracksDay')} · ${stats.uniqueArtists} ${t('stats.artists')}`)

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
      stats.topArtists.slice(0, 5).forEach((a, i) => {
        lines.push(`  ${i + 1}. ${a.name} (${a.plays})`)
      })
    }
    lines.push('', '— Bloom')

    navigator.clipboard
      ?.writeText(lines.join('\n'))
      .then(() => toast(t('stats.copied')))
      .catch(() => toast(t('stats.copyError')))
  }

  // Итоги открываются поверх страницы профиля, а шторка перекрыла бы их —
  // закрываем её вместе с открытием.
  const openWrapped = () => {
    closePanel()
    setWrappedOpen(true, 'month')
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
    // Журнал «Итогов» — часть той же статистики, чистим вместе с остальным.
    void clearPlayLog()
    toast(t('stats.cleared'))
  }

  // Клик по артисту открывает его страницу (резолв по имени). Триггерим через
  // общий делегат `.tra-link` (см. App), синтезируя клик — как делает LibSidebar.
  // Провайдера передаём явно: без него делегат уходит в SoundCloud, и аккаунт с
  // тем же именем на соседней площадке — уже другой человек.
  const goArtist = (name: string, source: string) => {
    const el = document.createElement('span')
    el.className = 'tra-link'
    el.dataset.artist = name
    el.dataset.artistProvider = artistProviderOf(source)
    document.body.appendChild(el)
    el.click()
    el.remove()
  }

  const todayKey = dayKey(new Date())
  const log = stats.log

  // — Activity bars (7д / 30д) —
  const bars = useMemo(() => {
    if (period === 0) return []
    const out: { key: string; label: string; count: number }[] = []
    const now = new Date()
    for (let i = period - 1; i >= 0; i--) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, log, loc])

  const maxBar = Math.max(1, ...bars.map((b) => b.count))
  const maxSourcePlays = stats.bySource.length ? stats.bySource[0]!.plays : 1

  // — Activity heatmap (Всё) —
  const heatmap = useMemo(() => {
    if (period !== 0) return null
    const today = new Date()
    const dow = (today.getDay() + 6) % 7 // Пн=0..Вс=6
    const maxC = Math.max(1, ...Object.values(log))
    const cols: { lvl: number; today: boolean; future: boolean }[][] = []
    for (let w = HEATMAP_WEEKS - 1; w >= 0; w--) {
      const cells: { lvl: number; today: boolean; future: boolean }[] = []
      for (let d = 0; d < 7; d++) {
        const offset = w * 7 + (dow - d)
        const dt = new Date(today)
        dt.setDate(today.getDate() - offset)
        const key = dayKey(dt)
        const cnt = log[key] || 0
        let lvl = 0
        if (cnt > 0) {
          const r = cnt / maxC
          lvl = r >= 0.75 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1
        }
        cells.push({ lvl, today: key === todayKey, future: offset < 0 })
      }
      cols.push(cells)
    }
    return cols
  }, [period, log, todayKey])

  return (
    <ProfilePanelShell kind="stats" footer={
      <>
        {/* Итоги месяца доступны всегда — это их постоянный вход. Подмена
            карточки в профиле живёт до первого просмотра, а сюда можно
            вернуться и пересмотреть. Нет данных за прошлый месяц — нет кнопки. */}
        {wrappedMonth && (
          <button className="stats-tool-btn accent" onClick={openWrapped}>
            <Ico name="award" width={13} height={13} />
            {t('wrapped.month')}
          </button>
        )}
        <button className="stats-tool-btn" onClick={copyStats}>
          <Ico name="copy" width={13} height={13} />
          {t('stats.copy')}
        </button>
        <button className={`stats-tool-btn danger${confirmClear ? ' confirm' : ''}`} onClick={clearStats}>
          <Ico name="trash" width={13} height={13} />
          {confirmClear ? t('stats.clearConfirm') : t('stats.clear')}
        </button>
      </>
    }>
      {/* Лента любимых исполнителей — кружок, имя, прослушивания. */}
      <Section title={t('stats.topArtists')} bleed>
        {stats.topArtists.length === 0 ? (
          <div className="pstat-empty" style={{ padding: '0 16px' }}>{t('stats.noDataYet')}</div>
        ) : (
          <div className="pstat-strip">
            {stats.topArtists.map((a) => {
              const ava = artistAvas[artistAvatarKey(a.source, a.name)] || a.cover
              return (
                <div className="pstat-artist" key={a.name} onClick={() => goArtist(a.name, a.source)}>
                  <div className="pstat-artist-ava">
                    {ava ? <img src={ava} alt="" /> : <Ico name="user" width={22} height={22} style={{ opacity: 0.3 }} />}
                  </div>
                  <div className="pstat-artist-name">{a.name}</div>
                  <div className="pstat-artist-plays">{a.plays}</div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title={t('stats.topTracks')}>
        {stats.topTracks.length === 0 ? <Empty /> : (
          stats.topTracks.map(({ track, plays }) => (
            <div className="pstat-track" key={track.id} onClick={() => playTrack(track.id)}>
              <div className="pstat-track-cov">
                {track.cover ? <img src={track.cover} alt="" /> : <Ico name="note" width={14} height={14} style={{ opacity: 0.3 }} />}
              </div>
              <div className="pstat-track-info">
                <div className="pstat-track-name">{track.name}</div>
                <div className="pstat-track-artist">{track.artist || ''}</div>
              </div>
              <div className="pstat-track-plays">{plays}</div>
            </div>
          ))
        )}
      </Section>

      {/* «Обзор» — все остальные цифры сеткой: ряды по три и по две ячейки,
          между рядами тонкая линия. Единственный блок со своей подложкой. */}
      <Section title={t('stats.overview')}>
        <Overview stats={stats} />
      </Section>

      <Section title={t('stats.sources')}>
        {stats.bySource.length === 0 ? <Empty /> : (
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
                    <span className="src-meta">{s.plays} · {fmtDurLong(s.sec)}</span>
                  </div>
                  <div className="src-bar"><div className="src-bar-fill" style={{ width: `${fill}%`, background: color }} /></div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section
        title={t('stats.activity')}
        trailing={
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
        }
      >
        <div className={`activity-chart${period === 0 ? ' heatmap-mode' : ''}`}>
          {period === 0 && heatmap ? (
            <>
              <div className="act-heatmap">
                {heatmap.map((col, ci) => (
                  <div className="ahm-col" key={ci}>
                    {col.map((c, di) => (
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
      </Section>
    </ProfilePanelShell>
  )
}

/** Сетка цифр «Обзора»: ряды ячеек, между рядами разделитель. */
const Overview = ({ stats: s }: { stats: ProfileStats }) => {
  const t = useT()
  const rows: { value: string; label: string }[][] = [
    [
      { value: String(s.totalPlays), label: t('stats.plays') },
      { value: String(s.libTracks), label: t('stats.tracks') },
      { value: fmtDurLong(s.totalSec), label: t('stats.time') },
    ],
    [
      { value: String(s.uniqueTracks), label: t('stats.unique') },
      { value: s.avgLenFmt, label: t('stats.avgLength') },
      { value: String(s.recordDay), label: t('stats.recordDay') },
    ],
    [
      { value: fmtDurLong(s.appSec), label: t('stats.appTime') },
      { value: String(s.uniqueArtists), label: t('stats.artists') },
    ],
    [
      { value: s.avgHoursDay, label: t('stats.hoursDay') },
      { value: s.avgTracksDay, label: t('stats.tracksDay') },
    ],
    [{ value: s.favArtist || '—', label: t('stats.favArtist') }],
  ]

  return (
    <div className="pstat-ov">
      {rows.map((row, i) => (
        <div className="pstat-ov-row" key={i}>
          {row.map((cell) => (
            <div className="pstat-ov-cell" key={cell.label}>
              <div className="pstat-ov-val">{cell.value}</div>
              <div className="pstat-ov-lbl">{cell.label}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
