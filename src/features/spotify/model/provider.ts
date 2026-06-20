import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { t as i18nT } from '@shared/i18n'
import { toast } from '@shared/ui'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import { bridgeMatch } from '@features/providers'
import type { MusicProvider, SearchResults, ArtistPageData } from '@features/providers'
import { resolvePlayableUrl } from '@features/player'
import type { PlayableSource } from '@features/player'
import { spSearch, spAlbum, spArtist, spPlaylist, spTrack } from '../api/spClient'
import { useSpAuthStore } from './authStore'
import {
  toTrack,
  toArtist,
  toAlbum,
  toPlaylist,
  parseSpTrackId,
  parseSpArtistId,
  parseSpAlbumId,
  parseSpPlaylistId,
} from './mappers'

/**
 * Провайдер Spotify. Реализует контракт `MusicProvider` — поиск/страницы общие.
 * Сеть/токен делает Rust (Client Credentials). Зеркало `ytmProvider`.
 *
 * `isEnabled` гейтит провайдера по наличию creds: без client_id/secret Spotify
 * не участвует в поиске и не появляется в дропдауне источника.
 *
 * Воспроизведение/скачивание — **бридж на SoundCloud** (Spotify не отдаёт прямой
 * стрим), общий `bridgeMatch` (как YTM).
 */
export const spProvider: MusicProvider = {
  id: 'spotify',
  label: 'Spotify',

  isEnabled: () => useSpAuthStore.getState().enabled,

  async search(query): Promise<Partial<SearchResults>> {
    let d
    try {
      d = await spSearch(query)
    } catch (e) {
      // searchAll глотает ошибки провайдеров — показываем причину тостом, иначе
      // пустая выдача без объяснения. (Диагностика; можно убрать позже.)
      toast('Spotify: ' + (e instanceof Error ? e.message : String(e)))
      throw e
    }
    const tracks = (d.tracks ?? []).map(toTrack)
    const artists: Artist[] = (d.artists ?? []).map(toArtist)
    const albums: Playlist[] = (d.albums ?? []).map(toAlbum)
    const playlists: Playlist[] = (d.playlists ?? []).map(toPlaylist)

    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    prefetchStreams(tracks)

    return { tracks, artists, albums, playlists }
  },

  async resolveTrackById(id): Promise<Track | null> {
    const spId = parseSpTrackId(id)
    if (!spId) return null
    const raw = await spTrack(spId).catch(() => null)
    if (!raw) return null
    const track = toTrack(raw)
    trackRegistry.put([track], { temp: true })
    return track
  },

  async getArtist(id): Promise<ArtistPageData> {
    const spId = parseSpArtistId(id)
    if (!spId) throw new Error(i18nT('search.err.artistNotFound'))
    const e = await spArtist(spId)
    const topTracks = (e.popularTracks ?? []).map(toTrack)
    const tracks = (e.tracks ?? []).map(toTrack)
    const albums: Playlist[] = (e.albums ?? []).map(toAlbum)
    const reg = [...topTracks, ...tracks]
    if (reg.length) trackRegistry.put(reg, { temp: true })
    const artist: Artist = {
      id,
      name: e.title || i18nT('ym.fallback.artist'),
      source: 'spotify',
      avatar: e.cover || null,
    }
    return { artist, topTracks, tracks, albums, playlists: [] }
  },

  async getAlbum(id): Promise<{ album: Playlist; tracks: Track[] }> {
    const spId = parseSpAlbumId(id)
    if (!spId) throw new Error(i18nT('search.err.albumNotFound'))
    const e = await spAlbum(spId)
    const tracks = (e.tracks ?? []).map(toTrack)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    const album: Playlist = {
      id,
      title: e.title || i18nT('ym.fallback.album'),
      cover: e.cover || null,
      ownerName: e.subtitle,
      trackCount: tracks.length,
      source: 'spotify',
    }
    return { album, tracks }
  },

  async getPlaylist(id): Promise<{ playlist: Playlist; tracks: Track[] }> {
    const spId = parseSpPlaylistId(id)
    if (!spId) throw new Error(i18nT('search.err.playlistNotFound'))
    const e = await spPlaylist(spId)
    const tracks = (e.tracks ?? []).map(toTrack)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    const playlist: Playlist = {
      id,
      title: e.title || i18nT('ym.fallback.playlist'),
      cover: e.cover || null,
      ownerName: e.subtitle,
      trackCount: tracks.length,
      source: 'spotify',
    }
    return { playlist, tracks }
  },
}

/** Кеш стрима бриджа (по spotify-id; SC-ссылка живёт минуты — держим 4). */
const streamCache = new Map<string, { src: PlayableSource; at: number }>()
const STREAM_TTL = 4 * 60 * 1000

/**
 * Резолвер стрима Spotify — **бридж на SoundCloud** (общий `bridgeMatch`).
 * Возвращает null, если трек не Spotify ИЛИ совпадение на SC не найдено.
 */
export const spResolveStream = async (t: Track): Promise<PlayableSource | null> => {
  if (!t._sp || !t.spTrackId) return null
  const id = t.spTrackId

  const cached = streamCache.get(id)
  if (cached && Date.now() - cached.at < STREAM_TTL) return cached.src

  try {
    const match = await bridgeMatch(t)
    if (!match) return null
    const src = await resolvePlayableUrl(match)
    if (src) streamCache.set(id, { src, at: Date.now() })
    return src
  } catch {
    return null
  }
}

/** Прогреть стрим первого трека выдачи (fire-and-forget) — мгновенный первый play. */
let _prefetchBusy = false
const prefetchStreams = (tracks: Track[]): void => {
  if (_prefetchBusy) return
  const todo = tracks.filter((t) => t._sp && t.spTrackId).slice(0, 1)
  if (!todo.length) return
  _prefetchBusy = true
  void Promise.allSettled(todo.map((t) => spResolveStream(t))).finally(() => {
    _prefetchBusy = false
  })
}
