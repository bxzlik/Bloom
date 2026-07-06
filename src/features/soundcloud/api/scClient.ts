/**
 * SoundCloud API-клиент — тонкая обёртка над Rust-командами `sc_*`
 * (см. src-tauri/src/soundcloud.rs, паттерн ytmClient).
 *
 * Вся сеть SC (client_id: ручной → известные → скрейп; гонка «прямой запрос +
 * прокси-фолбэк»; все вызовы api-v2) живёт в Rust. Здесь — типизированные
 * invoke, локальное хранение ручного client_id (localStorage) и перевод
 * кодов ошибок Rust (`sc.err.*` / `search.err.*`) через i18n.
 */

import { invoke } from '@shared/tauri'
import { t as i18nT, type TranslationKey } from '@shared/i18n'

const LS_KEY = 'bloom_sc_client_id'

let manualClientId: string | null = null
try {
  manualClientId = localStorage.getItem(LS_KEY) || null
} catch {
  /* ignore */
}
// Прокинуть сохранённый ручной client_id в Rust при старте.
if (manualClientId) void invoke('sc_set_client_id', { id: manualClientId }).catch(() => {})

export const setManualClientId = (id: string | null): void => {
  manualClientId = id ? id.trim() || null : null
  try {
    if (manualClientId) localStorage.setItem(LS_KEY, manualClientId)
    else localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
  void invoke('sc_set_client_id', { id: manualClientId }).catch(() => {})
}
export const getManualClientId = (): string | null => manualClientId

/** Ошибки из Rust приходят кодами словаря — переводим, остальное отдаём как есть. */
const I18N_KEY_RE = /^(sc|search|common)\.[\w.]+$/
const trErr = (e: unknown): string => {
  const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e)
  return I18N_KEY_RE.test(msg) ? i18nT(msg as TranslationKey) : msg
}

const scInvoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    throw new Error(trErr(e))
  }
}

/* ── Сырые SC-типы (serde camelCase из soundcloud.rs) ───────────────── */
export interface ScTranscoding {
  url: string
  format?: { protocol?: string }
}
export interface ScMedia {
  transcodings?: ScTranscoding[]
}
export interface ScRawTrack {
  id: number
  title: string
  artist: string
  artistScId: number | null
  artwork: string | null
  duration: number
  permalink?: string
  media: ScMedia | null
  genre: string | null
  tags: string[]
  album: string
  publisher: string
  description: string
  explicit: boolean
  creditedArtist: string
  artistAvatar: string | null
  artistPermalink: string | null
  artistVerified: boolean
  year: string
  /** Глобальное число прослушиваний на SC (`playback_count`); null если скрыто. */
  playbackCount: number | null
}
export interface ScRawArtist {
  id: number
  title: string
  artist: string
  artwork: string | null
  followers: number
  permalink?: string
}
export interface ScRawPlaylist {
  id: number
  title: string
  artist: string
  artwork: string | null
  trackCount: number
  duration: number
  permalink?: string
}

export interface ScSearchPage<T> {
  items: T[]
  hasMore: boolean
}

/** Сырой запрос к api-v2 с подстановкой client_id (волна, скачивание). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiFetch = (url: string, noRetry = false): Promise<any> =>
  scInvoke('sc_api_fetch', { url, noRetry })

export const searchTracks = (
  query: string,
  limit = 12,
  offset = 0,
  sort: 'relevance' | 'new' = 'relevance',
): Promise<ScSearchPage<ScRawTrack>> =>
  scInvoke('sc_search_tracks', { query, limit, offset, sort })

export interface ScCheckResult {
  ok: boolean
  clientId: string | null
  error?: string
}

/**
 * Проверить/получить client_id автоматически: сброс авто-кеша → тестовый
 * поиск (скрейп/известные). Возвращает рабочий client_id или ошибку.
 */
export const checkConnection = async (): Promise<ScCheckResult> => {
  try {
    const r = await invoke<{ ok: boolean; clientId: string | null; error?: string }>(
      'sc_check_connection',
    )
    return r.error != null ? { ...r, error: trErr(r.error) } : r
  } catch (e) {
    return { ok: false, clientId: manualClientId, error: trErr(e) }
  }
}

export const searchArtists = (query: string, limit = 8): Promise<ScSearchPage<ScRawArtist>> =>
  scInvoke('sc_search_artists', { query, limit })

export const searchPlaylists = (query: string, limit = 6): Promise<ScSearchPage<ScRawPlaylist>> =>
  scInvoke('sc_search_playlists', { query, limit })

export const searchAlbums = (query: string, limit = 6): Promise<ScSearchPage<ScRawPlaylist>> =>
  scInvoke('sc_search_albums', { query, limit })

/* ── Детальные страницы: артист / альбом / плейлист ───────────────────── */

/** Сырой SC-пользователь (артист) — поля для hero страницы артиста. */
export interface ScRawUser {
  id: number
  username: string
  fullName: string
  avatar: string | null
  banner: string | null
  followers: number
  trackCount: number
  description: string
  website: string | null
  permalink: string | null
}

/** Плейлисты пользователя (для профиля по ссылке). spHandleUrl. */
export const getUserPlaylists = (userId: number | string): Promise<ScRawPlaylist[]> =>
  scInvoke('sc_user_playlists', { idOrUrl: String(userId) })

/** Лайкнутые треки пользователя (для профиля по ссылке). */
export const getUserLikes = (userId: number | string): Promise<ScRawTrack[]> =>
  scInvoke('sc_user_likes', { idOrUrl: String(userId) })

/** Элемент ленты репостов артиста: репостнутый трек ИЛИ плейлист/альбом. */
export interface ScRepostItem {
  kind: 'track' | 'playlist' | 'album'
  track?: ScRawTrack
  playlist?: ScRawPlaylist
}

/** Репосты пользователя (вкладка «Репосты» на странице артиста). */
export const getArtistReposts = (
  idOrUrl: number | string,
): Promise<{ items: ScRepostItem[]; next: string | null }> =>
  scInvoke('sc_artist_reposts', { idOrUrl: String(idOrUrl) })

/** Следующая страница репостов по курсору (`next_href`). */
export const getArtistRepostsPage = (
  cursor: string,
): Promise<{ items: ScRepostItem[]; next: string | null }> =>
  scInvoke('sc_artist_reposts_page', { cursor })

/** Данные пользователя SC (для hero артиста); null при ошибке. */
export const getUser = (idOrUrl: number | string): Promise<ScRawUser | null> =>
  scInvoke('sc_get_user', { idOrUrl: String(idOrUrl) })

/** Треки плейлиста/альбома по его permalink-URL (ошибки пробрасываются). */
export const getPlaylistTracks = (permalinkUrl: string): Promise<ScRawTrack[]> =>
  scInvoke('sc_playlist_tracks', { permalinkUrl })

/** Полные данные плейлиста по числовому SC-id (открытие из «недавних»). */
export interface ScPlaylistFull {
  tracks: ScRawTrack[]
  title: string
  cover: string | null
  ownerName: string
  trackCount: number
}
/** Один трек по числовому SC-id; null при ошибке. */
export const getTrackById = (id: number): Promise<ScRawTrack | null> =>
  scInvoke('sc_track_by_id', { id })

export const getPlaylistById = (id: number): Promise<ScPlaylistFull> =>
  scInvoke('sc_playlist_by_id', { id })

/** Популярные треки артиста: /toptracks → /spotlight → /tracks → поиск по имени. */
export const getArtistTopTracks = (
  idOrPermalink: number | string,
  artistName?: string,
): Promise<ScRawTrack[]> =>
  scInvoke('sc_artist_top_tracks', { idOrUrl: String(idOrPermalink), artistName: artistName ?? null })

/** Все треки (страница + курсор) + альбомы артиста. Фолбэк — поиск. */
export const getArtistData = (
  idOrUrl: number | string,
  artistName?: string,
): Promise<{ tracks: ScRawTrack[]; tracksNext: string | null; albums: ScRawPlaylist[]; userId: number }> =>
  scInvoke('sc_artist_data', { idOrUrl: String(idOrUrl), artistName: artistName ?? null })

/** Следующая страница треков артиста по курсору (`next_href`). */
export const getArtistTracksPage = (
  cursor: string,
): Promise<{ tracks: ScRawTrack[]; next: string | null }> =>
  scInvoke('sc_artist_tracks_page', { cursor })

/** Нормализованный результат резолва SC-ссылки (`/resolve?url=`). */
export type ScResolved =
  | { kind: 'track'; track: ScRawTrack }
  | { kind: 'artist'; artist: ScRawArtist }
  | { kind: 'playlist' | 'album'; playlist: ScRawPlaylist }

/** Является ли строка ссылкой SoundCloud. */
export const isScUrl = (s: string): boolean => /(^https?:\/\/)?(www\.|on\.|m\.)?soundcloud\.com\//i.test(s.trim())

/** Резолв SoundCloud-ссылки в сущность (трек / артист / плейлист / альбом). */
export const resolveScUrl = (url: string): Promise<ScResolved | null> =>
  scInvoke('sc_resolve_url', { url })

/** Результат резолва стрима. */
export interface ScStream {
  url: string
  isHls: boolean
}

/**
 * Получить играбельный signed URL из `media.transcodings`. Порядок:
 * progressive (mp3) → hls → любой не-DRM (ретрай в Rust).
 */
export const getStreamUrl = (media: ScMedia | null): Promise<ScStream> =>
  scInvoke('sc_stream_url', { media })
