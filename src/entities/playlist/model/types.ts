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
  /** Источник: 'local' | 'yandex' | 'soundcloud' | 'wave' (виртуальный). */
  source?: 'local' | 'yandex' | 'soundcloud' | 'wave'
  /** URL/permalink для повторной загрузки из источника (SC «Обновить треки»). */
  sourceUrl?: string | null
  /** ISO-дата создания/обновления. */
  updatedAt?: string
}
