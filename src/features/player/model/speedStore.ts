import { create } from 'zustand'
import { audioEngine } from '../lib/audioEngine'

/** Пресеты-карточки пикера: медленно / обычно / быстро. */
export const SPEEDS = [0.75, 1, 1.25] as const

/** Границы и шаг слайдера произвольной скорости. */
export const SPEED_MIN = 0.5
export const SPEED_MAX = 2
export const SPEED_STEP = 0.05

const KEY = 'bloom_speed_rate'
const NC_KEY = 'bloom_speed_nightcore'
/** Легаси-ключ (индекс в SPEEDS) — читаем один раз ради миграции. */
const LEGACY_KEY = 'bloom_speed_idx'

/** Округление до шага слайдера + клемп (0.05 в double даёт хвосты). */
export const clampRate = (r: number): number => {
  if (!Number.isFinite(r)) return 1
  const snapped = Math.round(r / SPEED_STEP) * SPEED_STEP
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(snapped * 100) / 100))
}

/** `1×`, `1.35×` — без хвостовых нулей. */
export const speedLabel = (r: number): string =>
  `${Number(r.toFixed(2))}×`

const loadRate = (): number => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw !== null) {
      const v = Number(raw)
      if (Number.isFinite(v)) return clampRate(v)
    }
    // Миграция со старого формата (индекс в SPEEDS).
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy !== null) {
      const i = Number(legacy)
      if (Number.isInteger(i) && i >= 0 && i < SPEEDS.length) {
        localStorage.setItem(KEY, String(SPEEDS[i]))
        localStorage.removeItem(LEGACY_KEY)
        return SPEEDS[i]
      }
    }
  } catch {
    /* ignore */
  }
  return 1 // дефолт — 1×
}

const loadNightcore = (): boolean => {
  try {
    return localStorage.getItem(NC_KEY) === '1'
  } catch {
    return false
  }
}

interface SpeedState {
  /** Текущая скорость воспроизведения (SPEED_MIN…SPEED_MAX). */
  rate: number
  /** Nightcore: питч едет за темпом. Выкл. — тон сохраняется (дефолт). */
  nightcore: boolean
  setRate: (rate: number) => void
  setNightcore: (on: boolean) => void
}

/**
 * Скорость воспроизведения. Произвольное значение с шагом SPEED_STEP,
 * персист в localStorage. Применение к движку — `audioEngine.setPlaybackRate`.
 */
export const useSpeedStore = create<SpeedState>((set) => ({
  rate: loadRate(),
  nightcore: loadNightcore(),
  setRate: (rate) => {
    const r = clampRate(rate)
    audioEngine.setPlaybackRate(r)
    try {
      localStorage.setItem(KEY, String(r))
    } catch {
      /* ignore */
    }
    set({ rate: r })
  },
  setNightcore: (on) => {
    audioEngine.setPreservePitch(!on)
    try {
      localStorage.setItem(NC_KEY, on ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ nightcore: on })
  },
}))

/** Применить сохранённые скорость/питч к движку при старте приложения. */
export const bootstrapSpeed = (): void => {
  const s = useSpeedStore.getState()
  audioEngine.setPlaybackRate(s.rate)
  audioEngine.setPreservePitch(!s.nightcore)
}
