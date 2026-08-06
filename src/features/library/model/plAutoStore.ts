import { create } from 'zustand'

/**
 * Авто-обновление плейлистов из привязанных источников (`pl.sources`).
 *
 * Стор держит ТОЛЬКО настройки + состояние прохода; сама логика обновления —
 * в `lib/plAutoRefresh.ts` (иначе model зависел бы от lib).
 *
 * Persist в `localStorage[bloom_pl_auto]`. `ids` — плейлисты, отмеченные
 * пользователем: они участвуют и в авто-проходе, и в кнопке «Обновить сейчас».
 * `runs` — когда и сколько добавил последний проход по каждому плейлисту
 * (подпись в drawer'е; чистится вместе с исчезнувшими плейлистами).
 */

const LS_KEY = 'bloom_pl_auto'

/** Варианты периода (минуты) для сегмент-переключателя в drawer'е. */
export const PL_AUTO_INTERVALS = [30, 60, 180, 720, 1440] as const

export interface PlAutoRun {
  /** ts завершения обновления этого плейлиста. */
  at: number
  /** Сколько новых треков добавилось. */
  added: number
  /** Обновление упало (сеть/недоступный источник). */
  failed?: boolean
}

interface Persisted {
  enabled: boolean
  everyMin: number
  onStart: boolean
  ids: string[]
  lastRun: number
  runs: Record<string, PlAutoRun>
}

const DEFAULTS: Persisted = {
  enabled: false,
  everyMin: 180,
  onStart: true,
  ids: [],
  lastRun: 0,
  runs: {},
}

const load = (): Persisted => {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...DEFAULTS }
    const o = JSON.parse(raw) as Partial<Persisted>
    return {
      enabled: !!o.enabled,
      everyMin: typeof o.everyMin === 'number' && o.everyMin >= 5 ? o.everyMin : DEFAULTS.everyMin,
      onStart: o.onStart !== false,
      ids: Array.isArray(o.ids) ? o.ids.filter((x): x is string => typeof x === 'string') : [],
      lastRun: typeof o.lastRun === 'number' ? o.lastRun : 0,
      runs: o.runs && typeof o.runs === 'object' ? o.runs : {},
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export interface PlAutoState extends Persisted {
  /** Drawer открыт. */
  open: boolean
  /**
   * Идёт проход. `null` — простой; иначе id обновляемого сейчас плейлиста
   * (`''` — проход стартовал, но конкретный плейлист ещё не выбран).
   */
  busy: string | null

  openDrawer: () => void
  closeDrawer: () => void

  setEnabled: (v: boolean) => void
  setEveryMin: (min: number) => void
  setOnStart: (v: boolean) => void
  /** Переключить участие плейлиста. */
  toggleId: (id: string) => void
  /** Задать весь набор (кнопка «Выбрать все» / «Снять все»). */
  setIds: (ids: string[]) => void

  /** Служебное (для plAutoRefresh): текущий обновляемый плейлист. */
  setBusy: (id: string | null) => void
  /** Служебное: записать результат по плейлисту. */
  markRun: (id: string, run: PlAutoRun) => void
  /** Служебное: отметить время завершения прохода (сдвигает таймер). */
  markSweep: (at?: number) => void
  /** Забыть плейлисты, которых больше нет (вызывается при открытии drawer'а). */
  prune: (existing: Set<string>) => void
}

const persist = (s: PlAutoState): void => {
  try {
    const data: Persisted = {
      enabled: s.enabled,
      everyMin: s.everyMin,
      onStart: s.onStart,
      ids: s.ids,
      lastRun: s.lastRun,
      runs: s.runs,
    }
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch {
    // ignore (quota)
  }
}

export const usePlAutoStore = create<PlAutoState>((set, get) => {
  /** set + persist одним движением (все мутации настроек идут через него). */
  const save = (patch: Partial<PlAutoState>): void => {
    set(patch)
    persist(get())
  }

  return {
    ...load(),
    open: false,
    busy: null,

    openDrawer: () => set({ open: true }),
    closeDrawer: () => set({ open: false }),

    setEnabled: (v) => save({ enabled: v, lastRun: v ? Date.now() : get().lastRun }),
    setEveryMin: (min) => save({ everyMin: min }),
    setOnStart: (v) => save({ onStart: v }),

    toggleId: (id) => {
      const cur = get().ids
      save({ ids: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
    },
    setIds: (ids) => save({ ids: [...ids] }),

    setBusy: (id) => set({ busy: id }),

    markRun: (id, run) => save({ runs: { ...get().runs, [id]: run } }),
    markSweep: (at = Date.now()) => save({ lastRun: at }),

    prune: (existing) => {
      const s = get()
      const ids = s.ids.filter((id) => existing.has(id))
      const runs: Record<string, PlAutoRun> = {}
      for (const [id, r] of Object.entries(s.runs)) {
        if (existing.has(id)) runs[id] = r
      }
      if (ids.length === s.ids.length && Object.keys(runs).length === Object.keys(s.runs).length) return
      save({ ids, runs })
    },
  }
})
