import { create } from 'zustand'

/**
 * Состояние модалки «Дубликаты треков» (#dupsOverlay / openDups).
 * `plId === null` — искать дубли по всей библиотеке; иначе — внутри плейлиста.
 * Открывается из PlMenu («Найти дубли»). Единственный `<DupsModal>` в App.
 */
interface DupsState {
  open: boolean
  /** null = вся библиотека; строка = id плейлиста. */
  plId: string | null
  openDups: (plId?: string | null) => void
  close: () => void
}

export const useDupsStore = create<DupsState>((set) => ({
  open: false,
  plId: null,
  openDups: (plId = null) => set({ open: true, plId: plId ?? null }),
  close: () => set({ open: false, plId: null }),
}))
