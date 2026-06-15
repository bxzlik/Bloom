import { create } from 'zustand'

/**
 * Раздел «Оптимизация» (Анфокус + Свёрнутое, `_opt*`).
 * Когда окно теряет фокус / сворачивается — упрощаем графику (снижаем размытие,
 * останавливаем анимации/визуализатор/marquee), чтобы экономить GPU/CPU.
 *
 * Гранулярная настройка: для каждого режима (unfocus/minimized) и каждого
 * «эффекта» (bg/bgGif/covers/visualizers/blur/marquee) — активен он или
 * деградируется. `false` = деградировать (оптимизировать), `true` = оставить.
 * `covers`: 2 = активны, 1 = приостановлены (анимация), 0 = скрыты.
 *
 * Сам движок (применение/снятие по событиям окна) — в `lib/optEngine`.
 */

export type OptMode = 'unfocus' | 'minimized'
export type BlurQuality = 'low' | 'medium' | 'high'

export interface OptEffects {
  bg: boolean
  bgGif: boolean
  covers: number
  visualizers: boolean
  blur: boolean
  marquee: boolean
}

const defaultEffects = (): OptEffects => ({
  bg: false,
  bgGif: false,
  covers: 1,
  visualizers: false,
  blur: false,
  marquee: false,
})

export interface OptState {
  unfocusSimplify: boolean
  unfocusBlurQuality: BlurQuality
  unfocusBlurStrength: number
  minimizedSmart: boolean
  effects: { unfocus: OptEffects; minimized: OptEffects }
  /** Runtime-флаг: визуализатор приостановлен оптимизацией (читает VizBlock). НЕ persist. */
  vizPaused: boolean
  /** Снимок 1-го кадра GIF-обложки (PNG dataURL) при заморозке. null = не заморожено. */
  frozenCover: string | null
  /** Снимок 1-го кадра GIF-визуализатора. null = не заморожено. */
  frozenViz: string | null

  setUnfocusSimplify: (v: boolean) => void
  setUnfocusBlurQuality: (v: BlurQuality) => void
  setUnfocusBlurStrength: (v: number) => void
  setMinimizedSmart: (v: boolean) => void
  /** Переключить карточку эффекта (covers циклит 1↔2, остальные boolean). */
  toggleEffect: (mode: OptMode, effect: keyof OptEffects) => void
  setVizPaused: (v: boolean) => void
  setFrozenCover: (v: string | null) => void
  setFrozenViz: (v: string | null) => void
}

const LS_KEY = 'bloom_opt'

interface Persisted {
  unfocusSimplify: boolean
  unfocusBlurQuality: BlurQuality
  unfocusBlurStrength: number
  minimizedSmart: boolean
  effects: { unfocus: OptEffects; minimized: OptEffects }
}

const DEFAULTS: Persisted = {
  unfocusSimplify: true,
  unfocusBlurQuality: 'low',
  unfocusBlurStrength: 4,
  minimizedSmart: true,
  effects: { unfocus: defaultEffects(), minimized: defaultEffects() },
}

const mergeEffects = (raw: unknown): OptEffects => {
  const d = defaultEffects()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Record<string, unknown>
  return {
    bg: typeof r.bg === 'boolean' ? r.bg : d.bg,
    bgGif: typeof r.bgGif === 'boolean' ? r.bgGif : d.bgGif,
    covers: typeof r.covers === 'number' ? r.covers : d.covers,
    visualizers: typeof r.visualizers === 'boolean' ? r.visualizers : d.visualizers,
    blur: typeof r.blur === 'boolean' ? r.blur : d.blur,
    marquee: typeof r.marquee === 'boolean' ? r.marquee : d.marquee,
  }
}

const load = (): Persisted => {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    return {
      unfocusSimplify: p.unfocusSimplify !== false,
      unfocusBlurQuality: ['low', 'medium', 'high'].includes(p.unfocusBlurQuality) ? p.unfocusBlurQuality : 'low',
      unfocusBlurStrength: typeof p.unfocusBlurStrength === 'number' ? p.unfocusBlurStrength : 4,
      minimizedSmart: p.minimizedSmart !== false,
      effects: {
        unfocus: mergeEffects(p.effects?.unfocus),
        minimized: mergeEffects(p.effects?.minimized),
      },
    }
  } catch {
    return DEFAULTS
  }
}

const save = (s: Persisted): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch {
    /* игнор */
  }
}

export const useOptStore = create<OptState>((set, get) => {
  const persist = (): void => {
    const s = get()
    save({
      unfocusSimplify: s.unfocusSimplify,
      unfocusBlurQuality: s.unfocusBlurQuality,
      unfocusBlurStrength: s.unfocusBlurStrength,
      minimizedSmart: s.minimizedSmart,
      effects: s.effects,
    })
  }
  return {
    ...load(),
    vizPaused: false,
    frozenCover: null,
    frozenViz: null,
    setUnfocusSimplify: (v) => { set({ unfocusSimplify: v }); persist() },
    setUnfocusBlurQuality: (v) => { set({ unfocusBlurQuality: v }); persist() },
    setUnfocusBlurStrength: (v) => { set({ unfocusBlurStrength: v }); persist() },
    setMinimizedSmart: (v) => { set({ minimizedSmart: v }); persist() },
    toggleEffect: (mode, effect) =>
      set((s) => {
        const cur = s.effects[mode]
        const next: OptEffects =
          effect === 'covers'
            ? { ...cur, covers: cur.covers >= 2 ? 1 : 2 }
            : { ...cur, [effect]: !cur[effect] }
        const effects = { ...s.effects, [mode]: next }
        save({
          unfocusSimplify: s.unfocusSimplify,
          unfocusBlurQuality: s.unfocusBlurQuality,
          unfocusBlurStrength: s.unfocusBlurStrength,
          minimizedSmart: s.minimizedSmart,
          effects,
        })
        return { effects }
      }),
    setVizPaused: (v) => set({ vizPaused: v }),
    setFrozenCover: (v) => set({ frozenCover: v }),
    setFrozenViz: (v) => set({ frozenViz: v }),
  }
})
