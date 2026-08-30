import { create } from 'zustand'
import type { PeriodKind } from '../lib/periods'

/**
 * Открыта ли модалка «Итогов» и на каком периоде она стартует.
 *
 * Флаг вынесен в стор, а не живёт в компоненте, по двум причинам:
 *   1) о нём знает тайтлбар — пока модалка открыта, метка страницы показывает
 *      «Итоги» (окно ведь никуда не перешло, оверлей висит поверх страницы);
 *   2) открыть итоги умеет не только баннер, но и уведомление «итоги готовы»,
 *      которое сразу ведёт на свой период (`initial`).
 *
 * `initial === null` — стартуем с экрана выбора периода.
 */
interface WrappedUiState {
  open: boolean
  initial: PeriodKind | null
  setOpen: (open: boolean, initial?: PeriodKind | null) => void
}

export const useWrappedUiStore = create<WrappedUiState>((set) => ({
  open: false,
  initial: null,
  setOpen: (open, initial = null) => set({ open, initial: open ? initial : null }),
}))
