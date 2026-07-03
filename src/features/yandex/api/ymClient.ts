import { invoke } from '@shared/tauri'

/**
 * Тонкая обёртка над Rust-командами `ym_*` (см. src-tauri/src/commands.rs).
 *
 * Вся сеть Яндекс.Музыки живёт в Rust: `api.music.yandex.net` не отдаёт CORS,
 * из WebView2 напрямую не сходить, а OAuth-токен не должен покидать машину.
 * Здесь — только типизированные invoke + локальные типы ответов со структур
 * yandex.rs (serde camelCase). Маппинг в общие `entities/*` — в model/mappers.
 */

/** Сырой трек из Rust (yandex.rs YmTrack, serde camelCase). */
export interface YmRawTrack {
  id: string
  title: string
  artist: string
  /** id первого артиста (для перехода на страницу артиста). */
  artistId: string
  /** Полный https-URL обложки 400x400 (или пусто). */
  cover: string
  /** Длительность в секундах. */
  duration: number
  /** Год релиза (из первого альбома) или пусто. */
  year: string
  available: boolean
}

export interface YmRawArtist {
  id: string
  name: string
  cover: string
}

export interface YmRawAlbum {
  id: string
  title: string
  artist: string
  cover: string
  year: string
  /** Кол-во треков (для подписи карточки «N треков»). */
  trackCount: number
}

export interface YmRawPlaylist {
  kind: string
  owner: string
  title: string
  cover: string
  trackCount: number
}

/** Страница сущности (альбом/артист/плейлист): шапка + треки + (артист) альбомы. */
export interface YmRawEntity {
  title: string
  subtitle: string
  cover: string
  tracks: YmRawTrack[]
  /** Только у артиста: «Популярные» (brief-info). У альбома/плейлиста пусто. */
  popularTracks: YmRawTrack[]
  albums: YmRawAlbum[]
}

export interface YmRawSearch {
  tracks: YmRawTrack[]
  artists: YmRawArtist[]
  albums: YmRawAlbum[]
  playlists: YmRawPlaylist[]
}

/** Результат резолва ссылки (tag = "kind"). */
export type YmResolved =
  | { kind: 'track'; track: YmRawTrack }
  | { kind: 'album'; entity: YmRawEntity }
  | { kind: 'artist'; entity: YmRawEntity }
  | { kind: 'playlist'; entity: YmRawEntity }

export interface YmDeviceCode {
  device_code: string
  user_code: string
  verification_url: string
  interval: number
  expires_in: number
}

export interface YmWaveBatch {
  tracks: YmRawTrack[]
  batchId: string
}

/* ── Авторизация (device-flow) ─────────────────────────────────────────── */

/** Шаг 1: код устройства + ссылка для подтверждения. */
export const ymAuthStart = (): Promise<YmDeviceCode> => invoke<YmDeviceCode>('ym_auth_start')

/** Шаг 2: один опрос. 'pending' — продолжать поллинг; 'ok' — токен сохранён. */
export const ymAuthPoll = (deviceCode: string): Promise<'pending' | 'ok'> =>
  invoke<'pending' | 'ok'>('ym_auth_poll', { deviceCode })

export const ymIsAuthed = (): Promise<boolean> => invoke<boolean>('ym_is_authed')

export const ymLogout = (): Promise<void> => invoke<void>('ym_logout')

/** Есть ли активный Яндекс Плюс (для бейджа статуса в настройках). */
export const ymHasPlus = (): Promise<boolean> => invoke<boolean>('ym_has_plus')

/* ── Контент ───────────────────────────────────────────────────────────── */

export const ymSearch = (query: string, page = 0): Promise<YmRawSearch> =>
  invoke<YmRawSearch>('ym_search', { query, page })

export const ymAlbum = (id: string): Promise<YmRawEntity> => invoke<YmRawEntity>('ym_album', { id })

export const ymArtist = (id: string): Promise<YmRawEntity> => invoke<YmRawEntity>('ym_artist', { id })

export const ymPlaylist = (owner: string, kind: string): Promise<YmRawEntity> =>
  invoke<YmRawEntity>('ym_playlist', { owner, kind })

/** Публичный плейлист нового формата (music.yandex.ru/playlists/<uuid>). */
export const ymPlaylistUuid = (uuid: string): Promise<YmRawEntity> =>
  invoke<YmRawEntity>('ym_playlist_uuid', { uuid })

export const ymResolve = (url: string): Promise<YmResolved> => invoke<YmResolved>('ym_resolve', { url })

/* ── Чарты и новинки (витрина на главной) ──────────────────────────────── */

/** Общий чарт Яндекс.Музыки (топ треков). */
export const ymChart = (): Promise<YmRawTrack[]> => invoke<YmRawTrack[]>('ym_chart')

/** Новинки Яндекс.Музыки (свежие альбомы). */
export const ymNewReleases = (): Promise<YmRawAlbum[]> => invoke<YmRawAlbum[]>('ym_new_releases')

/* ── Стрим ─────────────────────────────────────────────────────────────── */

/** Прямой mp3-URL (подписанный). Бросает, если нет Плюса/трек недоступен. */
export const ymStreamUrl = (id: string): Promise<string> => invoke<string>('ym_stream_url', { id })

/**
 * Заворачивает аудио-URL в локальный прокси (обход TLS/CORS WebView2 к CDN
 * Яндекса). На ошибке — возвращаем исходный URL (best-effort).
 */
export const ymProxyUrl = (url: string): Promise<string> =>
  invoke<string>('ym_proxy_url', { url }).catch(() => url)

/* ── Моя волна (rotor) ─────────────────────────────────────────────────── */

/**
 * Батч rotor-станции. `station` — сид: пусто/`user:onyourwave` = «Моя волна»,
 * `track:<id>` = волна по треку. `lastId` — курсор продолжения цепочки.
 */
export const ymWaveTracks = (station?: string, lastId?: string): Promise<YmWaveBatch> =>
  invoke<YmWaveBatch>('ym_wave_tracks', { station: station ?? '', lastId: lastId ?? '' })

export const ymWaveFeedback = (
  station: string,
  event: string,
  trackId?: string,
  batchId?: string,
  played?: number,
): Promise<void> =>
  invoke<void>('ym_wave_feedback', { station, event, trackId, batchId, played }).catch(() => undefined)
