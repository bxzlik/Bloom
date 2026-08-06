import { create } from 'zustand'

/**
 * Состояние модалки «Перенести на площадку» (#convertPlOverlay).
 * Как и `mergeStore`, хранит только id исходного плейлиста — выбор площадки,
 * ход скана и ручные решения живут локальным стейтом `ConvertModal`
 * (закрытие модалки = отмена переноса, хранить это глобально незачем).
 * Открывается из PlMenu. Один `<ConvertModal>` в App.
 */
interface ConvertState {
  /** id переносимого плейлиста. null = модалка закрыта. */
  plId: string | null
  openConvert: (plId: string) => void
  close: () => void
}

export const useConvertStore = create<ConvertState>((set) => ({
  plId: null,
  openConvert: (plId) => set({ plId }),
  close: () => set({ plId: null }),
}))
