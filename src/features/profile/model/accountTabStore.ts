import { create } from 'zustand'

/**
 * Активная вкладка страницы профиля («Статистика» / «Достижения»).
 *
 * Вынесена в стор (а не локальный `useState` AccountPage), чтобы её можно было
 * переключать ИЗВНЕ при уже смонтированной странице — напр. клик по бару
 * статистики на главной открывает профиль сразу на вкладке «Статистика».
 * Персистится в localStorage, чтобы пережить переход между страницами и
 * перезапуск.
 */

export type AccTab = 'stats' | 'ach'

const TAB_KEY = 'bloom_account_tab'

const load = (): AccTab => {
  try {
    return localStorage.getItem(TAB_KEY) === 'ach' ? 'ach' : 'stats'
  } catch {
    return 'stats'
  }
}

interface AccountTabState {
  tab: AccTab
  setTab: (tab: AccTab) => void
}

export const useAccountTabStore = create<AccountTabState>((set) => ({
  tab: load(),
  setTab: (tab) => {
    try {
      localStorage.setItem(TAB_KEY, tab)
    } catch {
      /* ignore */
    }
    set({ tab })
  },
}))
