import { create } from 'zustand'
import type { Track } from '@entities/track'

/**
 * Персистентный реактивный стор дизлайков для гостевых SoundCloud-треков
 * (не лежат в библиотеке). Дизлайк — глобальная пометка, переживает сеанс волны
 * и перезапуск. `bloomScDislikes` (localStorage 'bloom_sc_dislikes').
 *
 * Лист-модуль (только zustand + тип Track) — его импортирует и host-мост волны,
 * и UI (кнопка дизлайка, модалка), оставаясь реактивным.
 */
export interface DislikeEntry {
  id: string
  name: string
  artist: string
  cover: string | null
  scId: string | number | null
  scPermalink: string | null
  ts: number
}

const KEY = 'bloom_sc_dislikes'

const load = (): DislikeEntry[] => {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

const save = (list: DislikeEntry[]): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

interface DislikesState {
  entries: DislikeEntry[]
  has: (id: string) => boolean
  add: (t: Track) => void
  remove: (id: string) => void
}

export const useDislikesStore = create<DislikesState>((set, get) => ({
  entries: load(),
  has: (id) => get().entries.some((e) => e.id === id),
  add: (t) => {
    if (get().entries.some((e) => e.id === t.id)) return
    const entry: DislikeEntry = {
      id: t.id,
      name: t.name,
      artist: t.artist,
      cover: t.cover ?? null,
      scId: t.scId ?? null,
      scPermalink: t.scPermalink ?? null,
      ts: Date.now(),
    }
    const next = [entry, ...get().entries]
    save(next)
    set({ entries: next })
  },
  remove: (id) => {
    const next = get().entries.filter((e) => e.id !== id)
    save(next)
    set({ entries: next })
  },
}))
