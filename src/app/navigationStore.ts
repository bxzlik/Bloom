import { create } from 'zustand'
// Прямой импорт store (НЕ barrel @features/library) — barrel тянет ./ui →
// @features/player → @app/navigationStore, что создало бы цикл импортов.
import { useLibStore } from '@features/library/model/store'

/** Идентификаторы страниц соответствуют `data-p` атрибутам в старой sidebar. */
export type PageId = 'home' | 'player' | 'lib' | 'search' | 'account'

export interface NavState {
  page: PageId
  /** Открыта ли модалка настроек (#settingsOverlay). */
  settingsOpen: boolean
  goNav: (page: PageId) => void
  openSettings: () => void
  closeSettings: () => void
}

/**
 * Простой стор активной страницы. Используется sidebar (.sni active) и
 * App-каркасом (`.page.active` показывается).
 */
export const useNavStore = create<NavState>((set) => ({
  page: 'home',
  settingsOpen: false,
  goNav: (page) => {
    // Вход на вкладку библиотеки → показать grid-обзор, если не в плейлисте/папке.
    // СИНХРОННО до set — чтобы deep-link
    // главной (goNav('lib'); selectBuiltin('fav')) мог перетереть выбором.
    if (page === 'lib') useLibStore.getState().onEnterLibrary()
    set({ page })
  },
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}))
