import { create } from 'zustand'

export type DetailKind = 'artist' | 'album' | 'playlist'

/**
 * Что открыто в детальном виде. `id` — id сущности (`sc_artist_<id>` /
 * `sc_pl_<id>` / локальный pl id); `providerId` — у кого спрашивать данные
 * (`getProvider(providerId).getArtist/getAlbum/getPlaylist(id)`).
 * Поля title/cover/subtitle — для мгновенного hero до завершения сетевой загрузки.
 */
export interface DetailTarget {
  kind: DetailKind
  providerId: string
  id: string
  title: string
  cover?: string | null
  subtitle?: string
  /** Круглый аватар (артист) vs квадратная обложка (альбом/плейлист). */
  round?: boolean
}

interface DetailState {
  /** Стек переходов: артист → его альбом (кнопка «назад» = pop). */
  stack: DetailTarget[]
  /** Открыть с нуля (очищает стек). */
  open: (t: DetailTarget) => void
  /** Углубиться (альбом внутри артиста). */
  push: (t: DetailTarget) => void
  /** Назад на предыдущий уровень (или закрыть, если он один). */
  back: () => void
  /** Полностью закрыть детальный вид. */
  close: () => void
}

/**
 * Состояние детальных страниц поиска (артист / альбом / плейлист).
 * Стек произвольной глубины.
 */
export const useDetailStore = create<DetailState>((set) => ({
  stack: [],
  open: (t) => set({ stack: [t] }),
  push: (t) => set((s) => ({ stack: [...s.stack, t] })),
  back: () => set((s) => ({ stack: s.stack.length > 1 ? s.stack.slice(0, -1) : [] })),
  close: () => set({ stack: [] }),
}))
