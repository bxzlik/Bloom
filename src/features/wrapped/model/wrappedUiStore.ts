import { create } from 'zustand'

/**
 * Открыта ли полноэкранная история «Итогов».
 *
 * Флаг вынесен в стор, а не живёт в компоненте, потому что о нём должен знать
 * тайтлбар: пока история открыта, метка страницы показывает «Итоги» (окно ведь
 * никуда не перешло — оверлей висит поверх «Главной»).
 */
interface WrappedUiState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useWrappedUiStore = create<WrappedUiState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
