import { create } from 'zustand'

/** Режим глобальной правой панели. */
export type GrpMode = 'queue' | 'lyrics'
/** Сторона, с которой выезжает панель. */
export type GrpSide = 'right' | 'left'

const SIDE_KEY = 'bloom_grp_side'
const readSide = (): GrpSide => {
  try {
    return localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right'
  } catch {
    return 'right'
  }
}

/**
 * Глобальная выезжающая боковая панель (#globalRightPanel) — очередь ИЛИ текст.
 * `openGlobalPanel`/`closeGlobalPanel`/`setGrpSide`.
 */
export interface GrpState {
  open: boolean
  mode: GrpMode
  side: GrpSide
  /** Открыть в режиме; повторный клик по активному режиму — закрыть (toggle). */
  openPanel: (mode: GrpMode) => void
  close: () => void
  /** Задать сторону панели (лево/право) — из настроек. */
  setSide: (side: GrpSide) => void
}

export const useGrpStore = create<GrpState>((set, get) => ({
  open: false,
  mode: 'queue',
  side: readSide(),

  openPanel: (mode) => {
    const { open, mode: cur } = get()
    if (open && cur === mode) {
      set({ open: false })
      return
    }
    set({ open: true, mode })
  },
  close: () => set({ open: false }),
  setSide: (side) => {
    try {
      localStorage.setItem(SIDE_KEY, side)
    } catch {
      /* ignore */
    }
    set({ side })
  },
}))
