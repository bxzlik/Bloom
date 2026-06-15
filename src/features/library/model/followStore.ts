import { create } from 'zustand'

/**
 * Подписки на артистов. `followedArtists` + `followArtist` /
 * `unfollowArtist` / `isFollowingArtist`.
 *
 * Хранение — localStorage `bloom_followed_artists` (как favStore/playlistStore;
 * старый дублировал ещё и в IDB — для bloom MVP достаточно localStorage).
 * Кнопка «подписаться» живёт на странице артиста (`.sp-follow-btn`).
 */

export interface FollowedArtist {
  id: string
  name: string
  avatar: string | null
  scId: string | null
  scPermalink: string | null
  followedAt: number
}

const LS_KEY = 'bloom_followed_artists'

const load = (): FollowedArtist[] => {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    if (Array.isArray(arr)) return arr.filter((a): a is FollowedArtist => a && typeof a.id === 'string')
  } catch {
    // повреждённый JSON — пустой список
  }
  return []
}

const save = (list: FollowedArtist[]): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    // localStorage переполнен — игнорируем
  }
}

interface FollowState {
  artists: FollowedArtist[]
  isFollowing: (id: string) => boolean
  follow: (data: Omit<FollowedArtist, 'followedAt'>) => void
  unfollow: (id: string) => void
}

export const useFollowStore = create<FollowState>((set, get) => ({
  artists: load(),

  isFollowing: (id) => get().artists.some((a) => a.id === id),

  follow: (data) => {
    if (get().artists.some((a) => a.id === data.id)) return
    const next = [...get().artists, { ...data, followedAt: Date.now() }]
    save(next)
    set({ artists: next })
  },

  unfollow: (id) => {
    const next = get().artists.filter((a) => a.id !== id)
    save(next)
    set({ artists: next })
  },
}))
