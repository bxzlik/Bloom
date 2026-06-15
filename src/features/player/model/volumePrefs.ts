/**
 * Персистентность громкости.
 *
 * В bloom держим отдельным ключом localStorage, чтобы не тащить весь settings-блоб.
 * `volume` — текущий уровень 0..100; `prevVolume` — уровень до mute (для возврата).
 */
const KEY = 'bloom_volume'

export interface VolumePrefs {
  volume: number
  prevVolume: number
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)))

/** Прочитать сохранённую громкость. Дефолт 80. */
export const loadVolumePrefs = (): VolumePrefs => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<VolumePrefs>
      const prevVolume = clamp(typeof p.prevVolume === 'number' ? p.prevVolume : 100) || 100
      let volume = clamp(typeof p.volume === 'number' ? p.volume : 100)
      //: если сохранён mute (0) при ненулевом prev — вернуть prev.
      if (volume === 0 && prevVolume > 0) volume = prevVolume
      return { volume, prevVolume }
    }
  } catch {
    /* ignore */
  }
  return { volume: 100, prevVolume: 100 }
}

/** Сохранить громкость. */
export const saveVolumePrefs = (p: VolumePrefs): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ volume: clamp(p.volume), prevVolume: clamp(p.prevVolume) || 100 }))
  } catch {
    /* ignore */
  }
}
