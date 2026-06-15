import { Fragment } from 'react'
import { parseArtists } from '@shared/lib/parseArtists'

export interface ArtistLinksProps {
  /** Строка артистов (может быть несколько через `,`/feat). */
  artist?: string | null
  /** SC user id артиста — для одиночного артиста, чтобы открыть точную страницу. */
  scId?: number | null
  /** Permalink артиста (фолбэк, если нет scId). */
  permalink?: string | null
  /**
   * Сквозной entity-id артиста (напр. `ym_artist_<id>`). Задан (для одиночного
   * артиста) → клик открывает страницу артиста НАПРЯМУЮ, минуя резолв по имени.
   * Используется площадками, где у трека уже есть точный id артиста (Yandex).
   */
  artistId?: string | null
  /**
   * Провайдер трека (`yandex`/`soundcloud`/…). Вешается на КАЖДЫЙ артист-спан,
   * даже без точного `artistId` (мульти-артист) — чтобы фолбэк-резолв по имени
   * в App шёл у нужной площадки, а не всегда у SoundCloud.
   */
  provider?: string | null
}

/**
 * Имена артистов как кликабельные `.tra-link` спаны `_artistLinksHTML`.
 * Клик ловит ГЛОБАЛЬНЫЙ делегированный обработчик (см. App) по классу `.tra-link` и
 * читает data-атрибуты — поэтому здесь нет onClick (единый путь для всех мест:
 * поиск, детальные страницы, очередь, плеер, библиотека).
 *
 * Мультиартисты бьются `parseArtists`; scId/permalink навешиваются только когда
 * артист один.
 */
export const ArtistLinks = ({ artist, scId, permalink, artistId, provider }: ArtistLinksProps) => {
  const parts = parseArtists(artist)
  const single = parts.length === 1
  return (
    <>
      {parts.map((a, i) => (
        <Fragment key={a + i}>
          {i > 0 && <span className="tra-sep">, </span>}
          <span
            className="tra-link"
            data-artist={a}
            {...(single && artistId ? { 'data-artist-id': artistId } : {})}
            {...(provider ? { 'data-artist-provider': provider } : {})}
            {...(single && scId != null ? { 'data-artist-sc-id': String(scId) } : {})}
            {...(single && permalink ? { 'data-artist-permalink': permalink } : {})}
          >
            {a}
          </span>
        </Fragment>
      ))}
    </>
  )
}
