import { create } from 'zustand'

/**
 * Стор баннера прогресса скачивания плейлиста. Живёт в shared (без зависимостей
 * от features) — его дёргает загрузчик `player/lib/download.ts` через
 * императивный мост `downloadBanner.*` (как `toast()`). Сам компонент-баннер
 * лежит в `features/player/ui/DownloadBanner.tsx` (ему нужны сторы плеера/нав.
 * для смещения над нижним плеер-баром, а shared их импортировать не может).
 */
type Phase = 'downloading' | 'done'

export interface DownloadBannerState {
  active: boolean
  /** Имя плейлиста. */
  name: string
  /** Номер обрабатываемого трека (1..total). */
  current: number
  total: number
  ok: number
  failed: number
  phase: Phase
  /** «Артист — Трек» текущего трека (для строки под заголовком). */
  trackName: string
  /** Монотонный счётчик — рестартит таймер автоскрытия при новом завершении. */
  seq: number
  start: (name: string, total: number) => void
  setCurrent: (current: number, trackName: string) => void
  itemDone: (success: boolean) => void
  finish: () => void
  hide: () => void
}

export const useDownloadBannerStore = create<DownloadBannerState>((set) => ({
  active: false,
  name: '',
  current: 0,
  total: 0,
  ok: 0,
  failed: 0,
  phase: 'downloading',
  trackName: '',
  seq: 0,
  start: (name, total) =>
    set((s) => ({
      active: true,
      name,
      total,
      current: 0,
      ok: 0,
      failed: 0,
      phase: 'downloading',
      trackName: '',
      seq: s.seq + 1,
    })),
  setCurrent: (current, trackName) => set({ current, trackName }),
  itemDone: (success) =>
    set((s) => (success ? { ok: s.ok + 1 } : { failed: s.failed + 1 })),
  finish: () => set((s) => ({ phase: 'done', seq: s.seq + 1 })),
  hide: () => set({ active: false }),
}))

/** Императивный мост — зовётся из загрузчика (не-React код). */
export const downloadBanner = {
  start: (name: string, total: number) => useDownloadBannerStore.getState().start(name, total),
  setCurrent: (current: number, trackName: string) =>
    useDownloadBannerStore.getState().setCurrent(current, trackName),
  itemDone: (success: boolean) => useDownloadBannerStore.getState().itemDone(success),
  finish: () => useDownloadBannerStore.getState().finish(),
}
