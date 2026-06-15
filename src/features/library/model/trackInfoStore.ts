import { create } from 'zustand'
import type { Track } from '@entities/track'

/**
 * Глобальное состояние модалки «Инфо о треке» (#trackInfoOverlay).
 *
 * Контекстное меню трека (`TrackCtxMenu`) используется в нескольких местах
 * (библиотека, очередь, обложка плеера). Чтобы не прокидывать модалку пропами
 * в каждый из них, держим один стор + единственный `<TrackInfoModal>` в App.
 */
interface TrackInfoState {
  track: Track | null
  openTrackInfo: (t: Track) => void
  closeTrackInfo: () => void
}

export const useTrackInfoStore = create<TrackInfoState>((set) => ({
  track: null,
  openTrackInfo: (t) => set({ track: t }),
  closeTrackInfo: () => set({ track: null }),
}))
