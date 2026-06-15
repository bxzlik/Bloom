export interface Artist {
  id: string
  name: string
  avatar?: string | null
  verified?: boolean
  permalink?: string | null
  source?: 'local' | 'yandex' | 'soundcloud'
  /** Доп. поля для страницы артиста (заполняются провайдером в getArtist). */
  followers?: number
  /** Полное имя (full_name) — для подзаголовка профиля рядом с подписчиками. */
  fullName?: string
  description?: string
  website?: string | null
  genres?: string[]
  /** Баннер/визуал для фона hero. */
  bannerUrl?: string | null
}
