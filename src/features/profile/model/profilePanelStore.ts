import { create } from 'zustand'

/**
 * Какая боковая шторка профиля открыта: «Статистика» / «Достижения» / никакая.
 *
 * Раньше это были две вкладки под карточкой профиля (`accountTabStore`), теперь —
 * два входа-карточки и выезжающие справа панели (каркас `.spanel`, тот же, что у
 * редактора профиля). В сторе, а не в локальном `useState` страницы, чтобы
 * шторку можно было открыть ИЗВНЕ (напр. кликом по бару статистики на главной).
 *
 * Ничего не персистим: шторка — разовое действие, при возврате на профиль она
 * должна быть закрыта.
 */

export type ProfilePanel = 'stats' | 'ach'

interface ProfilePanelState {
  panel: ProfilePanel | null
  openPanel: (panel: ProfilePanel) => void
  closePanel: () => void
}

export const useProfilePanelStore = create<ProfilePanelState>((set) => ({
  panel: null,
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
}))
