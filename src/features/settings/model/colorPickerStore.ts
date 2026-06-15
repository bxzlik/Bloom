import { create } from 'zustand'

/**
 * Глобальный кастомный HSV color-picker. Один попап на всё приложение: любой swatch зовёт
 * `openColorPicker({ anchor, color, onChange })`, App рендерит единственный
 * `<ColorPicker/>` (хост), позиционируя его рядом с anchor-элементом.
 *
 * onChange вызывается ЖИВО при каждом изменении (drag/hex), —
 * вызывающий код применяет цвет на лету (setAccent и т.п.).
 */
interface ColorPickerState {
  open: boolean
  /** Прямоугольник swatch-кнопки, рядом с которой ставим попап. */
  anchor: DOMRect | null
  /** Текущий цвет в HEX (`#rrggbb`). */
  color: string
  onChange: ((hex: string) => void) | null
  openPicker: (opts: { anchor: HTMLElement; color: string; onChange: (hex: string) => void }) => void
  close: () => void
}

export const useColorPickerStore = create<ColorPickerState>((set) => ({
  open: false,
  anchor: null,
  color: '#888888',
  onChange: null,
  openPicker: ({ anchor, color, onChange }) =>
    set({ open: true, anchor: anchor.getBoundingClientRect(), color, onChange }),
  close: () => set({ open: false, onChange: null }),
}))

/** Удобный шорткат — открыть пикер рядом с элементом-триггером. */
export const openColorPicker = (opts: {
  anchor: HTMLElement
  color: string
  onChange: (hex: string) => void
}) => useColorPickerStore.getState().openPicker(opts)
