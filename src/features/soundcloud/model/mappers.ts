import type { Track } from '@entities/track'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import type { ScRawTrack, ScRawArtist, ScRawPlaylist } from '../api/scClient'

/** Длительность из миллисекунд SC → "m:ss" (формат поля Track.dur). */
const fmtDur = (ms: number): string => {
  const s = Math.round((ms || 0) / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** Сквозной id с префиксом источника (см. project-bloom-platform-layer). */
export const scTrackId = (id: number): string => `sc_${id}`

/**
 * SC-трек → унифицированный `Track`. Несёт `_sc`/`scId`/`scMedia` — по ним
 * source-resolver плеера резолвит стрим (см. scProvider.resolveStream).
 * `_scTemp` помечает эфемерный (из выдачи поиска) для trackRegistry.clearTemp.
 */
export const toTrack = (t: ScRawTrack): Track => ({
  id: scTrackId(t.id),
  name: t.title || 'Unknown',
  artist: t.artist || 'Unknown',
  dur: fmtDur(t.duration),
  cover: t.artwork,
  album: t.album,
  year: t.year,
  genres: [t.genre, ...(t.tags || [])].filter((x): x is string => !!x),
  publisher: t.publisher,
  description: t.description,
  explicit: t.explicit,
  creditedArtist: t.creditedArtist,
  artistAvatar: t.artistAvatar,
  artistPermalink: t.artistPermalink,
  artistScId: t.artistScId,
  artistVerified: t.artistVerified,
  _sc: true,
  _scTemp: true,
  scId: t.id,
  scTrackId: t.id,
  scPermalink: t.permalink ?? null,
  scMedia: t.media,
  scPlaybackCount: t.playbackCount,
})

export const toArtist = (a: ScRawArtist): Artist => ({
  id: `sc_artist_${a.id}`,
  name: a.title || 'Unknown',
  avatar: a.artwork,
  permalink: a.permalink ?? null,
  source: 'soundcloud',
})

export const toPlaylist = (p: ScRawPlaylist): Playlist => ({
  id: `sc_pl_${p.id}`,
  title: p.title || 'Unknown',
  cover: p.artwork,
  trackCount: p.trackCount,
  ownerName: p.artist,
  source: 'soundcloud',
})
