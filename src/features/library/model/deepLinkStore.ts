import { create } from 'zustand'
import type { Track } from '@entities/track'

/**
 * Состояние модалки deep-link `bloom://play` (#dlinkModal, showDlinkModal).
 * Открывается мостом `useDeepLinkBridge` (app/) при получении события `bloom-deeplink`
 * с host=play. Хранит эфемерный SC-трек, собранный из параметров ссылки.
 *
 * Артист/плейлист/альбом host'ы открывают DetailView напрямую (см. мост), сюда не
 * попадают — этот стор только про модалку выбора действия над треком.
 */
interface DeepLinkState {
  track: Track | null
  openTrack: (t: Track) => void
  close: () => void
}

export const useDeepLinkStore = create<DeepLinkState>((set) => ({
  track: null,
  openTrack: (track) => set({ track }),
  close: () => set({ track: null }),
}))
