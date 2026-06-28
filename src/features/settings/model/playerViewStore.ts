import { create } from 'zustand'

/**
 * Предпочтения раздела «Плеер» (`#ssec-view`). Persist в
 * `localStorage['bloom_view_prefs']`.
 *
 * Перенесена РАБОЧАЯ часть (даёт эффект с текущей инфрой плеера):
 *   - titleAlign    — выравнивание заголовка (класс `.title-left/.title-right`
 *                     на `#playerContent`, setTitleAlign)
 *   - covBtnsInBar  — перенести ♥/+ с обложки в панель управления
 *                     (класс `.app.cov-btns-in-bar`, toggleCovBtnsInBar)
 *   - ambientGlow   — свечение обложки в цвет акцента (boxShadow на `.ps-cover`,
 *                     updateAmbientGlow)
 *   - parallax      — 3D-наклон обложки по мыши (transform на `.ps-cover`,
 *                     PARALLAX 3D TILT)
 *
 * Классы `.app` навешивает App.tsx, `#playerContent`/`.ps-cover` эффекты —
 * PagePlayer (читает этот стор напрямую).
 *
 * Отложено (тяжёлая инфра, отдельными заходами): стиль плеера (vinyl/large),
 * тип слайдера (default/thin/ios/wave), положение очереди (left/bottom/right),
 * текст-вместо-очереди/караоке/скрыть-очередь/след.трек, мини-плеер
 * (пресеты/фон/прогресс/форма/позиция), визуализатор.
 */

export type TitleAlign = 'left' | 'center' | 'right'
/** Стиль плеера: обычный / пластинка / большой (style-large) / кино (style-cinema). */
export type PlayerStyle = 'standard' | 'vinyl' | 'large' | 'cinema'
/** Тип слайдера прогресса/громкости. ('cover' — ползунок-обложка трека.) */
export type SliderType = 'default' | 'thin' | 'ios' | 'wave' | 'cover'
/** Вид визуализатора: волна (осциллограф) / столбцы (спектр). */
export type VizType = 'wave' | 'bars'
/** Положение блока очереди в плеере. */
export type QueuePos = 'left' | 'bottom' | 'right'
/** Вид списка очереди: обычный (плоский) / расширенный (с разделами «прослушано/сейчас/далее»). */
export type QueueView = 'normal' | 'extended'
/** Позиция нижнего бара мини-плеера. */
export type PlayerBarPos = 'bottom' | 'top' | 'left' | 'right'
/** Фон нижнего бара мини-плеера. */
export type MpBgMode = 'theme' | 'cover' | 'coverColor'
/** Форма обложки в баре. */
export type MpCoverShape = 'default' | 'round'
/** Режимы прогресса бара (мульти-выбор, _mpProgressMode; circle отложен). */
export interface MpProgress {
  line: boolean
  bg: boolean
  circle: boolean
}
/** Режим оверлея-«острова»: выключен / плашка / компактная плашка (раскрытие по наведению) / полоса (круг-play + стеклянная полоса с названием + круг-визуализатор). */
export type OverlayMode = 'off' | 'island' | 'compact' | 'bar'
/** Якорь оверлея на экране: верт. (t/b) + гориз. (l/c/r); `custom` — свободная
 *  позиция, заданная вручную перетаскиванием (доли overlayX/overlayY). */
export type OverlayPos = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br' | 'custom'
/** Скрытые элементы бара (true = скрыт). */
export interface MpHide {
  lyrics: boolean
  queue: boolean
  bigpic: boolean
  shuffle: boolean
  repeat: boolean
  time: boolean
  fav: boolean
}

export interface PlayerViewPrefs {
  titleAlign: TitleAlign
  /** Стиль плеера. */
  playerStyle: PlayerStyle
  covBtnsInBar: boolean
  ambientGlow: boolean
  parallax: boolean
  sliderType: SliderType
  queuePos: QueuePos
  /** Вид списка очереди (обычный / расширенный). */
  queueView: QueueView
  /** Скрыть блок очереди в плеере. */
  hideQueue: boolean
  /** Текст песни вместо списка очереди. */
  lyricsInQueue: boolean
  /** Показать след. трек под контролами (только при hideQueue, toggleShowNextTrack). */
  showNextTrack: boolean
  /** Визуализатор (анимация волн под музыку, toggleViz). */
  vizEnabled: boolean
  /** Вид визуализатора (волна / столбцы). */
  vizType: VizType
  /** Позиция нижнего бара. */
  playerBarPos: PlayerBarPos
  /** Бар поверх контента (overlay), не отодвигает его. Только для bottom/top. */
  mpFloating: boolean
  /** Компактный бар (узкий, по центру), не во всю ширину. Только для bottom/top. */
  mpCompact: boolean
  /** Нижний бар включён (preset 'off' → false, toggleMiniPlayer). */
  mpEnabled: boolean
  mpBgMode: MpBgMode
  mpProgress: MpProgress
  mpCoverShape: MpCoverShape
  /** Скруглённый вид бара (сильно скруглённые края — pill). Входит в пресет «Закруглённый». */
  mpRounded: boolean
  /** Скрытые элементы бара (true = скрыт). */
  mpHide: MpHide
  /** Оверлей-«остров» now-playing поверх всех окон: режим. */
  overlayMode: OverlayMode
  /** Позиция оверлея на экране. */
  overlayPos: OverlayPos
  /** Свободная позиция (доля рабочей области, 0..1) по горизонтали — для `overlayPos==='custom'`. */
  overlayX: number
  /** Свободная позиция (доля рабочей области, 0..1) по вертикали — для `overlayPos==='custom'`. */
  overlayY: number
  /** Прозрачность плашки оверлея (0–100). */
  overlayOpacity: number
  /** Масштаб плашки оверлея в процентах (50–150). */
  overlaySize: number
  /** Длительность авто-показа плашки на смену трека, сек (2–10). */
  overlayDuration: number
  /** Всплывать ли оверлею автоматически при смене трека. */
  overlayOnTrackChange: boolean
  /** Разрешить перемотку трека кликом/скрабом по прогресс-бару оверлея. */
  overlaySeek: boolean
  /** Режим оптимизации: убрать эквалайзер и отключить бегущую строку. */
  overlayPerf: boolean
}

const DEFAULTS: PlayerViewPrefs = {
  titleAlign: 'center',
  playerStyle: 'standard',
  covBtnsInBar: false,
  ambientGlow: false,
  parallax: false,
  sliderType: 'default',
  queuePos: 'bottom',
  queueView: 'normal',
  hideQueue: false,
  lyricsInQueue: false,
  showNextTrack: false,
  vizEnabled: false,
  vizType: 'bars',
  playerBarPos: 'bottom',
  mpFloating: false,
  mpCompact: false,
  mpEnabled: true,
  mpBgMode: 'theme',
  mpProgress: { line: true, bg: false, circle: false },
  mpCoverShape: 'default',
  mpRounded: false,
  mpHide: { lyrics: false, queue: false, bigpic: false, shuffle: false, repeat: false, time: false, fav: false },
  overlayMode: 'off',
  overlayPos: 'tr',
  overlayX: 0.98,
  overlayY: 0.02,
  overlayOpacity: 90,
  overlaySize: 100,
  overlayDuration: 4,
  overlayOnTrackChange: true,
  overlaySeek: false,
  overlayPerf: false,
}

const OVERLAY_POSITIONS: OverlayPos[] = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']
const clampNum = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def
  return Math.max(min, Math.min(max, n))
}

/** Пресеты мини-плеера. */
export const MP_PRESETS: Record<string, { enabled: boolean; bg?: MpBgMode; progress?: MpProgress; cover?: MpCoverShape; rounded?: boolean }> = {
  off: { enabled: false },
  full: { enabled: true, bg: 'theme', progress: { line: true, bg: false, circle: false }, cover: 'default', rounded: false },
  rounded: { enabled: true, bg: 'theme', progress: { line: false, bg: false, circle: true }, cover: 'round', rounded: true },
  hybrid: { enabled: true, bg: 'theme', progress: { line: false, bg: true, circle: false }, cover: 'default', rounded: false },
  deck: { enabled: true, bg: 'cover', progress: { line: false, bg: true, circle: false }, cover: 'default', rounded: false },
}

/** Имя активного пресета по текущим настройкам ('' — нет совпадения). */
export const matchMpPreset = (p: PlayerViewPrefs): string => {
  if (!p.mpEnabled) return 'off'
  for (const [name, preset] of Object.entries(MP_PRESETS)) {
    if (!preset.enabled || !preset.bg || !preset.progress || !preset.cover) continue
    if (
      p.mpBgMode === preset.bg &&
      p.mpCoverShape === preset.cover &&
      p.mpRounded === !!preset.rounded &&
      p.mpProgress.line === preset.progress.line &&
      p.mpProgress.bg === preset.progress.bg &&
      p.mpProgress.circle === preset.progress.circle
    ) {
      return name
    }
  }
  return ''
}

const LS_KEY = 'bloom_view_prefs'

const load = (): PlayerViewPrefs => {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (!p || typeof p !== 'object') return { ...DEFAULTS }
    return {
      titleAlign: p.titleAlign === 'left' || p.titleAlign === 'right' ? p.titleAlign : 'center',
      playerStyle:
        p.playerStyle === 'vinyl' || p.playerStyle === 'large' || p.playerStyle === 'cinema'
          ? p.playerStyle
          : 'standard',
      covBtnsInBar: !!p.covBtnsInBar,
      ambientGlow: !!p.ambientGlow,
      parallax: !!p.parallax,
      sliderType:
        p.sliderType === 'thin' || p.sliderType === 'ios' || p.sliderType === 'wave' || p.sliderType === 'cover'
          ? p.sliderType
          : 'default',
      queuePos: p.queuePos === 'left' || p.queuePos === 'right' ? p.queuePos : 'bottom',
      queueView: p.queueView === 'extended' ? 'extended' : 'normal',
      hideQueue: !!p.hideQueue,
      lyricsInQueue: !!p.lyricsInQueue,
      showNextTrack: !!p.showNextTrack,
      vizEnabled: !!p.vizEnabled,
      vizType: p.vizType === 'wave' ? 'wave' : 'bars',
      playerBarPos:
        p.playerBarPos === 'top' || p.playerBarPos === 'left' || p.playerBarPos === 'right' ? p.playerBarPos : 'bottom',
      mpFloating: !!p.mpFloating,
      mpCompact: !!p.mpCompact,
      mpEnabled: p.mpEnabled !== false,
      mpBgMode: p.mpBgMode === 'cover' || p.mpBgMode === 'coverColor' ? p.mpBgMode : 'theme',
      mpProgress: {
        line: p.mpProgress ? !!p.mpProgress.line : true,
        bg: !!(p.mpProgress && p.mpProgress.bg),
        circle: !!(p.mpProgress && p.mpProgress.circle),
      },
      mpCoverShape: p.mpCoverShape === 'round' ? 'round' : 'default',
      mpRounded: !!p.mpRounded,
      mpHide: {
        lyrics: !!(p.mpHide && p.mpHide.lyrics),
        queue: !!(p.mpHide && p.mpHide.queue),
        bigpic: !!(p.mpHide && p.mpHide.bigpic),
        shuffle: !!(p.mpHide && p.mpHide.shuffle),
        repeat: !!(p.mpHide && p.mpHide.repeat),
        time: !!(p.mpHide && p.mpHide.time),
        fav: !!(p.mpHide && p.mpHide.fav),
      },
      overlayMode:
        p.overlayMode === 'island' || p.overlayMode === 'compact' || p.overlayMode === 'bar'
          ? p.overlayMode
          : 'off',
      overlayPos: OVERLAY_POSITIONS.includes(p.overlayPos) || p.overlayPos === 'custom' ? p.overlayPos : 'tr',
      overlayX: clampNum(p.overlayX, 0, 1, 0.98),
      overlayY: clampNum(p.overlayY, 0, 1, 0.02),
      overlayOpacity: clampNum(p.overlayOpacity, 0, 100, 90),
      overlaySize: clampNum(p.overlaySize, 50, 150, 100),
      overlayDuration: clampNum(p.overlayDuration, 2, 10, 4),
      overlayOnTrackChange: p.overlayOnTrackChange !== false,
      overlaySeek: !!p.overlaySeek,
      overlayPerf: !!p.overlayPerf,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const persist = (s: PlayerViewPrefs): void => {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        titleAlign: s.titleAlign,
        playerStyle: s.playerStyle,
        covBtnsInBar: s.covBtnsInBar,
        ambientGlow: s.ambientGlow,
        parallax: s.parallax,
        sliderType: s.sliderType,
        queuePos: s.queuePos,
        queueView: s.queueView,
        hideQueue: s.hideQueue,
        lyricsInQueue: s.lyricsInQueue,
        showNextTrack: s.showNextTrack,
        vizEnabled: s.vizEnabled,
        vizType: s.vizType,
        playerBarPos: s.playerBarPos,
        mpFloating: s.mpFloating,
        mpCompact: s.mpCompact,
        mpEnabled: s.mpEnabled,
        mpBgMode: s.mpBgMode,
        mpProgress: s.mpProgress,
        mpCoverShape: s.mpCoverShape,
        mpRounded: s.mpRounded,
        mpHide: s.mpHide,
        overlayMode: s.overlayMode,
        overlayPos: s.overlayPos,
        overlayX: s.overlayX,
        overlayY: s.overlayY,
        overlayOpacity: s.overlayOpacity,
        overlaySize: s.overlaySize,
        overlayDuration: s.overlayDuration,
        overlayOnTrackChange: s.overlayOnTrackChange,
        overlaySeek: s.overlaySeek,
        overlayPerf: s.overlayPerf,
      }),
    )
  } catch {
    /* full → ignore */
  }
}

interface PlayerViewState extends PlayerViewPrefs {
  set: <K extends keyof PlayerViewPrefs>(key: K, value: PlayerViewPrefs[K]) => void
  /** Применить пресет мини-плеера. */
  applyMpPreset: (name: string) => void
  reset: () => void
}

export const usePlayerViewStore = create<PlayerViewState>((set, get) => ({
  ...load(),
  set: (key, value) => {
    set({ [key]: value } as Partial<PlayerViewState>)
    persist(get())
  },
  applyMpPreset: (name) => {
    const preset = MP_PRESETS[name]
    if (!preset) return
    if (!preset.enabled) {
      set({ mpEnabled: false })
    } else {
      set({
        mpEnabled: true,
        ...(preset.bg ? { mpBgMode: preset.bg } : {}),
        ...(preset.progress ? { mpProgress: { ...preset.progress } } : {}),
        ...(preset.cover ? { mpCoverShape: preset.cover } : {}),
        ...(preset.rounded !== undefined ? { mpRounded: preset.rounded } : {}),
      })
    }
    persist(get())
  },
  reset: () => {
    set({ ...DEFAULTS })
    persist({ ...DEFAULTS })
  },
}))

/** Классы для `.app` из view-префов (навешивает App.tsx). */
export const appClassesFromView = (p: PlayerViewPrefs): string[] => {
  const out: string[] = []
  if (p.covBtnsInBar) out.push('cov-btns-in-bar')
  return out
}

/** Все body-классы стиля слайдера (для императивного toggle, setSliderType). */
export const BODY_SLIDER_CLASSES = ['slider-thin', 'slider-ios', 'slider-wave', 'slider-cover'] as const

/** Body-класс для текущего типа слайдера (default → нет класса). */
export const bodySliderClass = (t: SliderType): string | null =>
  t === 'default' ? null : `slider-${t}`
