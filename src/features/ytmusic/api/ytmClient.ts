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
}

/* ── Контент ───────────────────────────────────────────────────────────── */

export const ytmSearch = (query: string): Promise<YtmRawSearch> =>
  invoke<YtmRawSearch>('ytm_search', { query })

export const ytmAlbum = (id: string): Promise<YtmRawEntity> =>
  invoke<YtmRawEntity>('ytm_album', { id })

export const ytmArtist = (id: string): Promise<YtmRawEntity> =>
  invoke<YtmRawEntity>('ytm_artist', { id })

export const ytmPlaylist = (id: string): Promise<YtmRawEntity> =>
  invoke<YtmRawEntity>('ytm_playlist', { id })

/** Один трек по videoId (для ре-резолва из «недавних»). */
export const ytmTrack = (videoId: string): Promise<YtmRawTrack> =>
  invoke<YtmRawTrack>('ytm_track', { videoId })

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
