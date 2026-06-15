import { create } from 'zustand'

/** Какая боковая панель открыта внутри BigPicture (или ничего). */
export type BpPanel = 'none' | 'queue' | 'lyrics'

/**
 * Размеры шрифта текста в BigPicture: 4 пресета `{normal, active}` (px).
 * `_bpFontSizes`. По умолчанию — индекс 3.
 */
export const BP_FONT_SIZES: { normal: number; active: number }[] = [
  { normal: 18, active: 22 },
  { normal: 22, active: 28 },
  { normal: 28, active: 36 },
  { normal: 36, active: 46 },
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
  /** Индекс размера шрифта текста (0..3, см. BP_FONT_SIZES). */
  fontSize: number
  /** Сдвиг синхронизации текста в секундах (только для BigPicture, _bpOffset). */
  offset: number

  openBig: () => void
  closeBig: () => void
  toggleQueue: () => void
  toggleLyrics: () => void
  toggleFontPanel: () => void
  setFontSize: (n: number) => void
  adjustOffset: (delta: number) => void
  resetOffset: () => void
}

export const useBigPicStore = create<BigPicState>((set) => ({
  open: false,
  panel: 'none',
  fontPanelOpen: false,
  fontSize: 3,
  offset: 0,

  openBig: () => set({ open: true }),
  // Закрытие сбрасывает панели/попап шрифта.
  closeBig: () => set({ open: false, panel: 'none', fontPanelOpen: false }),
  toggleQueue: () => set((s) => ({ panel: s.panel === 'queue' ? 'none' : 'queue' })),
  toggleLyrics: () => set((s) => ({ panel: s.panel === 'lyrics' ? 'none' : 'lyrics' })),
  toggleFontPanel: () => set((s) => ({ fontPanelOpen: !s.fontPanelOpen })),
  setFontSize: (n) => set({ fontSize: n }),
  adjustOffset: (delta) =>
    set((s) => ({ offset: Math.round((s.offset + delta) * 10) / 10 })),
  resetOffset: () => set({ offset: 0 }),
}))
