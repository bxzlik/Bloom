import { create } from 'zustand'
import { audioEngine } from '../lib/audioEngine'

/** `const SPEEDS=[0.75,1,1.25]`. */
export const SPEEDS = [0.75, 1, 1.25] as const

const KEY = 'bloom_speed_idx'

const loadIdx = (): number => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw !== null) {
      const v = Number(raw)
      if (Number.isInteger(v) && v >= 0 && v < SPEEDS.length) return v
    }
  } catch {
    /* ignore */
  }
  return 1 // дефолт — 1×
}

interface SpeedState {
  idx: number
  setIdx: (idx: number) => void
}

/**
 * Скорость воспроизведения. Индекс в SPEEDS, персист в localStorage.
 * Применение к движку — через `audioEngine.setPlaybackRate`.
 */
export const useSpeedStore = create<SpeedState>((set) => ({
  idx: loadIdx(),
  setIdx: (idx) => {
    if (idx < 0 || idx >= SPEEDS.length) return
    audioEngine.setPlaybackRate(SPEEDS[idx])
    try {
      localStorage.setItem(KEY, String(idx))
    } catch {
      /* ignore */
    }
    set({ idx })
  },
}))

/** Применить сохранённую скорость к движку при старте приложения. */
export const bootstrapSpeed = (): void => {
  audioEngine.setPlaybackRate(SPEEDS[useSpeedStore.getState().idx])
}
