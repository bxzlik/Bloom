import type { Artist } from './types'

/**
 * Площадка артиста по ПРЕФИКСУ его сквозного id (`ytm_`/`ym_`/`sp_`/`sc_`,
 * иначе локальный). Нужна там, где источник не сохранён отдельным полем —
 * напр. подписки в библиотеке (FollowedArtist) хранят только id, а провайдера
 * для открытия страницы (data-artist-provider) приходится восстанавливать.
 */
export const artistSourceFromId = (id: string): NonNullable<Artist['source']> =>
  id.startsWith('ytm_') ? 'ytmusic'
    : id.startsWith('ym_') ? 'yandex'
      : id.startsWith('sp_') ? 'spotify'
        : id.startsWith('sc_') ? 'soundcloud'
          : 'local'
