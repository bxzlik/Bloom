import { create } from 'zustand'

/**
 * Глобальный триггер модалки «Новый плейлист», открываемой ИЗ ДРУГИХ окон
 * (miniplayer/tray-popup «+» → «Новый плейлист» → Rust `mp_open_new_pl` →
 * событие `bloom-mp-new-pl`). Главное окно слушает событие в useMainPlayerBridge
 * и зовёт `openModal(curId)`; App рендерит сам `NewPlaylistModal` (хост), а после
 * создания добавляет `pendingTrackId` в новый плейлист.
 *
 * В самом главном окне модалку открывают локальным state (LibContent и т.п.) —
 * этот стор только для кросс-оконного сценария.
 */
interface NewPlModalState {
  open: boolean
  pendingTrackId: string | null
  openModal: (trackId?: string | null) => void
  close: () => void
}

export const useNewPlModalStore = create<NewPlModalState>((set) => ({
  open: false,
  pendingTrackId: null,
  openModal: (trackId = null) => set({ open: true, pendingTrackId: trackId }),
  close: () => set({ open: false, pendingTrackId: null }),
}))
