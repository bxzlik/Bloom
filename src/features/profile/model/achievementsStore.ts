import { create } from 'zustand'

/**
 * Стор разблокированных достижений: ключ `${achId}:${tierIndex}` → timestamp
 * получения. Persist в `localStorage[bloom_achievements]`.
 *
 * Сами значения достижений считаются реактивно из других сторов
 * (`buildAchievements`), здесь хранятся ТОЛЬКО даты разблокировки — чтобы
 * показывать «получено N июня» и тостить новые.
 *
 * Анти-спам на первом запуске: пока `seeded` не выставлен, самый первый `sync`
 * молча записывает все уже выполненные достижения (без тостов) — иначе у
 * существующего пользователя при первом открытии вкладки разом всплыло бы 20+
 * тостов. Дальше тостим только реально новые анлоки.
 */

const LS_KEY = 'bloom_achievements'
const SEEDED_KEY = 'bloom_ach_seeded'

const tierKey = (id: string, tierIdx: number) => `${id}:${tierIdx}`

const load = (): Record<string, number> => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, number>
  } catch {
    // повреждённый JSON — начинаем с пустого
  }
  return {}
}

const save = (m: Record<string, number>): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m))
  } catch {
    // quota — игнорируем
  }
}

const loadSeeded = (): boolean => {
  try {
    return localStorage.getItem(SEEDED_KEY) === '1'
  } catch {
    return false
  }
}

interface AchStoreState {
  /** ключ tier → timestamp получения. */
  unlocked: Record<string, number>
  seeded: boolean
  /**
   * Синхронизировать с текущим состоянием достижений. `reached` — карта
   * achId → сколько тиров пройдено сейчас (0..3). Возвращает список ключей
   * НОВЫХ разблокировок (`${id}:${idx}`), чтобы вызывающий мог тостить.
   * На первом (seeding) вызове ничего не возвращает.
   */
  sync: (reached: Record<string, number>) => string[]
  /** Сбросить все достижения (часть «очистить статистику»). */
  clear: () => void
}

export const useAchievementsStore = create<AchStoreState>((set, get) => ({
  unlocked: load(),
  seeded: loadSeeded(),

  sync: (reached) => {
    const cur = get().unlocked
    const next = { ...cur }
    const fresh: string[] = []
    const now = Date.now()
    for (const [id, count] of Object.entries(reached)) {
      for (let i = 0; i < count; i++) {
        const k = tierKey(id, i)
        if (next[k] == null) {
          next[k] = now
          fresh.push(k)
        }
      }
    }
    if (!fresh.length && get().seeded) return []

    save(next)
    if (!get().seeded) {
      try {
        localStorage.setItem(SEEDED_KEY, '1')
      } catch {
        /* ignore */
      }
      set({ unlocked: next, seeded: true })
      return [] // первый прогон — без тостов
    }
    set({ unlocked: next })
    return fresh
  },

  clear: () => {
    save({})
    try {
      localStorage.removeItem(SEEDED_KEY)
    } catch {
      /* ignore */
    }
    set({ unlocked: {}, seeded: false })
  },
}))

export { tierKey }
