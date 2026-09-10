import { create } from 'zustand'

/** Какая боковая панель открыта внутри BigPicture (или ничего). */
export type BpPanel = 'none' | 'lyrics'

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
 * `openBigPic`/`closeBigPic` + `toggleBpLyr` + шрифт/оффсет
 *.
 */
export interface BigPicState {
  /** Оверлей открыт. */
  open: boolean
  /** Активная боковая панель (текст/ничего). */
  panel: BpPanel
  /**
   * Попап настроек шрифта/вида/оффсета: координаты курсора, где он открыт, или
   * `null` — закрыт. Отдельной кнопки нет — попап вызывается ПКМ по любому
   * месту фуллскрина (кроме обложки, там своё меню трека).
   */
  fontPanelPos: { x: number; y: number } | null
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
  toggleLyrics: () => void
  /** Открыть попап настроек в точке курсора (ПКМ). */
  openFontPanel: (x: number, y: number) => void
  closeFontPanel: () => void
  /** Переключить вид зоны текста (см. BpView). */
  setView: (v: BpView) => void
  setFontSize: (n: number) => void
  adjustOffset: (delta: number) => void
  resetOffset: () => void
}

export const useBigPicStore = create<BigPicState>((set) => ({
  open: false,
  panel: 'none',
  fontPanelPos: null,
  lyrView: 'all',
  fontSize: 3,
  offset: 0,
  autoLyr: false,

  // Каждый заход — чистая раскладка + разрешённое авто-открытие текста.
  openBig: () =>
    set({ open: true, panel: 'none', fontPanelPos: null, lyrView: 'all', autoLyr: true }),
  // Раскладку сбрасывает openBig, а не закрытие: оверлей ещё ~0.3с уезжает вниз
  // (BigPicture.tsx), и сброс panel здесь схлопнул бы текст прямо в
  // кадре анимации выхода.
  closeBig: () => set({ open: false, autoLyr: false }),
  // Открытие текста через кнопку всегда даёт раскладку «Всё».
  toggleLyrics: () =>
    set((s) =>
      s.panel === 'lyrics'
        ? { panel: 'none', autoLyr: false }
        : { panel: 'lyrics', lyrView: 'all', autoLyr: false },
    ),
  openFontPanel: (x, y) => set({ fontPanelPos: { x, y } }),
  closeFontPanel: () => set({ fontPanelPos: null }),
  // «Обложка» = просто без боковой панели; «Всё»/«Текст» открывают текст с нужной раскладкой.
  setView: (v) =>
    set(v === 'cover' ? { panel: 'none', autoLyr: false } : { panel: 'lyrics', lyrView: v, autoLyr: false }),
  setFontSize: (n) => set({ fontSize: n }),
  adjustOffset: (delta) =>
    set((s) => ({ offset: Math.round((s.offset + delta) * 10) / 10 })),
  resetOffset: () => set({ offset: 0 }),
}))
