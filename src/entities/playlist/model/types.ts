/**
 * Унифицированный плейлист (локальный + Yandex).
 * Поля минимальные — расширяем по мере появления реальных источников.
 */
export interface Playlist {
  id: string
  title: string
  cover?: string | null
  trackCount?: number
  ownerName?: string
  /** Аватарка владельца/артиста (кружок рядом с именем в hero). */
  ownerAvatar?: string | null
  /** Год выпуска (у альбомов; у плейлистов чаще пусто). */
  year?: string
  /** Источник: 'local' | 'yandex' | 'soundcloud' | 'ytmusic' | 'wave' (виртуальный). */
  source?: 'local' | 'yandex' | 'soundcloud' | 'ytmusic' | 'wave'
  /** URL/permalink для повторной загрузки из источника (SC «Обновить треки»). */
  sourceUrl?: string | null
  /** ISO-дата создания/обновления. */
  updatedAt?: string
}
