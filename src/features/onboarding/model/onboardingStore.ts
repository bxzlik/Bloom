import { create } from 'zustand'

const KEY = 'bloom_onboarded'

const isDone = (): boolean => {
  try {
    return !!localStorage.getItem(KEY)
  } catch {
    return true // нет доступа к localStorage → не мучаем онбордингом
  }
}

interface OnboardingState {
  /** true = онбординг уже пройден (показывали) → оверлей не рендерится. */
  done: boolean
  /** Отметить пройденным. */
  finish: () => void
}

/**
 * Гейт онбординга первого запуска.
 * Оверлей `<Onboarding/>` (в App) рендерится только при `!done`.
 */
export const useOnboardingStore = create<OnboardingState>((set) => ({
  done: isDone(),
  finish: () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* noop */
    }
    set({ done: true })
  },
}))
