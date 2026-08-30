import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { parseArtists } from '@shared/lib/parseArtists'
import { useT, useLocale, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { toast } from '@shared/ui'
import { invoke } from '@shared/tauri'
import {
  coverCache,
  trackRegistry,
  ScLogo,
  YmLogo,
  YtmLogo,
  HddLogo,
  providerBrandColor,
  type Track,
} from '@entities/track'
// Глубокий импорт, а не барель `@features/player`: play.ts сам тянет журнал
// «Итогов» (@features/wrapped/model/playLog), и через бочки это был бы цикл.
import { playFromSource } from '@features/player/api/play'
import { getProvider } from '@features/providers'
// Тоже глубоко: из бочки `@features/search` приехали бы SearchPage/DetailView.
import { useDetailStore } from '@features/search/model/detailStore'
import { extractCoverHsl } from '@features/settings'
import { useLibStore } from '@features/library'
import { artistAvatarKey, artistProviderOf, useArtistAvatars } from '@features/profile/lib/useArtistAvatars'
import { periodDatesLabel, type PeriodKind } from '../lib/periods'
import { fmtHourRange, fmtListenTime, plural, pluralWord, splitListenTime } from '../lib/fmt'
import { buildWrappedCard } from '../lib/buildWrappedCard'
import type { WrappedArtist, WrappedData, WrappedTrack } from '../lib/aggregate'

/**
 * Модалка «Итогов» — не фуллскрин-сторис, а панель ~496px по центру окна:
 * страница остаётся видна за затемнением. Заливка у панели — цвет блоков темы,
 * а весь цвет даёт ровный круг (.wrm-blob) под контентом: его оттенок берётся
 * от обложки текущего слайда (фолбэк — акцент темы), обрезает его сама панель.
 *
 * Крестика выхода нет и метку в тайтлбаре модалка не меняет: закрывают её Esc,
 * клик мимо панели или кнопка «Закрыть» на последнем слайде.
 *
 * Механика сторис при этом сохранена целиком: полоски сверху заполняются сами,
 * слайд авто-переключается, удержание ставит на паузу, работают стрелки, левая
 * и правая зоны и Esc. Сверху к этому добавлена явная кнопка «Далее» — по ней
 * листает тот, кто ждать не хочет.
 *
 * Экрана выбора периода нет: модалка всегда открывается на конкретном периоде,
 * потому что каждый вход знает свой (подменённая карточка статистики и кнопка в
 * панели — месяц, плашка — год; см. periods.ts).
 *
 * Высота панели не прыгает при смене слайда: тело меряется (ResizeObserver) и
 * его высота едет анимацией — см. useFitHeight и .wrm-body в wrapped.css.
 *
 * Ручки тюнинга: SLIDE_MS (длительность слайда), HOLD_MS (сколько держать, чтобы
 * поставить на паузу), BLOB_S/BLOB_L (насыщенность и светлота круга);
 * геометрия — --wrm-w / --wrm-h / --wrm-blob-* в wrapped.css.
 */

const SLIDE_MS = 6000
const HOLD_MS = 220

/**
 * Круг из обложки: свой оттенок, но приглушённый. Края у него честные (без
 * размытия, как на референсе), поэтому светлота ниже, чем у акцента — иначе
 * пятно кричит громче самих цифр.
 */
const BLOB_S_MIN = 0.4
const BLOB_S_MAX = 0.78
const BLOB_L = 0.4

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

export interface WrappedModalProps {
  /** Какой период показываем. Экрана выбора нет: вход всегда знает свой период. */
  period: PeriodKind
  d: WrappedData
  onClose: () => void
  /** Период открыт — гасим метку «Новое» и снимаем подмену карточки. */
  onSeen: (kind: PeriodKind) => void
}

export const WrappedModal = ({ period, d, onClose, onSeen }: WrappedModalProps) => {
  const t = useT()
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [closing, setClosing] = useState(false)
  const holdRef = useRef<number | undefined>(undefined)
  const heldRef = useRef(false)

  // Открыли — значит посмотрели: карточка статистики возвращается на место.
  useEffect(() => {
    onSeen(period)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const slides = useMemo<SlideId[]>(() => {
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
    window.setTimeout(onClose, 180)
  }

  const go = (delta: number) => {
    const next = idx + delta
    if (next < 0) return // с первого слайда назад некуда — выбора периода нет
    if (next >= slides.length) {
      close()
      return
    }
    setIdx(next)
  }

  // Пока модалка открыта — тайтлбар поднимается над оверлеем (см. wrapped.css):
  // окно остаётся перетаскиваемым, а кнопки окна — на месте.
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

  const cur = slides[idx]!
  const last = idx === slides.length - 1
  // Постер не крутится сам — на нём кнопка сохранения, ждём действия пользователя.
  const timedSlide = cur !== 'share'
  const timed = timedSlide && !paused

  const blob = useBlobRgb(d, cur)
  const style = blob ? ({ '--wrm-blob-rgb': blob } as React.CSSProperties) : undefined
  const [fitRef, fitH] = useFitHeight(period, idx)

  return createPortal(
    <div
      className={`wrm-back${closing ? ' closing' : ''}`}
      // Клик мимо карточки закрывает — обычное поведение модалки.
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="wrm" data-slide={cur} style={style}>
        <div className="wrm-card">
          <div className="wrm-blob" aria-hidden="true" />

          {/* Полоски прогресса — они же навигация: по любой можно ткнуть и
              перескочить на этот слайд. Отдельной шапки «Итоги» нет — период
              называет первый же слайд. */}
          <div className="wrm-bars">
            {slides.map((s, i) => (
              // Последний слайд без таймера — его полоску сразу показываем полной.
              <button
                key={s}
                type="button"
                className={`wrm-bar${i < idx || (i === idx && !timedSlide) ? ' done' : ''}`}
                aria-label={String(i + 1)}
                aria-current={i === idx || undefined}
                onClick={() => setIdx(i)}
              >
                {i === idx && timedSlide && (
                  <b
                    key={`${period}:${idx}`}
                    className="wrm-bar-fill"
                    style={{
                      animationDuration: `${SLIDE_MS}ms`,
                      animationPlayState: timed ? 'running' : 'paused',
                    }}
                    onAnimationEnd={() => go(1)}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Зоны листания — как в сторис: левая часть назад, правая вперёд. */}
          <button
            className="wrm-zone wrm-zone-l"
            aria-label={t('wrapped.prev')}
            onPointerDown={onPointerDown}
            onPointerUp={() => onPointerUp(-1)}
            onPointerLeave={() => window.clearTimeout(holdRef.current)}
          />
          <button
            className="wrm-zone wrm-zone-r"
            aria-label={t('wrapped.next')}
            onPointerDown={onPointerDown}
            onPointerUp={() => onPointerUp(1)}
            onPointerLeave={() => window.clearTimeout(holdRef.current)}
          />

          {/* Высоту тела ведёт замер .wrm-fit: панель растёт и сжимается плавно. */}
          <div className="wrm-body" style={fitH ? { height: fitH } : undefined}>
            <div className="wrm-fit" ref={fitRef} key={`${period}:${idx}`}>
              <Slide id={cur} d={d} onLeave={close} />
            </div>
          </div>

          {/* Кнопка внизу панели: «Далее» весь путь, «Закрыть» — на постере. */}
          <div className="wrm-cta">
            <button className="wrm-btn" onClick={() => (last ? close() : go(1))}>
              {last ? t('common.close') : t('wrapped.next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Плавная высота панели ──────────────────────────────────────────────────

/**
 * Высота содержимого слайда — её .wrm-body проигрывает transition'ом, поэтому
 * панель растёт и сжимается плавно, а не прыгает на каждой смене слайда.
 *
 * Первый замер делаем ДО отрисовки (useLayoutEffect), иначе на входе мигала бы
 * анимация с прежней высоты. Дальше держит ResizeObserver: обложки и постер
 * грузятся асинхронно, слайд подрастает уже после монтирования.
 */
const useFitHeight = (
  period: PeriodKind | null,
  idx: number,
): [React.RefObject<HTMLDivElement | null>, number | null] => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [h, setH] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = () => setH(Math.round(el.getBoundingClientRect().height))
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [period, idx])

  return [ref, h]
}

// ── Цвет круга ─────────────────────────────────────────────────────────────

/** hsl(0–360, 0–1, 0–1) → «r, g, b» для подстановки в rgb(var(--wrm-blob-rgb)). */
const hslToRgbTriple = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l)
  const ch = (n: number): number => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
  }
  return `${ch(0)}, ${ch(8)}, ${ch(4)}`
}

const hexToRgbTriple = (hex: string): string | null => {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/** Скан обложки не бесплатный, а слайды листаются туда-сюда — кешируем. */
const blobCache = new Map<string, string | null>()

/**
 * Цвет круга под текущим слайдом: у слайда площадок — её брендовый цвет
 * (SoundCloud даёт тот самый рыжий круг), у остальных — доминанта обложки
 * топ-трека. null → CSS сам возьмёт акцент темы.
 */
const useBlobRgb = (d: WrappedData | undefined, slide: SlideId | undefined): string | null => {
  const libTracks = useLibStore((s) => s.tracks)

  const brand = slide === 'sources' && d?.sources.length ? providerBrandColor(d.sources[0]!.src) : null
  const cover = !brand && d?.topTracks.length ? coverOf(d.topTracks[0]!, libTracks) : null

  const [rgb, setRgb] = useState<string | null>(null)

  useEffect(() => {
    if (brand) {
      setRgb(hexToRgbTriple(brand))
      return
    }
    if (!cover) {
      setRgb(null)
      return
    }
    const hit = blobCache.get(cover)
    if (hit !== undefined) {
      setRgb(hit)
      return
    }
    let cancelled = false
    void extractCoverHsl(cover).then((hsl) => {
      const val = hsl
        ? hslToRgbTriple(hsl.h, Math.max(BLOB_S_MIN, Math.min(BLOB_S_MAX, hsl.s)), BLOB_L)
        : null
      blobCache.set(cover, val)
      if (!cancelled) setRgb(val)
    })
    return () => {
      cancelled = true
    }
  }, [brand, cover])

  return rgb
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

// ── Клик по треку: играем топ периода ──────────────────────────────────────

/** Секунды → «m:ss» (у заглушки трека dur обязателен). */
const fmtDur = (sec: number): string =>
  sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '—'

/**
 * Заглушка трека из снимка журнала. Резолверам площадок хватает id и флага
 * провайдера (`scId` / `ymTrackId` / `ytmVideoId` восстанавливаются из самого
 * id — см. scTrackId/ymTrackId/ytmTrackId в мапперах). Локальный трек так не
 * поднять: у него нет ни ссылки, ни пути, поэтому — null.
 */
const stubFromMeta = (tr: WrappedTrack, cover: string | null): Track | null => {
  const base = { id: tr.id, name: tr.name || '', artist: tr.artist || '', dur: fmtDur(tr.sec), cover }
  if (tr.id.startsWith('sc_')) {
    const scId = Number(tr.id.slice(3))
    return Number.isFinite(scId) ? { ...base, _sc: true, _scTemp: true, scId } : null
  }
  if (tr.id.startsWith('ym_')) return { ...base, _ym: true, _ymTemp: true, ymTrackId: tr.id.slice(3) }
  if (tr.id.startsWith('ytm_')) return { ...base, _ytm: true, _ytmTemp: true, ytmVideoId: tr.id.slice(4) }
  return null
}

type LibTrack = { id: string; cover?: string | null }

/** Трек известен плееру (библиотека/реестр) — или мы кладём заглушку в реестр. */
const ensurePlayable = (tr: WrappedTrack, libTracks: LibTrack[]): boolean => {
  if (libTracks.some((l) => l.id === tr.id) || trackRegistry.get(tr.id)) return true
  const stub = stubFromMeta(tr, coverOf(tr, libTracks))
  if (!stub) return false
  trackRegistry.put(stub, { temp: true })
  return true
}

/**
 * Запустить топ периода с выбранного трека — как клик по строке в библиотеке.
 * Журнал переживает перезапуски, а реестр треков живёт в сессии, поэтому всё,
 * что плеер уже не помнит, восстанавливаем заглушкой. Что поднять не удалось
 * (пропавший локальный файл), в очередь не попадает; если это и был выбранный
 * трек — клик просто ничего не делает, и модалка остаётся открытой.
 */
const playWrappedTop = (d: WrappedData, libTracks: LibTrack[], startId: string, label: string): boolean => {
  const ids = d.topTracks.filter((tr) => ensurePlayable(tr, libTracks)).map((tr) => tr.id)
  if (!ids.includes(startId)) return false
  playFromSource(ids, { kind: 'sc', label }, startId)
  return true
}

// ── Слайды ─────────────────────────────────────────────────────────────────

/**
 * `onLeave` — клик увёл пользователя из модалки (запустился трек, открылась
 * страница артиста): её надо закрыть, иначе она перекроет то, куда ушли.
 */
const Slide = ({ id, d, onLeave }: { id: SlideId; d: WrappedData; onLeave: () => void }) => {
  switch (id) {
    case 'intro': return <IntroSlide d={d} />
    case 'time': return <TimeSlide d={d} />
    case 'counts': return <CountsSlide d={d} />
    case 'tracks': return <TracksSlide d={d} onLeave={onLeave} />
    case 'artists': return <ArtistsSlide d={d} onLeave={onLeave} />
    case 'sources': return <SourcesSlide d={d} />
    case 'discover': return <DiscoverSlide d={d} onLeave={onLeave} />
    case 'habits': return <HabitsSlide d={d} />
    case 'share': return <ShareSlide d={d} />
  }
}

/**
 * Клик по артисту — его страница (DetailView), как по имени артиста в треке.
 *
 * Глобальный делегат `.tra-link` из App.tsx здесь НЕ используется намеренно:
 * он висит на document в фазе ЗАХВАТА и делает stopPropagation, поэтому до
 * обработчиков самой строки клик не доходит — а модалку надо закрыть, иначе она
 * перекроет страницу, на которую только что ушли. Резолв тут тот же самый.
 */
const openWrappedArtist = async (name: string, src: string): Promise<void> => {
  // Площадку выбираем ТОЙ ЖЕ функцией, что и поиск аватара: разъедься они —
  // в топе была бы аватарка с одной площадки, а переход вёл бы на другую.
  const providerId = artistProviderOf(src)
  const prov = getProvider(providerId)
  if (!prov?.resolveArtistByName) return
  let target: { id: string; title: string; cover?: string | null } | null = null
  try {
    target = await prov.resolveArtistByName(name)
  } catch (e) {
    console.warn('[wrapped] artist resolve failed', name, e)
    return
  }
  if (!target) return
  useDetailStore.getState().open({
    kind: 'artist',
    providerId,
    id: target.id,
    title: target.title,
    cover: target.cover ?? null,
    round: true,
  })
}

/** Общий обработчик строк/чипов с артистом: закрываем модалку и уходим к нему. */
const makeArtistClick = (onLeave: () => void) => (a: WrappedArtist) => {
  onLeave()
  void openWrappedArtist(a.name, a.src)
}

/**
 * Имена артистов трека — каждое своей ссылкой (строка бывает мультиартистной:
 * «reidenshi, Øneheart»). Живёт ВНУТРИ кликабельной строки трека, поэтому клик
 * гасим `stopPropagation` — иначе вместе с переходом запускался бы и трек.
 */
const TrackArtists = ({ tr, onOpen }: { tr: WrappedTrack; onOpen: (a: WrappedArtist) => void }) => (
  <>
    {parseArtists(tr.artist).map((name, i) => (
      <Fragment key={name + i}>
        {i > 0 && <span className="wrm-a-sep">, </span>}
        <span
          className="wrm-a"
          onClick={(e) => {
            e.stopPropagation()
            onOpen({ name, plays: tr.plays, cover: tr.cover, src: tr.src })
          }}
        >
          {name}
        </span>
      </Fragment>
    ))}
  </>
)

/** Подкол для скудных итогов — пользователь просил именно так. */
const useJoke = (d: WrappedData): string | null => {
  const t = useT()
  if (d.uniqueTracks === 1) return t('wrapped.joke.oneTrack')
  if (d.plays < JOKE_TINY) return t('wrapped.joke.tiny')
  if (d.plays < JOKE_SMALL) return t('wrapped.joke.small')
  return null
}

/** Огромное число с мелкой подписью сбоку — главный приём всей модалки. */
const Num = ({ n, word, delay = 0 }: { n: string; word: string; delay?: number }) => (
  <div className="wrm-num wrm-in" style={{ animationDelay: `${delay}ms` }}>
    <b>{n}</b>
    <i>{word}</i>
  </div>
)

const IntroSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const joke = useJoke(d)
  return (
    <div className="wrm-slide wrm-slide-intro">
      <div className="wrm-in wrm-kicker">{periodDatesLabel(d.range, loc)}</div>
      <div className="wrm-in wrm-h1" style={{ animationDelay: '60ms' }}>
        {t(`wrapped.intro.${d.range.kind}` as TranslationKey)}
      </div>
      <div className="wrm-in wrm-sub" style={{ animationDelay: '120ms' }}>{t('wrapped.intro.sub')}</div>
      {joke && <div className="wrm-in wrm-joke" style={{ animationDelay: '200ms' }}>{joke}</div>}
    </div>
  )
}

const TimeSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const parts = splitListenTime(loc, d.sec)
  return (
    <div className="wrm-slide wrm-slide-split">
      <div className="wrm-in wrm-h2">{t('wrapped.time.kicker')}</div>
      <div className="wrm-nums">
        {parts.length ? (
          parts.map((p, i) => (
            <Num key={p.word} n={p.n.toLocaleString(loc)} word={p.word} delay={140 + i * 90} />
          ))
        ) : (
          <div className="wrm-in wrm-h1">{t('wrapped.time.lessThanMin')}</div>
        )}
        <div className="wrm-in wrm-sub wrm-nums-foot" style={{ animationDelay: '320ms' }}>
          {t('wrapped.time.sub', { n: String(d.plays) })}
        </div>
      </div>
    </div>
  )
}

const CountsSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const rows: [number, string][] = [
    [d.plays, pluralWord(loc, d.plays, 'plays')],
    [d.uniqueTracks, pluralWord(loc, d.uniqueTracks, 'tracks')],
    [d.uniqueArtists, pluralWord(loc, d.uniqueArtists, 'artists')],
  ]
  return (
    <div className="wrm-slide wrm-slide-split">
      <div className="wrm-in wrm-h2">{t('wrapped.counts.title')}</div>
      <div className="wrm-nums sm">
        {rows.map(([n, word], i) => (
          <Num key={word} n={n.toLocaleString(loc)} word={word} delay={140 + i * 90} />
        ))}
        {d.newTracksCount > 0 && (
          <div className="wrm-in wrm-sub wrm-nums-foot" style={{ animationDelay: '420ms' }}>
            {t('wrapped.counts.newTracks', { n: String(d.newTracksCount) })}
          </div>
        )}
      </div>
    </div>
  )
}

const TracksSlide = ({ d, onLeave }: { d: WrappedData; onLeave: () => void }) => {
  const t = useT()
  const loc = useLocale()
  const libTracks = useLibStore((s) => s.tracks)

  // Клик по треку запускает весь топ периода с него — как строка в библиотеке.
  const play = (id: string) => {
    if (playWrappedTop(d, libTracks, id, t(`wrapped.${d.range.kind}` as TranslationKey))) onLeave()
  }
  // Клик по имени артиста под треком уводит на его страницу.
  const onArtist = makeArtistClick(onLeave)

  const [first, ...rest] = d.topTracks
  if (!first) return null
  const cover = coverOf(first, libTracks)
  return (
    <div className="wrm-slide">
      {/* Кикера («На повторе») тут нет намеренно: обложка с числом сама говорит,
          о чём слайд, а надпись только отжимала героя вниз. */}

      {/* Герой — трек №1: крупная обложка и огромное число повторов рядом.
          Как и строки списка, это div: внутри своя ссылка на артиста. */}
      <div
        className="wrm-hero hit wrm-in"
        role="button"
        tabIndex={0}
        style={{ animationDelay: '90ms' }}
        onClick={() => play(first.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            play(first.id)
          }
        }}
      >
        <span className="wrm-hero-cov">
          {cover ? <img src={cover} alt="" /> : <Ico name="note" width={28} height={28} />}
        </span>
        <span className="wrm-hero-txt">
          <span className="wrm-num">
            <b>{first.plays.toLocaleString(loc)}</b>
            <i>{pluralWord(loc, first.plays, 'times')}</i>
          </span>
          <span className="wrm-hero-name">{first.name || t('common.track')}</span>
          <span className="wrm-hero-sub">
            <TrackArtists tr={first} onOpen={onArtist} />
          </span>
        </span>
      </div>

      {rest.length > 0 && (
        <div className="wrm-list wide">
          {rest.map((tr, i) => (
            <TrackRow key={tr.id} tr={tr} loc={loc} delay={200 + i * 70} onPlay={play} onArtist={onArtist} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Строка топ-трека. Номера места здесь НЕТ, а счётчик — голое число: у трека
 * место читается по обложке и порядку, а «6 прослушиваний» в каждой строке
 * забивало бы её длиннее самого названия (у артистов иначе — там номер нужен,
 * см. ArtistRow).
 */
const TrackRow = ({
  tr,
  loc,
  delay,
  onPlay,
  onArtist,
}: {
  tr: WrappedTrack
  loc: string
  delay: number
  onPlay: (id: string) => void
  onArtist: (a: WrappedArtist) => void
}) => {
  const t = useT()
  const libTracks = useLibStore((s) => s.tracks)
  const cover = coverOf(tr, libTracks)
  // Не <button>: внутри строки живут свои ссылки-артисты, а кнопка в кнопке —
  // невалидная разметка. Кликабельность строке даёт класс .hit (см. wrapped.css).
  return (
    <div
      className="wrm-row hit wrm-in"
      role="button"
      tabIndex={0}
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => onPlay(tr.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPlay(tr.id)
        }
      }}
    >
      <span className="wrm-row-cov">
        {cover ? <img src={cover} alt="" /> : <Ico name="note" width={18} height={18} />}
      </span>
      <span className="wrm-row-info">
        <span className="wrm-row-name">{tr.name || t('common.track')}</span>
        <span className="wrm-row-sub">
          <TrackArtists tr={tr} onOpen={onArtist} />
        </span>
      </span>
      <span className="wrm-row-val num">{tr.plays.toLocaleString(loc)}</span>
    </div>
  )
}

const ArtistsSlide = ({ d, onLeave }: { d: WrappedData; onLeave: () => void }) => {
  const t = useT()
  const loc = useLocale()
  // Каждый артист ищется у своей площадки — той, где его слушали (см. хук).
  const refs = useMemo(() => d.topArtists.map((a) => ({ name: a.name, source: a.src })), [d])
  const avas = useArtistAvatars(refs)
  const onArtist = makeArtistClick(onLeave)
  const [first, ...rest] = d.topArtists
  if (!first) return null
  const ava = avas[artistAvatarKey(first.src, first.name)] || first.cover
  return (
    <div className="wrm-slide wrm-slide-c">
      {/* Герой — артист №1 по центру, как на референсе. Клик открывает его страницу. */}
      <button
        className="wrm-hero-c artist hit wrm-in"
        style={{ animationDelay: '80ms' }}
        onClick={() => onArtist(first)}
      >
        <span className="wrm-hero-ava">
          {ava ? <img src={ava} alt="" /> : <Ico name="user" width={44} height={44} />}
        </span>
        <span className="wrm-hero-name">{first.name}</span>
        <span className="wrm-hero-sub">{plural(loc, first.plays, 'times')}</span>
      </button>

      {rest.length > 0 && (
        <div className="wrm-list">
          {rest.map((a, i) => (
            <ArtistRow
              key={a.name}
              a={a}
              n={i + 2}
              ava={avas[artistAvatarKey(a.src, a.name)] || a.cover}
              loc={loc}
              delay={200 + i * 70}
              onOpen={onArtist}
            />
          ))}
        </div>
      )}

      <div className="wrm-in wrm-note" style={{ animationDelay: '460ms' }}>
        {t('wrapped.artists.total', {
          n: String(d.uniqueArtists),
          word: pluralWord(loc, d.uniqueArtists, 'artists'),
        })}
      </div>
    </div>
  )
}

const ArtistRow = ({
  a,
  n,
  ava,
  loc,
  delay,
  onOpen,
}: {
  a: WrappedArtist
  n: number
  ava: string | null
  loc: string
  delay: number
  onOpen: (a: WrappedArtist) => void
}) => (
  <button
    className="wrm-row hit wrm-in"
    style={{ animationDelay: `${delay}ms` }}
    onClick={() => onOpen(a)}
  >
    <span className="wrm-row-n">{String(n).padStart(2, '0')}</span>
    <span className="wrm-row-cov round">
      {ava ? <img src={ava} alt="" /> : <Ico name="user" width={17} height={17} />}
    </span>
    <span className="wrm-row-info">
      <span className="wrm-row-name">{a.name}</span>
    </span>
    <span className="wrm-row-val">{plural(loc, a.plays, 'times')}</span>
  </button>
)

const SourcesSlide = ({ d }: { d: WrappedData }) => {
  const t = useT()
  const loc = useLocale()
  const [top, ...rest] = d.sources
  if (!top) return null
  const TopLogo = SOURCE_LOGOS[top.src] ?? HddLogo
  const topName = SOURCE_NAMES[top.src] ?? t('stats.localFiles')
  return (
    <div className="wrm-slide wrm-slide-c">
      <div className="wrm-in wrm-kicker">{t('wrapped.sources.kicker')}</div>

      {/* Герой — главная площадка: её логотип крупно и число прослушиваний. */}
      <div className="wrm-hero-c wrm-in" style={{ animationDelay: '90ms' }}>
        <span className="wrm-src-mark" style={{ color: providerBrandColor(top.src) ?? '#fff' }}>
          <TopLogo size={52} />
        </span>
        <span className="wrm-num">
          <b>{top.plays.toLocaleString(loc)}</b>
          <i>{pluralWord(loc, top.plays, 'plays')}</i>
        </span>
        <span className="wrm-hero-sub">{topName}</span>
      </div>

      {rest.length > 0 && (
        <div className="wrm-srcs">
          {rest.map((s, i) => {
            const Logo = SOURCE_LOGOS[s.src] ?? HddLogo
            const color = providerBrandColor(s.src) ?? 'var(--accent)'
            const pct = d.plays ? Math.round((s.plays / d.plays) * 100) : 0
            return (
              <div className="wrm-src wrm-in" key={s.src} style={{ animationDelay: `${240 + i * 80}ms` }}>
                <div className="wrm-src-head">
                  <span className="wrm-src-logo" style={{ color }}>
                    <Logo size={14} />
                  </span>
                  <span className="wrm-src-name">{SOURCE_NAMES[s.src] ?? t('stats.localFiles')}</span>
                  <span className="wrm-src-pct">{pct}%</span>
                </div>
                <div className="wrm-src-bar">
                  <i style={{ width: `${Math.round((s.plays / top.plays) * 100)}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const DiscoverSlide = ({ d, onLeave }: { d: WrappedData; onLeave: () => void }) => {
  const t = useT()
  const loc = useLocale()
  const refs = useMemo(() => d.newArtists.map((a) => ({ name: a.name, source: a.src })), [d])
  const onArtist = makeArtistClick(onLeave)
  const avas = useArtistAvatars(refs)
  return (
    <div className="wrm-slide wrm-slide-split">
      <div className="wrm-in wrm-kicker">{t('wrapped.discover.kicker')}</div>
      <div className="wrm-in wrm-h1" style={{ animationDelay: '70ms' }}>
        {t('wrapped.discover.title', {
          n: String(d.newArtistsCount),
          word: pluralWord(loc, d.newArtistsCount, 'artists'),
        })}
      </div>
      <div className="wrm-chips">
        {d.newArtists.map((a, i) => {
          const ava = avas[artistAvatarKey(a.src, a.name)] || a.cover
          return (
            <button
              className="wrm-chip wrm-in"
              key={a.name}
              style={{ animationDelay: `${160 + i * 80}ms` }}
              onClick={() => onArtist(a)}
            >
              <span className="wrm-chip-ava">
                {ava ? <img src={ava} alt="" /> : <Ico name="user" width={13} height={13} />}
              </span>
              {a.name}
            </button>
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
    <div className="wrm-slide">
      <div className="wrm-in wrm-kicker">{t('wrapped.habits.kicker')}</div>
      <div className="wrm-in wrm-h2" style={{ animationDelay: '70ms' }}>
        {night ? t('wrapped.habits.night') : t('wrapped.habits.day')}
      </div>

      <div className="wrm-hours wrm-in" style={{ animationDelay: '150ms' }}>
        {d.hours.map((n, h) => (
          <i
            key={h}
            className={h === d.peakHour ? 'peak' : undefined}
            style={{ height: `${Math.max(3, Math.round((n / max) * 100))}%` }}
          />
        ))}
      </div>
      <div className="wrm-axis wrm-in" style={{ animationDelay: '190ms' }}>
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>

      <div className="wrm-facts">
        <Fact l={t('wrapped.habits.peak')} v={fmtHourRange(d.peakHour)} delay={250} />
        {d.recordDay && (
          <Fact
            l={t('wrapped.habits.record')}
            v={`${plural(loc, d.recordDay.plays, 'tracks')} · ${recordDate}`}
            delay={300}
          />
        )}
        <Fact l={t('wrapped.habits.streak')} v={plural(loc, d.streak, 'days')} delay={350} />
        <Fact l={t('wrapped.habits.active')} v={plural(loc, d.activeDays, 'days')} delay={400} />
      </div>
    </div>
  )
}

const Fact = ({ l, v, delay }: { l: string; v: string; delay: number }) => (
  <div className="wrm-fact wrm-in" style={{ animationDelay: `${delay}ms` }}>
    <div className="wrm-fact-l">{l}</div>
    <div className="wrm-fact-v">{v}</div>
  </div>
)

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
    <div className="wrm-slide wrm-slide-share">
      <div className="wrm-in wrm-kicker">{t('wrapped.share.kicker')}</div>
      <div className="wrm-poster wrm-in" style={{ animationDelay: '100ms' }}>
        {url ? <img src={url} alt="" /> : <div className="wrm-spin" />}
      </div>
      {/* Кнопка сохранения — здесь, в слайде: под карточкой стоит «Закрыть». */}
      <button
        className="wrm-btn ghost wrm-in"
        style={{ animationDelay: '200ms' }}
        onClick={save}
        disabled={!url}
      >
        <Ico name="download" width={14} height={14} />
        {t('wrapped.share.save')}
      </button>
    </div>
  )
}
