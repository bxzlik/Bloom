import { create } from 'zustand'

/**
 * История прослушиваний. `playHistory` массива в
 *
 * Формат записи: `{ id, ts, count }`. Source/queue/qIdx-снимки из старого
 * отложены — добавим, когда понадобится «Восстановить контекст». Сейчас
 * история нужна только для отображения списка «История» в библиотеке +
 * счётчика в sidebar.
 *
 * Лимит — 200 записей (MAX_HISTORY).
 */

export interface HistoryEntry {
  id: string
  ts: number
  /** Сколько раз пользователь слушал этот трек (любая длина). */
  count: number
}

const LS_KEY = 'bloom_play_history'
const MAX_HISTORY = 200

const load = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem(LS_KEY) || '[]'
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter(
        (e): e is HistoryEntry =>
          e && typeof e.id === 'string' && typeof e.ts === 'number',
      )
      .slice(0, MAX_HISTORY)
  } catch {
    return []
  }
}

const save = (entries: HistoryEntry[]): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
  } catch {
    // localStorage может быть переполнен — игнорируем.
  }
}

interface HistoryState {
  entries: HistoryEntry[]
  /**
   * Добавить новый трек или подтянуть существующий в начало (с инкрементом count).
   * `_histAdd`.
   */
  add: (id: string) => void
  /** Удалить трек из истории (по контекстному меню или при удалении трека). */
  remove: (id: string) => void
  /** Очистить всю историю. */
  clear: () => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: load(),

  add: (id) => {
    const cur = get().entries
    const existIdx = cur.findIndex((e) => e.id === id)
    let next: HistoryEntry[]
    if (existIdx !== -1) {
      const prev = cur[existIdx]!
      next = [
        { id, ts: Date.now(), count: prev.count + 1 },
        ...cur.slice(0, existIdx),
        ...cur.slice(existIdx + 1),
      ]
    } else {
      next = [{ id, ts: Date.now(), count: 1 }, ...cur].slice(0, MAX_HISTORY)
    }
    save(next)
    set({ entries: next })
  },

  remove: (id) => {
    const next = get().entries.filter((e) => e.id !== id)
    save(next)
    set({ entries: next })
  },

  clear: () => {
    save([])
    set({ entries: [] })
  },
}))
