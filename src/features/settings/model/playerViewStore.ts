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
/** Стиль плеера: обычный / пластинка / большой (style-large). */
export type PlayerStyle = 'standard' | 'vinyl' | 'large'
/** Тип слайдера прогресса/громкости. */
export type SliderType = 'default' | 'thin' | 'ios' | 'wave'
/** Вид визуализатора: волна (осциллограф) / столбцы (спектр). */
export type VizType = 'wave' | 'bars'
/** Положение блока очереди в плеере. */
export type QueuePos = 'left' | 'bottom' | 'right'
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

export interface PlayerViewPrefs {
  titleAlign: TitleAlign
  /** Стиль плеера. */
  playerStyle: PlayerStyle
  covBtnsInBar: boolean
  ambientGlow: boolean
  parallax: boolean
  sliderType: SliderType
  queuePos: QueuePos
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
  /** Нижний бар включён (preset 'off' → false, toggleMiniPlayer). */
  mpEnabled: boolean
  mpBgMode: MpBgMode
  mpProgress: MpProgress
  mpCoverShape: MpCoverShape
}

const DEFAULTS: PlayerViewPrefs = {
  titleAlign: 'center',
  playerStyle: 'standard',
  covBtnsInBar: false,
  ambientGlow: false,
  parallax: false,
  sliderType: 'default',
  queuePos: 'bottom',
  hideQueue: false,
  lyricsInQueue: false,
  showNextTrack: false,
  vizEnabled: false,
  vizType: 'bars',
  playerBarPos: 'bottom',
  mpEnabled: true,
  mpBgMode: 'theme',
  mpProgress: { line: true, bg: false, circle: false },
  mpCoverShape: 'default',
}

/** Пресеты мини-плеера. */
export const MP_PRESETS: Record<string, { enabled: boolean; bg?: MpBgMode; progress?: MpProgress; cover?: MpCoverShape }> = {
  off: { enabled: false },
  full: { enabled: true, bg: 'theme', progress: { line: true, bg: false, circle: false }, cover: 'default' },
  rounded: { enabled: true, bg: 'theme', progress: { line: false, bg: false, circle: true }, cover: 'round' },
  hybrid: { enabled: true, bg: 'theme', progress: { line: false, bg: true, circle: false }, cover: 'default' },
  deck: { enabled: true, bg: 'cover', progress: { line: false, bg: true, circle: false }, cover: 'default' },
}

/** Имя активного пресета по текущим настройкам ('' — нет совпадения). */
export const matchMpPreset = (p: PlayerViewPrefs): string => {
  if (!p.mpEnabled) return 'off'
  for (const [name, preset] of Object.entries(MP_PRESETS)) {
    if (!preset.enabled || !preset.bg || !preset.progress || !preset.cover) continue
    if (
      p.mpBgMode === preset.bg &&
      p.mpCoverShape === preset.cover &&
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
      playerStyle: p.playerStyle === 'vinyl' || p.playerStyle === 'large' ? p.playerStyle : 'standard',
      covBtnsInBar: !!p.covBtnsInBar,
      ambientGlow: !!p.ambientGlow,
      parallax: !!p.parallax,
      sliderType:
        p.sliderType === 'thin' || p.sliderType === 'ios' || p.sliderType === 'wave' ? p.sliderType : 'default',
      queuePos: p.queuePos === 'left' || p.queuePos === 'right' ? p.queuePos : 'bottom',
      hideQueue: !!p.hideQueue,
      lyricsInQueue: !!p.lyricsInQueue,
      showNextTrack: !!p.showNextTrack,
      vizEnabled: !!p.vizEnabled,
      vizType: p.vizType === 'wave' ? 'wave' : 'bars',
      playerBarPos:
        p.playerBarPos === 'top' || p.playerBarPos === 'left' || p.playerBarPos === 'right' ? p.playerBarPos : 'bottom',
      mpEnabled: p.mpEnabled !== false,
      mpBgMode: p.mpBgMode === 'cover' || p.mpBgMode === 'coverColor' ? p.mpBgMode : 'theme',
      mpProgress: {
        line: p.mpProgress ? !!p.mpProgress.line : true,
        bg: !!(p.mpProgress && p.mpProgress.bg),
        circle: !!(p.mpProgress && p.mpProgress.circle),
      },
      mpCoverShape: p.mpCoverShape === 'round' ? 'round' : 'default',
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
        hideQueue: s.hideQueue,
        lyricsInQueue: s.lyricsInQueue,
        showNextTrack: s.showNextTrack,
        vizEnabled: s.vizEnabled,
        vizType: s.vizType,
        playerBarPos: s.playerBarPos,
        mpEnabled: s.mpEnabled,
        mpBgMode: s.mpBgMode,
        mpProgress: s.mpProgress,
        mpCoverShape: s.mpCoverShape,
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
export const BODY_SLIDER_CLASSES = ['slider-thin', 'slider-ios', 'slider-wave'] as const

/** Body-класс для текущего типа слайдера (default → нет класса). */
export const bodySliderClass = (t: SliderType): string | null =>
  t === 'default' ? null : `slider-${t}`
