import { create } from 'zustand'

/**
 * Настройки аудио: кроссфейд, нормализация громкости, устройство вывода.
 * Движок — `player/lib/audioEffects` (`useAudioEffects` в App).
 *
 * Persist: `bloom_audio`. `normStatus` — transient (не persist), пишется движком.
 */

export type NormStatus = 'off' | 'analyzing' | 'ready' | 'unavailable'

interface Persisted {
  xfadeEnabled: boolean
  xfadeDur: number
  normEnabled: boolean
  normTargetDb: number
  deviceId: string
}

const DEFAULTS: Persisted = {
  xfadeEnabled: false,
  xfadeDur: 3,
  normEnabled: false,
  normTargetDb: -14,
  deviceId: '',
}

const KEY = 'bloom_audio'

const read = (): Persisted => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export interface AudioState extends Persisted {
  normStatus: NormStatus
  setXfadeEnabled: (v: boolean) => void
  setXfadeDur: (v: number) => void
  setNormEnabled: (v: boolean) => void
  setNormTargetDb: (v: number) => void
  setDeviceId: (v: string) => void
  setNormStatus: (v: NormStatus) => void
}

export const useAudioStore = create<AudioState>((set, get) => {
  const persist = () => {
    const s = get()
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          xfadeEnabled: s.xfadeEnabled,
          xfadeDur: s.xfadeDur,
          normEnabled: s.normEnabled,
          normTargetDb: s.normTargetDb,
          deviceId: s.deviceId,
        } satisfies Persisted),
      )
    } catch {
      /* ignore */
    }
  }
  return {
    ...read(),
    normStatus: 'off',
    setXfadeEnabled: (v) => { set({ xfadeEnabled: v }); persist() },
    setXfadeDur: (v) => { set({ xfadeDur: v }); persist() },
    setNormEnabled: (v) => { set({ normEnabled: v }); persist() },
    setNormTargetDb: (v) => { set({ normTargetDb: v }); persist() },
    setDeviceId: (v) => { set({ deviceId: v }); persist() },
    setNormStatus: (v) => set({ normStatus: v }),
  }
})
