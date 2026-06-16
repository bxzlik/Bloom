import { create } from 'zustand'

/**
 * Эквалайзер (6 полос, по макету): пресеты + перетаскиваемая кривая.
 * Применение к звуку — `player/lib/audioEffects` через узлы из `audioGraph`.
 * Persist: `bloom_eq`. Отдельного вкл/выкл нет — «Нейтральный» (все 0) = без эффекта;
 * кнопка EQ в плеере подсвечивается, когда есть ненулевые полосы.
 */

export const EQ_LABELS = ['60', '150', '400', '1k', '2.4k', '15k'] as const
export const EQ_BANDS = 6
export const EQ_MAX_DB = 12

export type EqGains = number[] // длина EQ_BANDS, дБ в диапазоне ±EQ_MAX_DB

export const EQ_PRESETS: Record<string, EqGains> = {
  'Нейтральный': [0, 0, 0, 0, 0, 0],
  'Басы': [9, 6, 2, 0, 0, 1],
  'Высокие': [1, 0, 0, 2, 5, 9],
  'Вокал': [-2, -1, 2, 4, 3, 0],
  'Рок': [5, 3, -1, 1, 3, 5],
  'Поп': [-1, 2, 4, 3, 1, 2],
  'Джаз': [4, 2, -1, 0, 2, 4],
  'Классика': [5, 3, 0, 0, 2, 4],
  'Электроника': [7, 5, 0, 1, 3, 6],
  'Хип-хоп': [8, 5, 1, 2, 1, 3],
  'Танцевальная': [6, 4, 1, 0, 2, 5],
  'Акустика': [4, 2, 0, 2, 3, 4],
  'Громкость': [6, 4, 0, 2, 4, 5],
}

const KEY = 'bloom_eq'

interface Persisted {
  gains: EqGains
  activePreset: string | null
  custom: Record<string, EqGains>
}

const clampGain = (g: number): number => Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, g))
const normalize = (g: EqGains): EqGains => {
  const out = Array.from({ length: EQ_BANDS }, (_, i) => clampGain(Number(g[i]) || 0))
  return out
}

const read = (): Persisted => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { gains: [...EQ_PRESETS['Нейтральный']!], activePreset: 'Нейтральный', custom: {} }
    const p = JSON.parse(raw) as Partial<Persisted>
    return {
      gains: normalize(p.gains ?? EQ_PRESETS['Нейтральный']!),
      activePreset: p.activePreset ?? null,
      custom: p.custom ?? {},
    }
  } catch {
    return { gains: [...EQ_PRESETS['Нейтральный']!], activePreset: 'Нейтральный', custom: {} }
  }
}

export interface EqState extends Persisted {
  /** Любая полоса ≠ 0 — эквалайзер «активен» (для подсветки кнопки). */
  active: boolean
  setGain: (i: number, db: number) => void
  applyPreset: (name: string) => void
  saveCustom: (name: string) => void
  deleteCustom: (name: string) => void
}

const isActive = (g: EqGains): boolean => g.some((v) => Math.abs(v) > 0.01)

export const useEqStore = create<EqState>((set, get) => {
  const init = read()
  const persist = () => {
    const s = get()
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ gains: s.gains, activePreset: s.activePreset, custom: s.custom } satisfies Persisted),
      )
    } catch {
      /* ignore */
    }
  }
  return {
    ...init,
    active: isActive(init.gains),
    setGain: (i, db) => {
      const gains = get().gains.slice()
      gains[i] = clampGain(db)
      set({ gains, activePreset: null, active: isActive(gains) })
      persist()
    },
    applyPreset: (name) => {
      const preset = EQ_PRESETS[name] ?? get().custom[name]
      if (!preset) return
      const gains = normalize(preset)
      set({ gains, activePreset: name, active: isActive(gains) })
      persist()
    },
    saveCustom: (name) => {
      const nm = name.trim()
      if (!nm) return
      const custom = { ...get().custom, [nm]: get().gains.slice() }
      set({ custom, activePreset: nm })
      persist()
    },
    deleteCustom: (name) => {
      const custom = { ...get().custom }
      delete custom[name]
      set({ custom, activePreset: get().activePreset === name ? null : get().activePreset })
      persist()
    },
  }
})
