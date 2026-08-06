import { invoke } from '@shared/tauri'

/**
 * Тонкая обёртка над Rust-командами `ytm_*` (см. src-tauri/src/ytm.rs).
 *
 * Вся сеть YouTube Music живёт в Rust: у `music.youtube.com` нет CORS, а аудио с
 * `googlevideo.com` — range-based (не качается из WebView2 напрямую). Здесь —
 * только типизированные invoke + локальные типы ответов (serde camelCase из
 * ytm.rs). Маппинг в общие `entities/*` — в model/mappers.
 *
 * Без авторизации (публичный поиск/стрим). Прокси аудио переиспользует общий
 * `ym_proxy_url` (он оборачивает любой URL в локальный аудио-прокси).
 */

/** Сырой трек из Rust (ytm.rs YtmTrack). */
export interface YtmRawTrack {
  /** videoId YouTube. */
  id: string
  title: string
  artist: string
  /** browseId артиста (UC…) или пусто. */
  artistId: string
  cover: string
  /** Длительность в секундах. */
  duration: number
}

export interface YtmRawArtist {
  /** browseId (UC…). */
  id: string
  name: string
  cover: string
}

export interface YtmRawAlbum {
  /** browseId (MPREb…). */
  id: string
  title: string
  artist: string
  cover: string
  year: string
}

export interface YtmRawPlaylist {
  /** browseId (VL…/playlistId). */
  id: string
  title: string
  cover: string
  ownerName: string
  /** Число треков — только если YTM его дал (у альбомов и чужих плейлистов нет). */
  trackCount?: number
}

export interface YtmRawSearch {
  tracks: YtmRawTrack[]
  artists: YtmRawArtist[]
  albums: YtmRawAlbum[]
  playlists: YtmRawPlaylist[]
}

/** Страница сущности (альбом/артист/плейлист): шапка + треки + (артист) альбомы. */
export interface YtmRawEntity {
  title: string
  subtitle: string
  cover: string
  tracks: YtmRawTrack[]
  /** Только у артиста: «Популярные». */
  popularTracks: YtmRawTrack[]
  albums: YtmRawAlbum[]
  /** Только у артиста: похожие исполнители («Fans might also like»). */
  similarArtists: YtmRawArtist[]
  /** Год выпуска (альбом). */
  year: string
  /** Аватар артиста/владельца из шапки (`straplineThumbnail`). */
  ownerAvatar: string
  /** Только у артиста: биография из шапки (пусто, если YTM её не даёт). */
  description: string
  /** Только у артиста: число подписчиков канала. */
  subscribers: number
}

/* ── Контент ───────────────────────────────────────────────────────────── */

export const ytmSearch = (query: string): Promise<YtmRawSearch> =>
  invoke<YtmRawSearch>('ytm_search', { query })

/** Порция догрузки поиска (токен продолжения хранится в Rust). */
export interface YtmRawSearchMore {
  tracks: YtmRawTrack[]
  hasMore: boolean
}

export const ytmSearchMore = (query: string): Promise<YtmRawSearchMore> =>
  invoke<YtmRawSearchMore>('ytm_search_more', { query })

export const ytmAlbum = (id: string): Promise<YtmRawEntity> =>
  invoke<YtmRawEntity>('ytm_album', { id })

export const ytmArtist = (id: string): Promise<YtmRawEntity> =>
  invoke<YtmRawEntity>('ytm_artist', { id })

export const ytmPlaylist = (id: string): Promise<YtmRawEntity> =>
  invoke<YtmRawEntity>('ytm_playlist', { id })

/** Один трек по videoId (для ре-резолва из «недавних»). */
export const ytmTrack = (videoId: string): Promise<YtmRawTrack> =>
  invoke<YtmRawTrack>('ytm_track', { videoId })

/** Что открывает ссылка YouTube/YouTube Music: вид сущности + её id. */
export interface YtmRawResolved {
  kind: 'track' | 'album' | 'playlist' | 'artist'
  /** videoId (трек) либо browseId страницы. */
  id: string
}

/** Разбор вставленной ссылки. Бросает, если ссылка не разобралась. */
export const ytmResolve = (url: string): Promise<YtmRawResolved> =>
  invoke<YtmRawResolved>('ytm_resolve', { url })

/* ── Стрим ─────────────────────────────────────────────────────────────── */

/** Прямой аудио-URL по videoId. Бросает, если трек недоступен. */
export const ytmStreamUrl = (videoId: string): Promise<string> =>
  invoke<string>('ytm_stream_url', { videoId })

/**
 * Заворачивает аудио-URL в локальный прокси (обход range/CORS WebView2 к
 * googlevideo). На ошибке — исходный URL (best-effort). Общий с Яндексом.
 */
export const ytmProxyUrl = (url: string): Promise<string> =>
  invoke<string>('ym_proxy_url', { url }).catch(() => url)
