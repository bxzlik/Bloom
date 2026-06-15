import { create } from 'zustand'

/**
 * Стор лайков (Set track-ID + время добавления).
 * Persist в `localStorage[bloom_favs]` — массив `{ id, favAt }`.
 *
 * Лайки держим в отдельном сторе (а не на самом Track), чтобы не мешать
 * смешанным источникам треков (folder_watcher не знает про лайки, ID3 теги тоже).
 *
 * Считается, что трек залайкан, если его id есть в `favs`.
 */

const LS_KEY = 'bloom_favs'

interface FavEntry {
  id: string
  favAt: number
}

const loadFavs = (): Map<string, number> => {
  try {
    const raw = localStorage.getItem(LS_KEY) || '[]'
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return new Map()
    const m = new Map<string, number>()
    for (const e of arr as FavEntry[]) {
      if (e && typeof e.id === 'string') m.set(e.id, e.favAt ?? Date.now())
    }
    return m
  } catch {
    return new Map()
  }
}

const saveFavs = (favs: Map<string, number>): void => {
  try {
    const arr: FavEntry[] = Array.from(favs, ([id, favAt]) => ({ id, favAt }))
    localStorage.setItem(LS_KEY, JSON.stringify(arr))
  } catch {
    // ignore (quota)
  }
}

export interface FavState {
  /** Map id → favAt (timestamp). Sort треков по favAt desc — для views. */
  favs: Map<string, number>
  isFav: (id: string) => boolean
  toggleFav: (id: string) => boolean // returns new state
  setFav: (id: string, on: boolean) => void
  count: () => number
  /** Снять лайк с набора id (при удалении треков из библиотеки). No-op если ничего не залайкано. */
  purge: (ids: string[]) => void
  /**
   * Переупорядочить любимые. Перезаписываем favAt timestamps так, чтобы
   * первый id в массиве получил самое позднее время — а значит при сортировке
   * `favs.get(b.id) - favs.get(a.id)` desc оказался первым.
   *
   */
  reorderFavs: (ids: string[]) => void
}

export const useFavStore = create<FavState>((set, get) => ({
  favs: loadFavs(),

  isFav: (id) => get().favs.has(id),

  toggleFav: (id) => {
    const next = new Map(get().favs)
    let on: boolean
    if (next.has(id)) {
      next.delete(id)
      on = false
    } else {
      next.set(id, Date.now())
      on = true
    }
    saveFavs(next)
    set({ favs: next })
    return on
  },

  setFav: (id, on) => {
    const next = new Map(get().favs)
    if (on) {
      if (!next.has(id)) next.set(id, Date.now())
    } else {
      next.delete(id)
    }
    saveFavs(next)
    set({ favs: next })
  },

  count: () => get().favs.size,

  purge: (ids) => {
    const cur = get().favs
    if (!ids.length || !cur.size) return
    let changed = false
    const next = new Map(cur)
    for (const id of ids) {
      if (next.delete(id)) changed = true
    }
    if (!changed) return
    saveFavs(next)
    set({ favs: next })
  },

  reorderFavs: (ids) => {
    const cur = get().favs
    if (!ids.length || !cur.size) return
    // Берём timestamp'ы из текущих fav'ов и сортируем desc — потом раздаём
    // их по новому порядку: первый id в `ids` получает максимальный ts.
    const stamps: number[] = []
    for (const id of ids) {
      const ts = cur.get(id)
      if (ts != null) stamps.push(ts)
    }
    stamps.sort((a, b) => b - a)
    // Если стэмпов недостаточно (странный edge case) — добиваем Date.now()-ками.
    while (stamps.length < ids.length) stamps.push(Date.now() - stamps.length)
    const next = new Map(cur)
    ids.forEach((id, i) => {
      if (next.has(id)) next.set(id, stamps[i]!)
    })
    saveFavs(next)
    set({ favs: next })
  },
}))
