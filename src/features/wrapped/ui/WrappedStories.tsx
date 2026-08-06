import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT, useLocale, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { toast } from '@shared/ui'
import { invoke } from '@shared/tauri'
import { coverCache, trackRegistry, ScLogo, YmLogo, YtmLogo, HddLogo, providerBrandColor } from '@entities/track'
import { useLibStore } from '@features/library'
import { useArtistAvatars } from '@features/profile/lib/useArtistAvatars'
import { periodDatesLabel, type PeriodKind } from '../lib/periods'
import { fmtHourRange, fmtListenTime, plural, pluralWord } from '../lib/fmt'
import { buildWrappedCard } from '../lib/buildWrappedCard'
import type { WrappedArtist, WrappedData, WrappedTrack } from '../lib/aggregate'

/**
 * Полноэкранная история «Итогов» — как сторис у площадок: полоски прогресса
 * сверху, автопереход, клик по левой/правой трети, Esc/стрелки/пробел.
 *
 * Первый экран — выбор периода (в окне показа их может быть доступно несколько,
 * 1 января — все три). Дальше слайды одного периода.
 *
 * Ручки тюнинга: SLIDE_MS (длительность слайда), HOLD_MS (сколько держать, чтобы
 * поставить на паузу), HUE_STEP (на сколько уезжает оттенок акцента за слайд).
 */

const SLIDE_MS = 6000
const HOLD_MS = 220
const HUE_STEP = 34

/** Порог, ниже которого добавляем подкол «как-то пусто». */
const JOKE_TINY = 5
const JOKE_SMALL = 25

type SlideId = 'intro' | 'time' | 'counts' | 'tracks' | 'artists' | 'sources' | 'discover' | 'habits' | 'share'

const SOURCE_LOGOS: Record<string, React.ComponentType<{ size: number }>> = {
  soundcloud: ScLogo,
  yandex: YmLogo,
  ytmusic: YtmLogo,
  local: HddLogo,
}

const SOURCE_NAMES: Record<string, string> = {
  soundcloud: 'SoundCloud',
  yandex: 'Yandex Music',
  ytmusic: 'YouTube Music',
}

export interface WrappedStoriesProps {
  /** Доступные сегодня периоды (в порядке значимости). */
  periods: PeriodKind[]
  data: Partial<Record<PeriodKind, WrappedData>>
  onClose: () => void
  /** Период досмотрен/открыт — гасим кольцо кружка. */
  onSeen: (kind: PeriodKind) => void
}

export const WrappedStories = ({ periods, data, onClose, onSeen }: WrappedStoriesProps) => {
  const t = useT()
  const [period, setPeriod] = useState<PeriodKind | null>(null)
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [closing, setClosing] = useState(false)
  const holdRef = useRef<number | undefined>(undefined)
  const heldRef = useRef(false)

  const d = period ? data[period] : undefined

  const slides = useMemo<SlideId[]>(() => {
    if (!d) return []
    const out: SlideId[] = ['intro', 'time', 'counts', 'tracks']
    if (d.topArtists.length) out.push('artists')
    if (d.sources.length) out.push('sources')
    if (d.newArtists.length) out.push('discover')
    if (d.activeDays > 0) out.push('habits')
    out.push('share')
    return out
  }, [d])

  const close = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 200)
  }

  const openPeriod = (k: PeriodKind) => {
    setPeriod(k)
    setIdx(0)
    onSeen(k)
  }

  const go = (delta: number) => {
    if (!period) return
    const next = idx + delta
    if (next < 0) {
      // Назад с первого слайда — обратно к выбору периода.
      setPeriod(null)
      setIdx(0)
      return
    }
    if (next >= slides.length) {
      close()
      return
    }
    setIdx(next)
  }

  // Пока история открыта — тайтлбар поднимается над оверлеем (см. wrapped.css),
  // чтобы окно можно было двигать, а метка страницы читалась как «Итоги».
  useEffect(() => {
    document.body.classList.add('wrapped-open')
    return () => document.body.classList.remove('wrapped-open')
  }, [])

  // Клавиатура: Esc — закрыть, стрелки — листать. Пробел намеренно НЕ трогаем:
  // хоткеи плеера в bloom глобальные (ОС), пауза музыки сработает всё равно —
  // и «пробел = пауза истории» только путал бы. Пауза — удержанием мыши.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Удержание — пауза (как в сторис). Короткий клик работает как навигация.
  const onPointerDown = () => {
    heldRef.current = false
    holdRef.current = window.setTimeout(() => {
      heldRef.current = true
      setPaused(true)
    }, HOLD_MS)
  }
  const onPointerUp = (dir: number) => {
    window.clearTimeout(holdRef.current)
    if (heldRef.current) {
      heldRef.current = false
      setPaused(false)
      return
    }
    go(dir)
  }

  const cur = slides[idx]
  // Постер не крутится сам — на нём кнопки, ждём действия пользователя.
  const timedSlide = !!period && cur !== 'share'
  const timed = timedSlide && !paused

  const stageStyle = { '--wr-hue': `${idx * HUE_STEP}deg` } as React.CSSProperties

  return createPortal(
    <div
      className={`wr-root${closing ? ' closing' : ''}`}
      data-stage={period ? 'play' : 'pick'}
      data-slide={cur ?? 'pick'}
      style={stageStyle}
    >
      <div className="wr-bg" aria-hidden="true" />
      {d && <WrappedBackdrop tracks={d.topTracks} />}

      {/* Кнопка выхода — стиль «Большой обложки», в самом углу окна. */}
      <button className="wr-close" onClick={close} aria-label={t('common.close')}>
        <Ico name="close" width={15} height={15} />
      </button>

      {/* Полоски прогресса. Подписи «Итоги»/даты здесь нет: название показывает
          тайтлбар, а период — сами слайды. */}
      <div className="wr-top">
        {period && (
          <div className="wr-bars">
            {slides.map((s, i) => (
              // Последний слайд без таймера — его полоску сразу показываем полной.
              <span key={s} className={`wr-bar${i < idx || (i === idx && !timedSlide) ? ' done' : ''}`}>
                {i === idx && timedSlide && (
                  <b
                    key={`${period}:${idx}`}
                    className="wr-bar-fill"
                    style={{
                      animationDuration: `${SLIDE_MS}ms`,
                      animationPlayState: timed ? 'running' : 'paused',
                    }}
                    onAnimationEnd={() => go(1)}
                  />
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Зоны навигации — только когда история идёт */}
      {period && (
        <>
          <button
            className="wr-zone wr-zone-l"
            aria-label={t('wrapped.prev')}
            onPointerDown={onPointerDown}
            onPointerUp={() => onPointerUp(-1)}
            onPointerLeave={() => window.clearTimeout(holdRef.current)}
          />
          <button
            className="wr-zone wr-zone-r"
            aria-label={t('wrapped.next')}
            onPointerDown={onPointerDown}
            onPointerUp={() => onPointerUp(1)}
            onPointerLeave={() => window.clearTimeout(holdRef.current)}
          />
        </>
      )}

      <div className="wr-stage" key={period ? `${period}:${idx}` : 'pick'}>
        {!period ? (
          <PickSlide periods={periods} data={data} onPick={openPeriod} />
        ) : d ? (
          <Slide id={cur!} d={d} />
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

// ── Фон: размытый коллаж обложек топ-треков ────────────────────────────────

const WrappedBackdrop = ({ tracks }: { tracks: WrappedTrack[] }) => {
  const libTracks = useLibStore((s) => s.tracks)
  const covers = useMemo(
    () => tracks.map((tr) => coverOf(tr, libTracks)).filter((c): c is string => !!c).slice(0, 4),
    [tracks, libTracks],
  )
  if (!covers.length) return null
  return (
    <div className="wr-backdrop" aria-hidden="true">
      {covers.map((c, i) => (
        <img key={i} src={c} alt="" />
      ))}
    </div>
  )
}

/**
 * Обложка трека: снимок из журнала → библиотека → кеш обложек → реестр.
 * Локальные обложки (data-URL) в журнал не пишутся, поэтому фолбэки обязательны.
 */
const coverOf = (tr: { id: string; cover: string | null }, libTracks: { id: string; cover?: string | null }[]): string | null =>
  tr.cover ??
  libTracks.find((l) => l.id === tr.id)?.cover ??
  coverCache.get(tr.id) ??
  trackRegistry.get(tr.id)?.cover ??
  null

// ── Выбор периода ──────────────────────────────────────────────────────────

const PickSlide = ({
  periods,
  data,
  onPick,
}: {
  periods: PeriodKind[]
  data: Partial<Record<PeriodKind, WrappedData>>
  onPick: (k: PeriodKind) => void
}) => {
  const t = useT()
  const loc = useLocale()
  const libTracks = useLibStore((s) => s.tracks)
  return (
    // Заголовка над колонками нет намеренно: название экрана уже в тайтлбаре,
    // а колонки идут во всю высоту окна.
    <div className="wr-slide wr-slide-pick">
      <div className="wr-pick-list">
        {periods.map((k, i) => {
          const d = data[k]
          if (!d) return null
          // Мозаика из обложек топ-треков периода во всю колонку: карточка сразу
          // показывает, о какой музыке речь. Меньше четырёх — одна обложка.
          const covers = d.topTracks
            .map((tr) => coverOf(tr, libTracks))
            .filter((c): c is string => !!c)
          const art = covers.length >= 4 ? covers.slice(0, 4) : covers.slice(0, 1)
          return (
            <button
              key={k}
              className={`wr-pick-card wr-pick-${k} wr-in`}
              style={{ animationDelay: `${80 + i * 90}ms` }}
              onClick={() => onPick(k)}
            >
              <span className={`wr-pick-art${art.length < 4 ? ' one' : ''}`} aria-hidden="true">
                {art.length ? (
                  art.map((c, j) => <img key={j} src={c} alt="" loading="lazy" decoding="async" />)
                ) : (
                  <Ico name="award" width={34} height={34} />
                )}
              </span>
              {/* Плёнка поверх обложек — иначе текст внизу не читается. */}
              <span className="wr-pick-veil" aria-hidden="true" />
              <span className="wr-pick-body">
                <span className="wr-pick-name">{t(`wrapped.${k}` as TranslationKey)}</span>
                <span className="wr-pick-dates">{periodDatesLabel(d.range, loc)}</span>
                <span className="wr-pick-stats">
                  <b>
                    <Ico name="play" width={10} height={10} />
                    {plural(loc, d.plays, 'plays')}
                  </b>
                  <b>
                    <Ico name="note" width={10} height={10} />
                    {plural(loc, d.uniqueTracks, 'tracks')}
                  </b>
                  <b>
                    <Ico name="user" width={10} height={10} />
                    {plural(loc, d.uniqueArtists, 'artists')}
                  </b>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Слайды ─────────────────────────────────────────────────────────────────

const Slide = ({ id, d }: { id: SlideId; d: WrappedData }) => {
  switch (id) {
    case 'intro': return <IntroSlide d={d} />
    case 'time': return <TimeSlide d={d} />
    case 'counts': return <CountsSlide d={d} />
    case 'tracks': return <TracksSlide d={d} />
    case 'artists': return <ArtistsSlide d={d} />
    case 'sources': return <SourcesSlide d={d} />
    case 'discover': return <DiscoverSlide d={d} />
    case 'habits': return <HabitsSlide d={d} />
    case 'share': return <ShareSlide d={d} />
  }
}

/** Подкол для скудных итогов — пользователь просил именно так. */
const useJoke = (d: WrappedData): string | null => {
  const t = useT()
  if (d.uniqueTracks === 1) return t('wrapped.joke.oneTrack')
  if (d.plays < JOKE_TINY) return t('wrapped.joke.tiny')
  if (d.plays < JOKE_SMALL) return t('wrapped.joke.small')
  return null
}

const IntroSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const joke = useJoke(d)
  return (
    <div className="wr-slide wr-slide-intro">
      <div className="wr-in wr-kicker">{periodDatesLabel(d.range, loc)}</div>
      <div className="wr-in wr-title wr-title-xl">{t(`wrapped.intro.${d.range.kind}` as TranslationKey)}</div>
      <div className="wr-in wr-sub">{t('wrapped.intro.sub')}</div>
      {joke && <div className="wr-in wr-joke">{joke}</div>}
    </div>
  )
}

const TimeSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const joke = useJoke(d)
  return (
    <div className="wr-slide wr-slide-center">
      <div className="wr-in wr-kicker">{t('wrapped.time.kicker')}</div>
      <div className="wr-in wr-huge">{fmtListenTime(loc, d.sec)}</div>
      <div className="wr-in wr-sub">{t('wrapped.time.sub', { n: String(d.plays) })}</div>
      {joke && <div className="wr-in wr-joke">{joke}</div>}
    </div>
  )
}

const CountsSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const tiles: [number, string][] = [
    [d.plays, pluralWord(loc, d.plays, 'plays')],
    [d.uniqueTracks, pluralWord(loc, d.uniqueTracks, 'tracks')],
    [d.uniqueArtists, pluralWord(loc, d.uniqueArtists, 'artists')],
  ]
  return (
    <div className="wr-slide">
      <div className="wr-in wr-kicker">{t('wrapped.counts.kicker')}</div>
      <div className="wr-in wr-title">{t('wrapped.counts.title')}</div>
      <div className="wr-tiles">
        {tiles.map(([n, lbl], i) => (
          <div className="wr-tile wr-in" key={lbl} style={{ animationDelay: `${140 + i * 90}ms` }}>
            <div className="wr-tile-n">{n.toLocaleString(loc)}</div>
            <div className="wr-tile-l">{lbl}</div>
          </div>
        ))}
      </div>
      {d.newTracksCount > 0 && (
        <div className="wr-in wr-note" style={{ animationDelay: '440ms' }}>
          {t('wrapped.counts.newTracks', { n: String(d.newTracksCount) })}
        </div>
      )}
    </div>
  )
}

const TracksSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const libTracks = useLibStore((s) => s.tracks)
  const top = d.topTracks
  return (
    <div className="wr-slide">
      <div className="wr-in wr-kicker">{t('wrapped.tracks.kicker')}</div>
      <div className="wr-in wr-title">{top.length > 1 ? t('wrapped.tracks.title') : t('wrapped.tracks.titleOne')}</div>
      <div className="wr-list">
        {top.map((tr, i) => {
          const cover = coverOf(tr, libTracks)
          return (
            <div className="wr-row wr-in" key={tr.id} style={{ animationDelay: `${140 + i * 80}ms` }}>
              <span className="wr-row-n">{i + 1}</span>
              <span className="wr-row-cov">
                {cover ? <img src={cover} alt="" /> : <Ico name="note" width={18} height={18} />}
              </span>
              <span className="wr-row-info">
                <span className="wr-row-name">{tr.name || t('common.track')}</span>
                <span className="wr-row-sub">{tr.artist}</span>
              </span>
              <span className="wr-row-val">{plural(loc, tr.plays, 'plays')}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ArtistsSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const names = useMemo(() => d.topArtists.map((a) => a.name), [d])
  const avas = useArtistAvatars(names)
  return (
    <div className="wr-slide">
      <div className="wr-in wr-kicker">{t('wrapped.artists.kicker')}</div>
      <div className="wr-in wr-title">
        {d.topArtists.length > 1 ? t('wrapped.artists.title') : t('wrapped.artists.titleOne')}
      </div>
      <div className="wr-list">
        {d.topArtists.map((a, i) => (
          <ArtistRow key={a.name} a={a} i={i} ava={avas[a.name.toLowerCase()] || a.cover} loc={loc} />
        ))}
      </div>
    </div>
  )
}

const ArtistRow = ({ a, i, ava, loc }: { a: WrappedArtist; i: number; ava: string | null; loc: string }) => (
  <div className="wr-row wr-in" style={{ animationDelay: `${140 + i * 80}ms` }}>
    <span className="wr-row-n">{i + 1}</span>
    <span className="wr-row-cov wr-row-cov-round">
      {ava ? <img src={ava} alt="" /> : <Ico name="user" width={18} height={18} />}
    </span>
    <span className="wr-row-info">
      <span className="wr-row-name">{a.name}</span>
    </span>
    <span className="wr-row-val">{plural(loc, a.plays, 'plays')}</span>
  </div>
)

const SourcesSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const max = d.sources[0]?.plays || 1
  return (
    <div className="wr-slide">
      <div className="wr-in wr-kicker">{t('wrapped.sources.kicker')}</div>
      <div className="wr-in wr-title">{t('wrapped.sources.title')}</div>
      <div className="wr-src-list">
        {d.sources.map((s, i) => {
          const Logo = SOURCE_LOGOS[s.src] ?? HddLogo
          const color = providerBrandColor(s.src) ?? 'var(--accent)'
          const pct = d.plays ? Math.round((s.plays / d.plays) * 100) : 0
          return (
            <div className="wr-src wr-in" key={s.src} style={{ animationDelay: `${140 + i * 90}ms` }}>
              <div className="wr-src-head">
                <span className="wr-src-logo" style={{ color }}>
                  <Logo size={16} />
                </span>
                <span className="wr-src-name">{SOURCE_NAMES[s.src] ?? t('stats.localFiles')}</span>
                <span className="wr-src-pct">{pct}%</span>
              </div>
              <div className="wr-src-bar">
                <i style={{ width: `${Math.round((s.plays / max) * 100)}%`, background: color }} />
              </div>
              <div className="wr-src-meta">{plural(loc, s.plays, 'plays')}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DiscoverSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const names = useMemo(() => d.newArtists.map((a) => a.name), [d])
  const avas = useArtistAvatars(names)
  return (
    <div className="wr-slide">
      <div className="wr-in wr-kicker">{t('wrapped.discover.kicker')}</div>
      <div className="wr-in wr-title">
        {t('wrapped.discover.title', { n: String(d.newArtistsCount), word: pluralWord(loc, d.newArtistsCount, 'artists') })}
      </div>
      <div className="wr-chips">
        {d.newArtists.map((a, i) => {
          const ava = avas[a.name.toLowerCase()] || a.cover
          return (
            <div className="wr-chip wr-in" key={a.name} style={{ animationDelay: `${160 + i * 90}ms` }}>
              <span className="wr-chip-ava">
                {ava ? <img src={ava} alt="" /> : <Ico name="user" width={14} height={14} />}
              </span>
              {a.name}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const HabitsSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const max = Math.max(1, ...d.hours)
  const night = d.nightShare >= 0.35
  const recordDate = d.recordDay
    ? new Date(d.recordDay.ts).toLocaleDateString(loc, { day: 'numeric', month: 'long' })
    : ''
  return (
    <div className="wr-slide">
      <div className="wr-in wr-kicker">{t('wrapped.habits.kicker')}</div>
      <div className="wr-in wr-title">{night ? t('wrapped.habits.night') : t('wrapped.habits.day')}</div>

      <div className="wr-hours wr-in" style={{ animationDelay: '160ms' }}>
        {d.hours.map((n, h) => (
          <i
            key={h}
            className={h === d.peakHour ? 'peak' : undefined}
            style={{ height: `${Math.max(3, Math.round((n / max) * 100))}%` }}
          />
        ))}
      </div>
      <div className="wr-hours-axis wr-in" style={{ animationDelay: '200ms' }}>
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>

      <div className="wr-facts">
        <div className="wr-fact wr-in" style={{ animationDelay: '260ms' }}>
          <div className="wr-fact-l">{t('wrapped.habits.peak')}</div>
          <div className="wr-fact-v">{fmtHourRange(d.peakHour)}</div>
        </div>
        {d.recordDay && (
          <div className="wr-fact wr-in" style={{ animationDelay: '320ms' }}>
            <div className="wr-fact-l">{t('wrapped.habits.record')}</div>
            <div className="wr-fact-v">
              {plural(loc, d.recordDay.plays, 'tracks')} · {recordDate}
            </div>
          </div>
        )}
        <div className="wr-fact wr-in" style={{ animationDelay: '380ms' }}>
          <div className="wr-fact-l">{t('wrapped.habits.streak')}</div>
          <div className="wr-fact-v">{plural(loc, d.streak, 'days')}</div>
        </div>
        <div className="wr-fact wr-in" style={{ animationDelay: '440ms' }}>
          <div className="wr-fact-l">{t('wrapped.habits.active')}</div>
          <div className="wr-fact-v">{plural(loc, d.activeDays, 'days')}</div>
        </div>
      </div>
    </div>
  )
}

const ShareSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const libTracks = useLibStore((s) => s.tracks)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    const css = getComputedStyle(document.documentElement)
    void buildWrappedCard({
      title: t(`wrapped.${d.range.kind}` as TranslationKey),
      dates: periodDatesLabel(d.range, loc),
      timeLabel: t('wrapped.card.time'),
      timeValue: fmtListenTime(loc, d.sec),
      playsLabel: pluralWord(loc, d.plays, 'plays'),
      playsValue: d.plays.toLocaleString(loc),
      tracksLabel: t('wrapped.card.topTracks'),
      artistsLabel: t('wrapped.card.topArtists'),
      tracks: d.topTracks.map((tr) => ({
        name: tr.name || t('common.track'),
        artist: tr.artist,
        cover: coverOf(tr, libTracks),
      })),
      artists: d.topArtists.map((a) => a.name),
      accent: css.getPropertyValue('--accent').trim() || '#888',
      accent2: css.getPropertyValue('--accent2').trim() || '#555',
    })
      .then((canvas) => {
        if (!cancelled) setUrl(canvas.toDataURL('image/png'))
      })
      .catch((e) => {
        console.warn('[wrapped] card build failed', e)
      })
    return () => {
      cancelled = true
    }
  }, [d, loc])

  const save = () => {
    if (!url) return
    void invoke('cover_download', {
      dataUrl: url,
      filename: `Bloom — ${t(`wrapped.${d.range.kind}` as TranslationKey)} (${periodDatesLabel(d.range, loc)})`,
    })
      .then(() => toast(t('wrapped.share.saved')))
      .catch((e) => {
        console.warn('cover_download failed', e)
        toast(t('share.toast.saveFail'))
      })
  }

  return (
    <div className="wr-slide wr-slide-share">
      <div className="wr-in wr-kicker">{t('wrapped.share.kicker')}</div>
      <div className="wr-share-card wr-in" style={{ animationDelay: '120ms' }}>
        {url ? <img src={url} alt="" /> : <div className="wr-share-spin" />}
      </div>
      <div className="wr-share-actions wr-in" style={{ animationDelay: '220ms' }}>
        <button className="wr-btn wr-btn-primary" onClick={save} disabled={!url}>
          <Ico name="download" width={14} height={14} />
          {t('wrapped.share.save')}
        </button>
      </div>
    </div>
  )
}
