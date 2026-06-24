import { create } from 'zustand'

/**
 * Глобальный триггер создания «Нового плейлиста» ИЗ ДРУГИХ окон
 * (miniplayer/tray-popup «+» → «Новый плейлист» → Rust `mp_open_new_pl` →
 * событие `bloom-mp-new-pl`). Главное окно слушает событие в useMainPlayerBridge
 * и зовёт `openModal(curId)`; `MpNewPlaylistHost` (хост в App) мгновенно создаёт
 * плейлист с `pendingTrackId` и открывает его в inline-редакте (createPlaylistInline).
 *
 * В самом главном окне создание идёт напрямую через createPlaylistInline —
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
