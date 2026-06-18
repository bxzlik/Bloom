import { create } from 'zustand'

/**
 * Координация двух нижне-правых баннеров (обновление + скачивание), чтобы они
 * не перекрывались. `UpdateBanner` репортит сюда свою измеренную высоту (0 когда
 * скрыт), а `DownloadBanner` читает её и поднимается над ним. Лежит в shared —
 * оба баннера (из разных фич) видят один стор без перекрёстных зависимостей.
 */
interface BannerStackState {
  /** Высота баннера обновления в px, 0 если он скрыт. */
  updateBannerHeight: number
  setUpdateBannerHeight: (h: number) => void
}

export const useBannerStackStore = create<BannerStackState>((set) => ({
  updateBannerHeight: 0,
  setUpdateBannerHeight: (h) =>
    set((s) => (s.updateBannerHeight === h ? s : { updateBannerHeight: h })),
}))
