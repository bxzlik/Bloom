import { create } from 'zustand'

/**
 * Дневной журнал активности. `_activityLog`:
 * `dateKey → число прослушиваний за день`, dateKey = `YYYY-MM-DD` (UTC, ISO).
 *
 * Используется для «рекорда дня» в модалке статистики и дневного графика.
 * Инкрементируется в `loadPlay` рядом с `useHistoryStore.add`. Журнал пуст до
 * первого прослушивания (собирается с момента появления записи).
 */

const LS_KEY = 'bloom_activity'

const load = (): Record<string, number> => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, number>
  } catch {
    // повреждённый JSON — начинаем с пустого журнала
  }
  return {}
}

const save = (log: Record<string, number>): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(log))
  } catch {
    // localStorage переполнен — игнорируем
  }
}

interface ActivityState {
  log: Record<string, number>
  /** Засчитать одно прослушивание в сегодняшний день. */
  add: () => void
  /** Очистить журнал (сброс данных). */
  clear: () => void
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  log: load(),

  add: () => {
    const day = new Date().toISOString().slice(0, 10)
    const next = { ...get().log, [day]: (get().log[day] || 0) + 1 }
    save(next)
    set({ log: next })
  },

  clear: () => {
    save({})
    set({ log: {} })
  },
}))
