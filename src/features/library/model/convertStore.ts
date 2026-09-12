import { create } from 'zustand'

/**
 * Состояние панели «Перенести на площадку» (#convertPlOverlay).
 * Как и `mergeStore`, хранит только вход в перенос — что и куда — а ход скана и
 * ручные решения живут локальным стейтом `ConvertModal` (закрытие панели =
 * отмена переноса, хранить это глобально незачем).
 *
 * Единственный вход — модалка «+» библиотеки (`LibAddModal`, вид `convert`):
 * плейлист и площадку выбирают там, поэтому `target` обязателен, а панель
 * стартует сразу со скана. Один `<ConvertModal>` в App.
 */
interface ConvertState {
  /** id переносимого плейлиста. null = панель закрыта. */
  plId: string | null
  /** Площадка-цель, выбранная на входе. */
  target: string | null
  openConvert: (plId: string, target: string) => void
  close: () => void
}

export const useConvertStore = create<ConvertState>((set) => ({
  plId: null,
  target: null,
  openConvert: (plId, target) => set({ plId, target }),
  close: () => set({ plId: null, target: null }),
}))
