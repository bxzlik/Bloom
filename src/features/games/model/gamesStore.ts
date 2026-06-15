import { create } from 'zustand'

/**
 * Состояние модалки игр (#gamesOverlay).
 * `openGamesModal`/`closeGamesModal`/`openGame`/`gamesBack`.
 *
 * В игры жили как секции `ssec-<id>` в настройках и физически
 * переносились в `#gamesGameContent` (DOM-reparenting). В bloom каждая игра —
 * отдельный React-компонент из реестра (`gameRegistry`), поэтому стору достаточно
 * хранить флаг открытия и id текущей игры (`null` = экран-грид).
 */
/**
 * Управляющие кнопки активной игры, которые рендерятся в шапке модалки рядом с
 * крестиком (а не внутри контента игры). Игра регистрирует их на маунте через
 * `setControls` и очищает на размонтировании.
 */
export interface GameControls {
  /** Суффикс для тумблера уведомлений (`bloom_notifs_<notifGame>`). */
  notifGame: string
  /** Сброс прогресса игры. */
  onReset: () => void
}

export interface GamesState {
  /** Модалка открыта. */
  open: boolean
  /** Выбранная игра (id из GAMES_LIST) или `null` — показываем грид плиток. */
  current: string | null
  /** Контролы активной игры для шапки модалки (или `null`). */
  controls: GameControls | null

  /** Открыть модалку на гриде. */
  openModal: () => void
  /** Закрыть модалку. */
  close: () => void
  /** Открыть конкретную игру. */
  openGame: (id: string) => void
  /** Вернуться с игры на грид. */
  back: () => void
  /** Зарегистрировать/снять контролы активной игры (зовёт сама игра). */
  setControls: (c: GameControls | null) => void
}

export const useGamesStore = create<GamesState>((set) => ({
  open: false,
  current: null,
  controls: null,

  openModal: () => set({ open: true, current: null }),
  close: () => set({ open: false }),
  openGame: (id) => set({ current: id }),
  back: () => set({ current: null, controls: null }),
  setControls: (c) => set({ controls: c }),
}))
