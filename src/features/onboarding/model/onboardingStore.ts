import { create } from 'zustand'

const KEY = 'bloom_onboarded'

/** DEV: `?ob` в URL — всегда показывать онбординг, флаг из localStorage игнорируется. */
const forced = (): boolean => {
  if (!import.meta.env.DEV) return false
  try {
    return new URLSearchParams(location.search).has('ob')
  } catch {
    return false
  }
}

const isDone = (): boolean => {
  if (forced()) return false
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
    if (!forced()) {
      try {
        localStorage.setItem(KEY, '1')
      } catch {
        /* noop */
      }
    }
    set({ done: true })
  },
}))

// DEV: `showOnboarding()` в консоли — проиграть онбординг заново без перезагрузки.
if (import.meta.env.DEV) {
  ;(window as unknown as { showOnboarding: () => void }).showOnboarding = () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* noop */
    }
    useOnboardingStore.setState({ done: false })
  }
}
