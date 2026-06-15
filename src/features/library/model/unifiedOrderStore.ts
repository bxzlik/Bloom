import { create } from 'zustand'

/**
 * Пользовательский порядок объединённого списка сайдбара (плейлисты+папки)
 * с persistence в localStorage. Массив `{type,id,pinned}`.
 *
 * Применяется ТОЛЬКО когда sortMode === 'default'. При других режимах сорт идёт
 * по name/type без учёта порядка, НО pinned всё равно выносятся наверх
 *.
 *
 * Новые папки/плейлисты, отсутствующие в порядке, дописываются в конец при
 * нормализации `applyOrder()`.
 */

export type UnifiedItem = { type: 'playlist' | 'folder' | 'artist'; id: string; pinned?: boolean }

const LS_KEY = 'bloom_lib_unified_order'

const load = (): UnifiedItem[] => {
  try {
    const raw = localStorage.getItem(LS_KEY) || '[]'
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter(
        (x): x is UnifiedItem =>
          x &&
          (x.type === 'playlist' || x.type === 'folder' || x.type === 'artist') &&
          typeof x.id === 'string',
      )
      .map((x) => ({ type: x.type, id: x.id, pinned: !!x.pinned }))
  } catch {
    return []
  }
}

const save = (items: UnifiedItem[]): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items))
  } catch {
    /* localStorage переполнен — игнорируем */
  }
}

const keyOf = (type: UnifiedItem['type'], id: string): string => `${type}:${id}`

interface UnifiedOrderState {
  order: UnifiedItem[]
  /** Записать новый порядок целиком (после drop). Сохраняет pinned-флаги. */
  setOrder: (next: UnifiedItem[]) => void
  /** Переключить «закреплено» для записи (создаёт запись, если её ещё нет). */
  togglePin: (type: UnifiedItem['type'], id: string) => void
  /** Закреплён ли элемент. */
  isPinned: (type: UnifiedItem['type'], id: string) => boolean
  /**
   * Применить custom порядок к актуальному набору entries. Возвращает
   * отсортированные entries; новые (которых нет в order) — в конец, удалённые —
   * выкидываются. Не мутирует стор. (pinned-вынос наверх делает caller.)
   */
  applyOrder: <T extends UnifiedItem>(entries: T[]) => T[]
}

export const useUnifiedOrderStore = create<UnifiedOrderState>((set, get) => ({
  order: load(),

  setOrder: (next) => {
    // Переносим pinned-флаги из текущего порядка (newKeys их не несут).
    const pinnedBy = new Map(get().order.map((o) => [keyOf(o.type, o.id), !!o.pinned]))
    const merged = next.map((o) => ({
      type: o.type,
      id: o.id,
      pinned: o.pinned ?? pinnedBy.get(keyOf(o.type, o.id)) ?? false,
    }))
    save(merged)
    set({ order: merged })
  },

  togglePin: (type, id) => {
    const order = get().order.slice()
    const i = order.findIndex((o) => o.type === type && o.id === id)
    if (i >= 0) order[i] = { ...order[i]!, pinned: !order[i]!.pinned }
    else order.push({ type, id, pinned: true })
    save(order)
    set({ order })
  },

  isPinned: (type, id) =>
    !!get().order.find((o) => o.type === type && o.id === id)?.pinned,

  applyOrder: (entries) => {
    const order = get().order
    if (!order.length) return entries.slice()
    const key = (x: UnifiedItem): string => keyOf(x.type, x.id)
    const byKey = new Map(entries.map((e) => [key(e), e]))
    const out: typeof entries = []
    const used = new Set<string>()
    for (const o of order) {
      const k = key(o)
      const e = byKey.get(k)
      if (e) {
        out.push(e)
        used.add(k)
      }
    }
    for (const e of entries) {
      if (!used.has(key(e))) out.push(e)
    }
    return out
  },
}))
