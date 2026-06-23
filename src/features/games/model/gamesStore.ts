import { create } from 'zustand'

/**
 * Состояние модалки игр (#gamesOverlay).
 * `openModal`/`close`/`openGame`/`back`.
 *
 * В игры жили как секции `ssec-<id>` в настройках и физически
 * переносились в `#gamesGameContent` (DOM-reparenting). В bloom каждая игра —
 * отдельный React-компонент из реестра (`gameRegistry`), поэтому стору достаточно
 * хранить флаг открытия и id текущей игры (`null` = экран-витрина).
 *
 * Раньше игра регистрировала «контролы» (Reset + колокольчик) в общей шапке
 * приложения через `setControls`. После переделки каждая игра рисует собственную
 * тематическую шапку (свой топ-бар) внутри своего оформления, поэтому контролы
 * из стора убраны — стор отвечает только за навигацию модалки.
 */
export interface GamesState {
  /** Модалка открыта. */
  open: boolean
  /** Выбранная игра (id из GAMES_LIST) или `null` — показываем витрину. */
  current: string | null

  /** Открыть модалку на витрине. */
  openModal: () => void
  /** Закрыть модалку. */
  close: () => void
  /** Открыть конкретную игру. */
  openGame: (id: string) => void
  /** Вернуться с игры на витрину. */
  back: () => void
}

export const useGamesStore = create<GamesState>((set) => ({
  open: false,
  current: null,

  openModal: () => set({ open: true, current: null }),
  close: () => set({ open: false }),
  openGame: (id) => set({ current: id }),
  back: () => set({ current: null }),
}))
