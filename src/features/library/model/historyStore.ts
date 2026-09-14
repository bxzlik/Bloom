import { create } from 'zustand'
import {
  historyRows,
  subscribePlayStats,
  type HistoryRow,
} from '@/db/playStats'

/**
 * Список «История» — представление над журналом прослушиваний (`db/playStats`
 * поверх `db/playLog`), а не собственное хранилище.
 *
 * Раньше это был массив в localStorage с лимитом 200 УНИКАЛЬНЫХ треков и
 * вытеснением по давности. Поднимать лимит было бессмысленно: список хранит
 * только id, а треки площадок после перезапуска резолвятся из `trackCache`
 * (300 записей) и `coverCache` (400) — что не разрезолвилось, `currentView`
 * молча пропускает. То есть настоящий потолок задавали совсем другие числа в
 * других файлах. Журнал же держит 60k событий и снимок трека в сторе `meta`,
 * который специально переживает рестарт и НЕ подрезается.
 *
 * Что здесь осталось своего — только «что пользователь спрятал». Хранятся не
 * id, а отметки времени: «прятать всё по момент T». Иначе трек, удалённый
 * вчера и снова прослушанный сегодня, не вернулся бы в список, хотя должен.
 *
 * Скрытие НЕ трогает статистику: журнал остаётся целым, «Итоги» и цифры
 * профиля считаются по нему. История — это список, а не учёт.
 */

export type HistoryEntry = HistoryRow

const HIDE_KEY = 'bloom_history_hidden'

interface HideState {
  /** «Очистить историю» — один рубеж на всё. */
  before: number
  /** Точечные удаления: id → момент, по который прятать. */
  byId: Record<string, number>
}

const loadHide = (): HideState => {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDE_KEY) || '{}')
    return {
      before: typeof raw?.before === 'number' ? raw.before : 0,
      byId: raw?.byId && typeof raw.byId === 'object' ? raw.byId : {},
    }
  } catch {
    return { before: 0, byId: {} }
  }
}

const saveHide = (h: HideState): void => {
  try {
    localStorage.setItem(HIDE_KEY, JSON.stringify(h))
  } catch {
    // Переполнен localStorage — переживём: отметки скрытия крошечные, а
    // потеря их означает лишь, что удалённая строка вернётся в список.
  }
}

interface HistoryState {
  entries: HistoryEntry[]
  /** Убрать трек из списка (события в журнале остаются). */
  remove: (id: string) => void
  /** Очистить список (статистика и «Итоги» не трогаются). */
  clear: () => void
  /**
   * «Сменить площадку»: отметка скрытия переезжает вместе с прослушиваниями,
   * иначе спрятанный трек вернулся бы в список под новым id.
   */
  renameTrack: (oldId: string, newId: string) => void
  /**
   * Пересобрать из журнала. Зовётся по подписке на `playStats` — то есть на
   * каждое зачтённое прослушивание и после прогрева журнала на старте.
   */
  refresh: () => void
}

export const useHistoryStore = create<HistoryState>((set, get) => {
  let hide = loadHide()

  const rows = (): HistoryEntry[] => historyRows(hide)

  const store: HistoryState = {
    entries: rows(),

    remove: (id) => {
      hide = { ...hide, byId: { ...hide.byId, [id]: Date.now() } }
      saveHide(hide)
      set({ entries: rows() })
    },

    clear: () => {
      // Точечные отметки больше не нужны — общий рубеж их перекрывает.
      hide = { before: Date.now(), byId: {} }
      saveHide(hide)
      set({ entries: rows() })
    },

    renameTrack: (oldId, newId) => {
      const at = hide.byId[oldId]
      if (at === undefined || oldId === newId) return
      const byId = { ...hide.byId }
      delete byId[oldId]
      byId[newId] = Math.max(at, byId[newId] ?? 0)
      hide = { ...hide, byId }
      saveHide(hide)
      set({ entries: rows() })
    },

    refresh: () => set({ entries: rows() }),
  }

  // Журнал прогревается асинхронно на старте: до этого `historyRows` отдаёт
  // старые записи, после — полную историю. Подписка закрывает этот момент.
  subscribePlayStats(() => get().refresh())

  return store
})
