import { create } from 'zustand'

/**
 * Звуковые эффекты (поверх эквалайзера): пространственное вращение 8D/10D и
 * «РЭ» — реверберация + эхо. Применение к звуку — `player/lib/audioEffects`
 * через FX-узлы из `audioGraph` (HRTF-паннер по орбите, конволвер + дилей).
 *
 * Persist: `bloom_fx`. «Активно» = включён хотя бы один эффект (подсветка кнопки
 * EQ учитывает и это). Интенсивности — 0..1, маппинг в реальные параметры в
 * audioEffects, чтобы UI не знал про частоты/мс/радиусы.
 */

/** Пространственный режим: выкл / 8D (вращение по кругу) / 10D (+ верх-низ). */
export type SpatialMode = 'off' | '8d' | '10d'

const KEY = 'bloom_fx'

interface Persisted {
  spatial: SpatialMode
  /** 0..1 — скорость/глубина орбиты вращения. */
  spatialIntensity: number
  /** «РЭ»: реверберация помещения + эхо. */
  reverb: boolean
  /** 0..1 — wet-уровень реверба и сила эха. */
  reverbIntensity: number
}

const DEFAULTS: Persisted = {
  spatial: 'off',
  spatialIntensity: 0.5,
  reverb: false,
  reverbIntensity: 0.4,
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, Number(v) || 0))

const read = (): Persisted => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Partial<Persisted>
    return {
      spatial: p.spatial === '8d' || p.spatial === '10d' ? p.spatial : 'off',
      spatialIntensity: p.spatialIntensity != null ? clamp01(p.spatialIntensity) : DEFAULTS.spatialIntensity,
      reverb: !!p.reverb,
      reverbIntensity: p.reverbIntensity != null ? clamp01(p.reverbIntensity) : DEFAULTS.reverbIntensity,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const isActive = (s: Persisted): boolean => s.spatial !== 'off' || s.reverb

export interface FxState extends Persisted {
  /** Включён ли хоть один эффект (для подсветки кнопки EQ). */
  active: boolean
  setSpatial: (mode: SpatialMode) => void
  setSpatialIntensity: (v: number) => void
  setReverb: (on: boolean) => void
  setReverbIntensity: (v: number) => void
  /** Сброс всех эффектов к значениям по умолчанию (выкл, дефолтные интенсивности). */
  reset: () => void
}

export const useFxStore = create<FxState>((set, get) => {
  const init = read()
  const persist = () => {
    const s = get()
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          spatial: s.spatial,
          spatialIntensity: s.spatialIntensity,
          reverb: s.reverb,
          reverbIntensity: s.reverbIntensity,
        } satisfies Persisted),
      )
    } catch {
      /* ignore */
    }
  }
  const commit = (patch: Partial<Persisted>) => {
    set({ ...patch, active: isActive({ ...get(), ...patch }) })
    persist()
  }
  return {
    ...init,
    active: isActive(init),
    setSpatial: (spatial) => commit({ spatial }),
    setSpatialIntensity: (v) => commit({ spatialIntensity: clamp01(v) }),
    setReverb: (reverb) => commit({ reverb }),
    setReverbIntensity: (v) => commit({ reverbIntensity: clamp01(v) }),
    reset: () => commit({ ...DEFAULTS }),
  }
})
