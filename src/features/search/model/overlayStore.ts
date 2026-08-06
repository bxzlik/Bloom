import { create } from 'zustand'

/**
 * Всплывающий поиск (второй вид, `uiPrefs.searchView === 'overlay'`).
 *
 * Открывается кликом по вкладке «Поиск» в сайдбаре вместо перехода на страницу:
 * центральный оверлей с тем же вводом, недавними запросами и живыми подсказками.
 * Enter уводит на страницу поиска с полной выдачей (см. `SearchOverlay`).
 *
 * Стор — только про видимость: запрос/выдача/история живут в `useSearchStore`,
 * общие с обычной страницей (поэтому Enter не перезапрашивает то же самое).
 */
interface SearchOverlayState {
  open: boolean
  show: () => void
  close: () => void
  toggle: () => void
}

export const useSearchOverlayStore = create<SearchOverlayState>((set, get) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
  toggle: () => set({ open: !get().open }),
}))
