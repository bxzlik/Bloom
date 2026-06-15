import { create } from 'zustand'

const KEY = 'bloom_genius_token'

const load = (): string => {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

interface GeniusState {
  /** Client Access Token из личного кабинета Genius (fallback-провайдер текстов). */
  token: string
  setToken: (t: string) => void
}

/**
 * Токен Genius объекта `Genius` — хранится в
 * `localStorage['bloom_genius_token']`. Реальный бэкенд читает токен из ПАРАМЕТРА
 * каждого `lyrics_request` (commands.rs:918 → lyrics_service), поэтому `requestLyrics`
 * подставляет `useGeniusStore.getState().token`. Rust-команда `genius_token` — no-op.
 */
export const useGeniusStore = create<GeniusState>((set) => ({
  token: load(),
  setToken: (t) => {
    const v = (t || '').trim()
    try {
      if (v) localStorage.setItem(KEY, v)
      else localStorage.removeItem(KEY)
    } catch {
      /* приватный режим / квота — токен остаётся только в памяти */
    }
    set({ token: v })
  },
}))
