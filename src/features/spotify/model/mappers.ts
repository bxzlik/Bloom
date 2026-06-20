import type { Track } from '@entities/track'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import { t as i18nT } from '@shared/i18n'
import type { SpRawTrack, SpRawArtist, SpRawAlbum, SpRawPlaylist } from '../api/spClient'

/**
 * Мапперы Spotify: сырые ответы Rust → общие `entities/*`. Зеркало
 * `features/ytmusic/model/mappers`. Дизайн карточек/страниц/плеера один на все
 * площадки — провайдер лишь приводит выдачу к этим сущностям.
 *
 * Сквозные id с префиксом источника:
 *   трек     → `sp_<id>`
 *   артист   → `sp_artist_<id>`
 *   альбом   → `sp_album_<id>`
 *   плейлист → `sp_pl_<id>`
 *
 * Фолбэки названий переиспользуют общие `ym.fallback.*`.
 */

export const spTrackId = (id: string): string => `sp_${id}`
export const spArtistId = (id: string): string => `sp_artist_${id}`
export const spAlbumId = (id: string): string => `sp_album_${id}`
export const spPlaylistId = (id: string): string => `sp_pl_${id}`

/** Обратный разбор сквозного id в исходный Spotify id (по префиксу). */
export const parseSpTrackId = (id: string): string | null =>
  id.startsWith('sp_') && !id.startsWith('sp_artist_') && !id.startsWith('sp_album_') && !id.startsWith('sp_pl_')
    ? id.slice('sp_'.length)
    : null
export const parseSpArtistId = (id: string): string | null =>
  id.startsWith('sp_artist_') ? id.slice('sp_artist_'.length) : null
export const parseSpAlbumId = (id: string): string | null =>
  id.startsWith('sp_album_') ? id.slice('sp_album_'.length) : null
export const parseSpPlaylistId = (id: string): string | null =>
  id.startsWith('sp_pl_') ? id.slice('sp_pl_'.length) : null

/** Длительность из секунд → "m:ss" (формат поля Track.dur). */
const fmtDur = (sec: number): string => {
  const s = Math.round(sec || 0)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * Spotify-трек → унифицированный `Track`. Несёт `_sp`/`spTrackId`. Воспроизведение
 * — бридж на SoundCloud (см. spResolveStream). `_spTemp` помечает эфемерный (из
 * выдачи поиска) для trackRegistry.clearTemp.
 */
export const toTrack = (t: SpRawTrack): Track => ({
  id: spTrackId(t.id),
  name: t.title || i18nT('ym.fallback.untitled'),
  artist: t.artist || i18nT('ym.fallback.unknown'),
  dur: fmtDur(t.duration),
  cover: t.cover || null,
  _sp: true,
  _spTemp: true,
  spTrackId: t.id,
  artistId: t.artistId ? spArtistId(t.artistId) : undefined,
  artistProvider: t.artistId ? 'spotify' : undefined,
})

export const toArtist = (a: SpRawArtist): Artist => ({
  id: spArtistId(a.id),
  name: a.name || i18nT('ym.fallback.unknown'),
  avatar: a.cover || null,
  source: 'spotify',
})

export const toAlbum = (a: SpRawAlbum): Playlist => ({
  id: spAlbumId(a.id),
  title: a.title || i18nT('ym.fallback.album'),
  cover: a.cover || null,
  ownerName: a.artist || '',
  source: 'spotify',
})

export const toPlaylist = (p: SpRawPlaylist): Playlist => ({
  id: spPlaylistId(p.id),
  title: p.title || i18nT('ym.fallback.playlist'),
  cover: p.cover || null,
  ownerName: p.ownerName || '',
  source: 'spotify',
})
