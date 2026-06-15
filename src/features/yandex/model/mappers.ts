import type { Track } from '@entities/track'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import type { YmRawTrack, YmRawArtist, YmRawAlbum, YmRawPlaylist } from '../api/ymClient'

/**
 * Мапперы Яндекс.Музыки: сырые ответы Rust → общие `entities/*`. Дизайн карточек/
 * страниц/плеера один на все площадки — провайдер лишь приводит свою выдачу к этим
 * сущностям (см. project-bloom-platform-layer / project-bloom-unified-provider-ux).
 *
 * Сквозные id с префиксом источника:
 *   трек     → `ym_<id>`
 *   артист   → `ym_artist_<id>`
 *   альбом   → `ym_album_<id>`
 *   плейлист → `ym_pl_<owner>~<kind>`  (owner+kind нужны Rust-команде ym_playlist)
 */

export const ymTrackId = (id: string): string => `ym_${id}`
export const ymArtistId = (id: string): string => `ym_artist_${id}`
export const ymAlbumId = (id: string): string => `ym_album_${id}`
export const ymPlaylistId = (owner: string, kind: string): string => `ym_pl_${owner}~${kind}`
/** Id публичного плейлиста нового формата (music.yandex.ru/playlists/<uuid>). */
export const ymPlaylistUuidId = (uuid: string): string => `ym_plu_${uuid}`

/** Разобрать `ym_pl_<owner>~<kind>` обратно в owner+kind (по последнему `~`). */
export const parseYmPlaylistId = (id: string): { owner: string; kind: string } | null => {
  const body = id.replace(/^ym_pl_/, '')
  const i = body.lastIndexOf('~')
  if (i < 0) return null
  return { owner: body.slice(0, i), kind: body.slice(i + 1) }
}

/** Разобрать `ym_plu_<uuid>` обратно в uuid (новый формат). */
export const parseYmPlaylistUuidId = (id: string): string | null =>
  id.startsWith('ym_plu_') ? id.slice('ym_plu_'.length) : null

/** Длительность из секунд → "m:ss" (формат поля Track.dur). */
const fmtDur = (sec: number): string => {
  const s = Math.round(sec || 0)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * YM-трек → унифицированный `Track`. Несёт `_ym`/`ymTrackId` — по ним
 * source-resolver плеера резолвит стрим (см. ymResolveStream). `_ymTemp`
 * помечает эфемерный (из выдачи поиска) для trackRegistry.clearTemp.
 * `artistId`/`artistProvider` — для клика по имени артиста (→ страница артиста).
 */
export const toTrack = (t: YmRawTrack): Track => ({
  id: ymTrackId(t.id),
  name: t.title || 'Без названия',
  artist: t.artist || 'Неизвестен',
  dur: fmtDur(t.duration),
  cover: t.cover || null,
  year: t.year || undefined,
  _ym: true,
  _ymTemp: true,
  ymTrackId: t.id,
  ymAvailable: t.available,
  artistId: t.artistId ? ymArtistId(t.artistId) : undefined,
  artistProvider: t.artistId ? 'yandex' : undefined,
})

export const toArtist = (a: YmRawArtist): Artist => ({
  id: ymArtistId(a.id),
  name: a.name || 'Неизвестен',
  avatar: a.cover || null,
  source: 'yandex',
})

export const toAlbum = (a: YmRawAlbum): Playlist => ({
  id: ymAlbumId(a.id),
  title: a.title || 'Альбом',
  cover: a.cover || null,
  ownerName: a.artist || '',
  trackCount: a.trackCount || 0,
  source: 'yandex',
})

export const toPlaylist = (p: YmRawPlaylist): Playlist => ({
  id: ymPlaylistId(p.owner, p.kind),
  title: p.title || 'Плейлист',
  cover: p.cover || null,
  trackCount: p.trackCount || 0,
  ownerName: p.owner || '',
  source: 'yandex',
})
