import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { t as i18nT } from '@shared/i18n'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import { bridgeMatch } from '@features/providers'
import type { MusicProvider, SearchResults, ArtistPageData } from '@features/providers'
import { resolvePlayableUrl } from '@features/player'
import type { PlayableSource } from '@features/player'
import { ytmSearch, ytmAlbum, ytmArtist, ytmPlaylist, ytmTrack } from '../api/ytmClient'
import {
  toTrack,
  toArtist,
  toAlbum,
  toPlaylist,
  parseYtmTrackId,
  parseYtmArtistId,
  parseYtmAlbumId,
  parseYtmPlaylistId,
} from './mappers'

/**
 * Провайдер YouTube Music. Реализует контракт `MusicProvider` — весь UX (поиск,
 * страницы, плеер) общий и о YTM не знает. Сеть делает Rust (CORS/range), здесь —
 * только маппинг raw→entities. Зеркало `ymProvider`/`scProvider`.
 *
 * Без `isEnabled` — публичный поиск работает без авторизации, YTM всегда в выдаче.
 * Страницы (getArtist/Album/Playlist) и пагинация — следующий этап (нужны
 * InnerTube browse/continuation в Rust).
 */
export const ytmProvider: MusicProvider = {
  id: 'ytmusic',
  label: 'YouTube Music',

  async search(query): Promise<Partial<SearchResults>> {
    const d = await ytmSearch(query)
    const tracks = (d.tracks ?? []).map(toTrack)
    const artists: Artist[] = (d.artists ?? []).map(toArtist)
    const albums: Playlist[] = (d.albums ?? []).map(toAlbum)
    const playlists: Playlist[] = (d.playlists ?? []).map(toPlaylist)

    // Кладём треки в реестр — иначе плеер (очередь по id) их не найдёт.
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    prefetchStreams(tracks) // прогреваем первые стримы (мгновенный play)

    return { tracks, artists, albums, playlists }
  },

  async resolveTrackById(id): Promise<Track | null> {
    const videoId = parseYtmTrackId(id)
    if (!videoId) return null
    const raw = await ytmTrack(videoId).catch(() => null)
    if (!raw) return null
    const track = toTrack(raw)
    trackRegistry.put([track], { temp: true })
    return track
  },

  async getArtist(id): Promise<ArtistPageData> {
    const browseId = parseYtmArtistId(id)
    if (!browseId) throw new Error(i18nT('search.err.artistNotFound'))
    const e = await ytmArtist(browseId)
    const topTracks = (e.popularTracks ?? []).map(toTrack)
    const tracks = (e.tracks ?? []).map(toTrack)
    const albums: Playlist[] = (e.albums ?? []).map(toAlbum)
    const reg = [...topTracks, ...tracks]
    if (reg.length) trackRegistry.put(reg, { temp: true })
    const artist: Artist = {
      id,
      name: e.title || i18nT('ym.fallback.artist'),
      source: 'ytmusic',
      avatar: e.cover || null,
    }
    return { artist, topTracks, tracks, albums, playlists: [] }
  },

  async getAlbum(id): Promise<{ album: Playlist; tracks: Track[] }> {
    const browseId = parseYtmAlbumId(id)
    if (!browseId) throw new Error(i18nT('search.err.albumNotFound'))
    const e = await ytmAlbum(browseId)
    const tracks = (e.tracks ?? []).map(toTrack)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    const album: Playlist = {
      id,
      title: e.title || i18nT('ym.fallback.album'),
      cover: e.cover || null,
      ownerName: e.subtitle,
      trackCount: tracks.length,
      source: 'ytmusic',
    }
    return { album, tracks }
  },

  async getPlaylist(id): Promise<{ playlist: Playlist; tracks: Track[] }> {
    const browseId = parseYtmPlaylistId(id)
    if (!browseId) throw new Error(i18nT('search.err.playlistNotFound'))
    const e = await ytmPlaylist(browseId)
    const tracks = (e.tracks ?? []).map(toTrack)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    const playlist: Playlist = {
      id,
      title: e.title || i18nT('ym.fallback.playlist'),
      cover: e.cover || null,
      ownerName: e.subtitle,
      trackCount: tracks.length,
      source: 'ytmusic',
    }
    return { playlist, tracks }
  },
}

/** Кеш стрима бриджа (по videoId; SC-ссылка живёт минуты — держим 4). */
const streamCache = new Map<string, { src: PlayableSource; at: number }>()
const STREAM_TTL = 4 * 60 * 1000

/**
 * Резолвер стрима YTM — **бридж на SoundCloud**. YouTube с 2024 требует
 * PoToken/cookies для прямого стрима (server-side запрос ловит «Sign in to
 * confirm you're not a bot»), поэтому, как и референсы (mimose / bedrock-api),
 * мы отдаём метаданные YTM, а звук берём из SoundCloud: ищем тот же трек по
 * «название + артист», берём лучший матч и резолвим его стрим общим
 * `resolvePlayableUrl` (его подхватывает зарегистрированный SC-резолвер).
 *
 * Возвращает null, если трек не YTM ИЛИ совпадение на SC не найдено — тогда
 * плеер пропустит трек (skipUnplayable).
 */
export const ytmResolveStream = async (t: Track): Promise<PlayableSource | null> => {
  if (!t._ytm || !t.ytmVideoId) return null
  const id = t.ytmVideoId

  const cached = streamCache.get(id)
  if (cached && Date.now() - cached.at < STREAM_TTL) return cached.src

  try {
    // Бридж на SoundCloud (общий хелпер): метаданные YTM, звук — с SC.
    const match = await bridgeMatch(t)
    if (!match) return null
    // SC-резолвер (зарегистрирован) превратит матч в проигрываемый стрим.
    const src = await resolvePlayableUrl(match)
    if (src) streamCache.set(id, { src, at: Date.now() })
    return src
  } catch {
    return null
  }
}

/**
 * Прогреть стримы первых треков выдачи (fire-and-forget) — кладёт результат
 * бриджа в `streamCache`, чтобы первый play был мгновенным.
 */
let _prefetchBusy = false
const prefetchStreams = (tracks: Track[]): void => {
  if (_prefetchBusy) return
  const todo = tracks.filter((t) => t._ytm && t.ytmVideoId).slice(0, 1)
  if (!todo.length) return
  _prefetchBusy = true
  void Promise.allSettled(todo.map((t) => ytmResolveStream(t))).finally(() => {
    _prefetchBusy = false
  })
}
