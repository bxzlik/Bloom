import type { Track } from '@entities/track'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import { t as i18nT } from '@shared/i18n'
import type { YtmRawTrack, YtmRawArtist, YtmRawAlbum, YtmRawPlaylist } from '../api/ytmClient'

/**
 * Мапперы YouTube Music: сырые ответы Rust → общие `entities/*`. Дизайн карточек/
 * страниц/плеера один на все площадки — провайдер лишь приводит свою выдачу к этим
 * сущностям. Зеркало `features/yandex/model/mappers`.
 *
 * Сквозные id с префиксом источника:
 *   трек     → `ytm_<videoId>`
 *   артист   → `ytm_artist_<browseId>`
 *   альбом   → `ytm_album_<browseId>`
 *   плейлист → `ytm_pl_<browseId>`
 *
 * Фолбэки названий переиспользуют общие `ym.fallback.*` (те же слова на язык).
 */

export const ytmTrackId = (videoId: string): string => `ytm_${videoId}`
export const ytmArtistId = (browseId: string): string => `ytm_artist_${browseId}`
export const ytmAlbumId = (browseId: string): string => `ytm_album_${browseId}`
export const ytmPlaylistId = (browseId: string): string => `ytm_pl_${browseId}`

/** Обратный разбор сквозного id в исходный videoId/browseId (по префиксу). */
export const parseYtmTrackId = (id: string): string | null =>
  id.startsWith('ytm_') && !id.startsWith('ytm_artist_') && !id.startsWith('ytm_album_') && !id.startsWith('ytm_pl_')
    ? id.slice('ytm_'.length)
    : null
export const parseYtmArtistId = (id: string): string | null =>
  id.startsWith('ytm_artist_') ? id.slice('ytm_artist_'.length) : null
export const parseYtmAlbumId = (id: string): string | null =>
  id.startsWith('ytm_album_') ? id.slice('ytm_album_'.length) : null
export const parseYtmPlaylistId = (id: string): string | null =>
  id.startsWith('ytm_pl_') ? id.slice('ytm_pl_'.length) : null

/** Длительность из секунд → "m:ss" (формат поля Track.dur). */
const fmtDur = (sec: number): string => {
  const s = Math.round(sec || 0)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * YTM-трек → унифицированный `Track`. Несёт `_ytm`/`ytmVideoId` — по ним
 * source-resolver плеера резолвит стрим (см. ytmResolveStream). `_ytmTemp`
 * помечает эфемерный (из выдачи поиска) для trackRegistry.clearTemp.
 */
export const toTrack = (t: YtmRawTrack): Track => ({
  id: ytmTrackId(t.id),
  name: t.title || i18nT('ym.fallback.untitled'),
  artist: t.artist || i18nT('ym.fallback.unknown'),
  dur: fmtDur(t.duration),
  cover: t.cover || null,
  _ytm: true,
  _ytmTemp: true,
  ytmVideoId: t.id,
  artistId: t.artistId ? ytmArtistId(t.artistId) : undefined,
  artistProvider: t.artistId ? 'ytmusic' : undefined,
})

export const toArtist = (a: YtmRawArtist): Artist => ({
  id: ytmArtistId(a.id),
  name: a.name || i18nT('ym.fallback.unknown'),
  avatar: a.cover || null,
  source: 'ytmusic',
})

export const toAlbum = (a: YtmRawAlbum): Playlist => ({
  id: ytmAlbumId(a.id),
  title: a.title || i18nT('ym.fallback.album'),
  cover: a.cover || null,
  ownerName: a.artist || '',
  source: 'ytmusic',
})

export const toPlaylist = (p: YtmRawPlaylist): Playlist => ({
  id: ytmPlaylistId(p.id),
  title: p.title || i18nT('ym.fallback.playlist'),
  cover: p.cover || null,
  ownerName: p.ownerName || '',
  source: 'ytmusic',
})
