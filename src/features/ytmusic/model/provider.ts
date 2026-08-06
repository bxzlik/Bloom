import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { t as i18nT } from '@shared/i18n'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import { bridgeMatch } from '@features/providers'
import type { MusicProvider, SearchResults, ArtistPageData, ResolvedUrl } from '@features/providers'
import { resolvePlayableUrl } from '@features/player'
import type { PlayableSource } from '@features/player'
import {
  ytmSearch,
  ytmSearchMore,
  ytmAlbum,
  ytmArtist,
  ytmPlaylist,
  ytmTrack,
  ytmResolve,
  ytmStreamUrl,
  ytmProxyUrl,
} from '../api/ytmClient'
import {
  toTrack,
  toArtist,
  toAlbum,
  toPlaylist,
  ytmArtistId,
  ytmAlbumId,
  ytmPlaylistId,
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

  /**
   * Догрузка выдачи (по 20). `offset` не используем: InnerTube листает
   * непрозрачным токеном, а не смещением, — токен хранит Rust и привязывает
   * его к строке запроса, поэтому здесь достаточно повторить запрос.
   */
  async loadMoreTracks(query): Promise<{ tracks: Track[]; hasMore: boolean }> {
    const d = await ytmSearchMore(query)
    const tracks = (d.tracks ?? []).map(toTrack)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    return { tracks, hasMore: d.hasMore }
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

  /**
   * Ссылка YouTube/YouTube Music → сущность. Разбор самой ссылки живёт в Rust
   * (`ytm_resolve`): два случая требуют сети — плейлист-версия альбома
   * (`list=OLAK5uy_…` → `MPRE…`) и канал по хэндлу (`/@name` → `UC…`).
   *
   * Дальше — обычная страница сущности: она всё равно нужна и импорту, и
   * карточке в выдаче (заголовок, обложка).
   */
  async resolveUrl(url): Promise<ResolvedUrl | null> {
    if (!/youtube\.com|youtu\.be/i.test(url)) return null
    const r = await ytmResolve(url)

    if (r.kind === 'track') {
      const track = toTrack(await ytmTrack(r.id))
      trackRegistry.put([track], { temp: true })
      return { type: 'track', track }
    }
    if (r.kind === 'artist') {
      const e = await ytmArtist(r.id)
      const artist: Artist = {
        id: ytmArtistId(r.id),
        name: e.title || i18nT('ym.fallback.artist'),
        avatar: e.cover || null,
        source: 'ytmusic',
      }
      return { type: 'artist', artist }
    }
    if (r.kind === 'album') {
      const { album } = await loadAlbum(ytmAlbumId(r.id))
      return { type: 'album', playlist: album }
    }
    const { playlist } = await loadPlaylist(ytmPlaylistId(r.id))
    return { type: 'playlist', playlist }
  },

  /**
   * Клик по имени артиста, когда точного id у трека нет (ре-резолв из
   * «недавних», трек, доехавший бриджем). Берём точное совпадение по имени,
   * иначе первого из выдачи — вкладка «Artists» ставит искомого первым.
   */
  async resolveArtistByName(name): Promise<{ id: string; title: string; cover?: string | null } | null> {
    const d = await ytmSearch(name)
    const items = d.artists ?? []
    if (!items.length) return null
    const nl = name.toLowerCase()
    const raw = items.find((a) => (a.name || '').toLowerCase() === nl) ?? items[0]!
    const a = toArtist(raw)
    return { id: a.id, title: a.name, cover: a.avatar ?? null }
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
      description: e.description || undefined,
      followers: e.subscribers || undefined,
    }
    return {
      artist,
      topTracks,
      tracks,
      albums,
      playlists: [],
      similarArtists: (e.similarArtists ?? []).map(toArtist),
    }
  },

  getAlbum: (id) => loadAlbum(id),
  getPlaylist: (id) => loadPlaylist(id),
}

/**
 * Страница альбома по сквозному id. Отдельно от метода провайдера, потому что
 * тем же путём идёт резолв вставленной ссылки (`resolveUrl`).
 */
const loadAlbum = async (id: string): Promise<{ album: Playlist; tracks: Track[] }> => {
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
    ownerAvatar: e.ownerAvatar || null,
    year: e.year || undefined,
    trackCount: tracks.length,
    source: 'ytmusic',
  }
  return { album, tracks }
}

const loadPlaylist = async (id: string): Promise<{ playlist: Playlist; tracks: Track[] }> => {
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
    ownerAvatar: e.ownerAvatar || null,
    trackCount: tracks.length,
    source: 'ytmusic',
  }
  return { playlist, tracks }
}

/** Кеш стрима (по videoId; подписанная ссылка googlevideo живёт минуты — держим 4). */
const streamCache = new Map<string, { src: PlayableSource; at: number }>()
const STREAM_TTL = 4 * 60 * 1000

/**
 * Резолвер стрима YTM — **нативный**: `player`-эндпоинт клиентом ANDROID_VR
 * отдаёт прямой аудио-url (itag 140 m4a) без PoToken, если в контексте есть
 * `visitorData` (детали — модуль-док `src-tauri/src/ytm.rs`).
 *
 * Бридж на SoundCloud остаётся страховкой на случай, когда сам YouTube не даёт
 * поток: гео-блок, «video unavailable», приватное видео. Раньше бридж был
 * единственным путём, поэтому играл похожий трек вместо нужного.
 *
 * Возвращает null, если трек не YTM ИЛИ не сыграл ни один путь — тогда плеер
 * пропустит трек (skipUnplayable).
 */
export const ytmResolveStream = async (t: Track): Promise<PlayableSource | null> => {
  if (!t._ytm || !t.ytmVideoId) return null
  const id = t.ytmVideoId

  const cached = streamCache.get(id)
  if (cached && Date.now() - cached.at < STREAM_TTL) return cached.src

  const src = (await nativeStream(id)) ?? (await bridgeStream(t))
  if (src) streamCache.set(id, { src, at: Date.now() })
  return src
}

/** Прямой поток с googlevideo через локальный аудио-прокси (range/CORS). */
const nativeStream = async (videoId: string): Promise<PlayableSource | null> => {
  try {
    const direct = await ytmStreamUrl(videoId)
    return { url: await ytmProxyUrl(direct), hls: false }
  } catch {
    return null
  }
}

/** Запасной путь: тот же трек, найденный на SoundCloud. */
const bridgeStream = async (t: Track): Promise<PlayableSource | null> => {
  try {
    const match = await bridgeMatch(t)
    if (!match) return null
    return await resolvePlayableUrl(match)
  } catch {
    return null
  }
}

/**
 * Прогреть стримы первых треков выдачи (fire-and-forget) — кладёт ссылку в
 * `streamCache`, чтобы первый play был мгновенным. Нативный путь дешевле
 * бриджа (один запрос вместо поиска по SC), поэтому греем больше треков.
 */
let _prefetchBusy = false
const prefetchStreams = (tracks: Track[]): void => {
  if (_prefetchBusy) return
  const todo = tracks.filter((t) => t._ytm && t.ytmVideoId).slice(0, 3)
  if (!todo.length) return
  _prefetchBusy = true
  void Promise.allSettled(todo.map((t) => ytmResolveStream(t))).finally(() => {
    _prefetchBusy = false
  })
}
