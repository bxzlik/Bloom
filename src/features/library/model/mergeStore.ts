import { create } from 'zustand'

/**
 * Состояние модалки «Объединение плейлистов» (#mergePlOverlay / plCtxMerge).
 * Хранит только id исходного плейлиста; выбор/опции/имя — локальный
 * стейт компонента. Открывается из PlMenu («Объединить с…»). Один `<MergeModal>` в App.
 */
interface MergeState {
  /** id исходного плейлиста (A). null = модалка закрыта. */
  srcId: string | null
  openMerge: (srcId: string) => void
  close: () => void
}

export const useMergeStore = create<MergeState>((set) => ({
  srcId: null,
  openMerge: (srcId) => set({ srcId }),
  close: () => set({ srcId: null }),
}))
