import { create } from 'zustand'
import type { Playlist } from './playlist'
import { newPlaylistId } from './playlist'

const LS_KEY = 'bloom_playlists'

const loadFromStorage = (): Playlist[] => {
  try {
    const raw = localStorage.getItem(LS_KEY) || '[]'
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (p): p is Playlist =>
        p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.trs),
    )
  } catch {
    return []
  }
}

const saveToStorage = (playlists: Playlist[]): void => {
  try {
    // savePlaylists: сохраняем только базовые поля.
    const slim = playlists.map((p) => ({
      id: p.id,
      name: p.name,
      trs: p.trs,
      desc: p.desc,
      cover: p.cover,
      scSource: p.scSource,
      scLikes: p.scLikes,
    }))
    localStorage.setItem(LS_KEY, JSON.stringify(slim))
  } catch {
    // localStorage может быть переполнен — игнорируем.
  }
}

/**
 * Стор плейлистов с автоматическим persist в `localStorage[bloom_playlists]`.
 *
 * Поведение:
 * - createPl(name, desc?, cover?) — push новый, id=newPlaylistId()
 * - renamePl, deletePl, addTrackToPl, removeTrackFromPl, reorderPl, setPlCover, setPlDesc
 *
 * Все операции синхронно обновляют стор и сохраняют в localStorage.
 */
export interface PlaylistState {
  playlists: Playlist[]
  createPl: (
    name: string,
    desc?: string,
    cover?: string,
    opts?: { scSource?: string; scLikes?: string },
  ) => Playlist
  renamePl: (id: string, name: string) => void
  setPlDesc: (id: string, desc: string | undefined) => void
  setPlCover: (id: string, cover: string | undefined) => void
  deletePl: (id: string) => void
  addTrackToPl: (id: string, trackId: string) => void
  removeTrackFromPl: (id: string, trackId: string) => void
  /** Заменить порядок треков целиком (для drag-reorder в фазе D). */
  reorderPlTracks: (id: string, trackIds: string[]) => void
  /** Переупорядочить плейлисты в сайдбаре (drag в фазе D). */
  reorderPlaylists: (ids: string[]) => void
  /** Принудительная подмена (например после импорта .bloomplaylist). */
  replaceAll: (next: Playlist[]) => void
  /**
   * Удалить набор track id из ВСЕХ плейлистов (при удалении трека из библиотеки).
   * `playlists.forEach(p=>p.trs=p.trs.filter(x=>x!==id))`.
   */
  purgeTracks: (ids: string[]) => void
  /**
   * Заменить id трека во ВСЕХ плейлистах (переключение площадки — id меняется).
   * Позиция сохраняется; если newId уже был в плейлисте — дубль убираем.
   */
  remapTrack: (oldId: string, newId: string) => void
}

export const usePlaylistStore = create<PlaylistState>((set) => {
  const persist = (next: Playlist[]) => {
    saveToStorage(next)
    return { playlists: next }
  }

  return {
    playlists: loadFromStorage(),

    createPl: (name, desc, cover, opts) => {
      const pl: Playlist = {
        id: newPlaylistId(),
        name,
        trs: [],
        ...(desc ? { desc } : {}),
        ...(cover ? { cover } : {}),
        ...(opts?.scSource ? { scSource: opts.scSource } : {}),
        ...(opts?.scLikes ? { scLikes: opts.scLikes } : {}),
      }
      set((s) => persist([...s.playlists, pl]))
      return pl
    },

    renamePl: (id, name) =>
      set((s) => persist(s.playlists.map((p) => (p.id === id ? { ...p, name } : p)))),

    setPlDesc: (id, desc) =>
      set((s) =>
        persist(s.playlists.map((p) => (p.id === id ? { ...p, desc } : p))),
      ),

    setPlCover: (id, cover) =>
      set((s) =>
        persist(s.playlists.map((p) => (p.id === id ? { ...p, cover } : p))),
      ),

    deletePl: (id) =>
      set((s) => persist(s.playlists.filter((p) => p.id !== id))),

    addTrackToPl: (id, trackId) =>
      set((s) =>
        persist(
          s.playlists.map((p) =>
            p.id === id && !p.trs.includes(trackId)
              ? { ...p, trs: [trackId, ...p.trs] } // новый трек — наверх плейлиста
              : p,
          ),
        ),
      ),

    removeTrackFromPl: (id, trackId) =>
      set((s) =>
        persist(
          s.playlists.map((p) =>
            p.id === id ? { ...p, trs: p.trs.filter((t) => t !== trackId) } : p,
          ),
        ),
      ),

    reorderPlTracks: (id, trackIds) =>
      set((s) =>
        persist(
          s.playlists.map((p) => (p.id === id ? { ...p, trs: trackIds } : p)),
        ),
      ),

    reorderPlaylists: (ids) =>
      set((s) => {
        const map = new Map(s.playlists.map((p) => [p.id, p]))
        const next: Playlist[] = []
        for (const id of ids) {
          const pl = map.get(id)
          if (pl) {
            next.push(pl)
            map.delete(id)
          }
        }
        // Не упомянутые в новом порядке добавляем в хвост.
        for (const pl of map.values()) next.push(pl)
        return persist(next)
      }),

    replaceAll: (next) => set(persist(next)),

    purgeTracks: (ids) =>
      set((s) => {
        if (!ids.length) return s
        const remove = new Set(ids)
        let changed = false
        const next = s.playlists.map((p) => {
          if (!p.trs.some((id) => remove.has(id))) return p
          changed = true
          return { ...p, trs: p.trs.filter((id) => !remove.has(id)) }
        })
        return changed ? persist(next) : s
      }),

    remapTrack: (oldId, newId) =>
      set((s) => {
        let changed = false
        const next = s.playlists.map((p) => {
          if (!p.trs.includes(oldId)) return p
          changed = true
          const trs = p.trs
            .map((id) => (id === oldId ? newId : id))
            .filter((id, i, arr) => arr.indexOf(id) === i) // убрать дубль, если newId уже был
          return { ...p, trs }
        })
        return changed ? persist(next) : s
      }),
  }
})
