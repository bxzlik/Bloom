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
  /** Id артиста-владельца (альбом) — переход на его страницу с карточки. */
  ownerId?: string
  /** Год выпуска (у альбомов; у плейлистов чаще пусто). */
  year?: string
  /** ISO-дата выхода (альбом) — подпись «14 августа» в карточке релиза. */
  releaseDate?: string
  /** Тип релиза от площадки: `single` | `compilation` | …; пусто = альбом. */
  albumType?: string
  /** Источник: 'local' | 'yandex' | 'soundcloud' | 'ytmusic' | 'wave' (виртуальный). */
  source?: 'local' | 'yandex' | 'soundcloud' | 'ytmusic' | 'wave'
  /** URL/permalink для повторной загрузки из источника (SC «Обновить треки»). */
  sourceUrl?: string | null
  /** ISO-дата создания/обновления. */
  updatedAt?: string
}
