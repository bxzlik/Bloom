import { create } from 'zustand'

/** Какая боковая панель открыта внутри BigPicture (или ничего). */
export type BpPanel = 'none' | 'queue' | 'lyrics'

/**
 * Раскладка зоны текста: «Всё» (обложка + текст), «Обложка» (только обложка),
 * «Текст» (только текст на весь экран). Управляется селектором «Вид» в попапе
 * настроек. Значение `lyrView` актуально только когда `panel === 'lyrics'`.
 */
export type BpView = 'all' | 'cover' | 'text'

/**
 * Размеры шрифта текста в BigPicture: 4 пресета `{normal, active}` (px).
 * `_bpFontSizes`. По умолчанию — индекс 3.
 */
export const BP_FONT_SIZES: { normal: number; active: number }[] = [
  { normal: 19, active: 23 },
  { normal: 24, active: 29 },
  { normal: 30, active: 37 },
  { normal: 38, active: 46 },
]

/**
 * Полноэкранный режим обложки (#bigPicOverlay).
 * `openBigPic`/`closeBigPic` + `toggleBpQueue`/`toggleBpLyr` + шрифт/оффсет
 *.
 *
 * Одновременно открыта максимум ОДНА боковая панель (очередь ИЛИ текст):
 * `toggleQueue`/`toggleLyrics` взаимно закрывают друг друга,.
 */
export interface BigPicState {
  /** Оверлей открыт. */
  open: boolean
  /** Активная боковая панель (очередь/текст/ничего). */
  panel: BpPanel
  /** Открыт попап настроек шрифта/оффсета (правый верхний угол). */
  fontPanelOpen: boolean
  /** Раскладка зоны текста в режиме текста ('all' | 'text'); 'cover' = panel 'none'. */
  lyrView: 'all' | 'text'
  /** Индекс размера шрифта текста (0..3, см. BP_FONT_SIZES). */
  fontSize: number
  /** Сдвиг синхронизации текста в секундах (только для BigPicture, _bpOffset). */
  offset: number
  /**
   * Авто-открытие текста: на каждый заход в фуллскрин текст включается сам,
   * если он есть у трека. Любое ручное переключение панели гасит флаг — тогда
   * до выхода из фуллскрина раскладка остаётся такой, какой её оставили
   * (в т.ч. при смене трека).
   */
  autoLyr: boolean

  openBig: () => void
  closeBig: () => void
  toggleQueue: () => void
  toggleLyrics: () => void
  toggleFontPanel: () => void
  /** Переключить вид зоны текста (см. BpView). */
  setView: (v: BpView) => void
  setFontSize: (n: number) => void
  adjustOffset: (delta: number) => void
  resetOffset: () => void
}

export const useBigPicStore = create<BigPicState>((set) => ({
  open: false,
  panel: 'none',
  fontPanelOpen: false,
  lyrView: 'all',
  fontSize: 3,
  offset: 0,
  autoLyr: false,

  // Каждый заход — чистая раскладка + разрешённое авто-открытие текста.
  openBig: () =>
    set({ open: true, panel: 'none', fontPanelOpen: false, lyrView: 'all', autoLyr: true }),
  // Раскладку сбрасывает openBig, а не закрытие: оверлей ещё ~0.3с уезжает вниз
  // (BigPicture.tsx), и сброс panel здесь схлопнул бы текст/очередь прямо в
  // кадре анимации выхода.
  closeBig: () => set({ open: false, autoLyr: false }),
  toggleQueue: () =>
    set((s) => ({ panel: s.panel === 'queue' ? 'none' : 'queue', autoLyr: false })),
  // Открытие текста через кнопку всегда даёт раскладку «Всё».
  toggleLyrics: () =>
    set((s) =>
      s.panel === 'lyrics'
        ? { panel: 'none', autoLyr: false }
        : { panel: 'lyrics', lyrView: 'all', autoLyr: false },
    ),
  toggleFontPanel: () => set((s) => ({ fontPanelOpen: !s.fontPanelOpen })),
  // «Обложка» = просто без боковой панели; «Всё»/«Текст» открывают текст с нужной раскладкой.
  setView: (v) =>
    set(v === 'cover' ? { panel: 'none', autoLyr: false } : { panel: 'lyrics', lyrView: v, autoLyr: false }),
  setFontSize: (n) => set({ fontSize: n }),
  adjustOffset: (delta) =>
    set((s) => ({ offset: Math.round((s.offset + delta) * 10) / 10 })),
  resetOffset: () => set({ offset: 0 }),
}))
