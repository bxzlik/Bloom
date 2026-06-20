import { invoke } from '@shared/tauri'

/**
 * Тонкая обёртка над Rust-командами `sp_*` (см. src-tauri/src/spotify.rs).
 *
 * Вся сеть Spotify живёт в Rust: токен (Client Credentials) не должен покидать
 * машину, а секрет приложения хранится в Rust-конфиге. Здесь — типизированные
 * invoke + raw-типы (serde camelCase из spotify.rs). Маппинг в `entities/*` — в
 * model/mappers. Воспроизведение/скачивание — бридж на SoundCloud (см. provider).
 */

export interface SpRawTrack {
  id: string
  title: string
  artist: string
  /** id первого артиста (для перехода на страницу артиста). */
  artistId: string
  cover: string
  /** Длительность в секундах. */
  duration: number
}

export interface SpRawArtist {
  id: string
  name: string
  cover: string
}

export interface SpRawAlbum {
  id: string
  title: string
  artist: string
  cover: string
  year: string
}

export interface SpRawPlaylist {
  id: string
  title: string
  cover: string
  ownerName: string
}

export interface SpRawSearch {
  tracks: SpRawTrack[]
  artists: SpRawArtist[]
  albums: SpRawAlbum[]
  playlists: SpRawPlaylist[]
}

/** Страница сущности (альбом/артист/плейлист): шапка + треки + (артист) альбомы. */
export interface SpRawEntity {
  title: string
  subtitle: string
  cover: string
  tracks: SpRawTrack[]
  /** Только у артиста: «Популярные». */
  popularTracks: SpRawTrack[]
  albums: SpRawAlbum[]
}

export interface SpotifyCreds {
  clientId: string
  clientSecret: string
}

/* ── Контент ───────────────────────────────────────────────────────────── */

export const spSearch = (query: string): Promise<SpRawSearch> =>
  invoke<SpRawSearch>('sp_search', { query })

export const spAlbum = (id: string): Promise<SpRawEntity> => invoke<SpRawEntity>('sp_album', { id })

export const spArtist = (id: string): Promise<SpRawEntity> => invoke<SpRawEntity>('sp_artist', { id })

export const spPlaylist = (id: string): Promise<SpRawEntity> =>
  invoke<SpRawEntity>('sp_playlist', { id })

/** Один трек по id (для ре-резолва из «недавних»). */
export const spTrack = (id: string): Promise<SpRawTrack> => invoke<SpRawTrack>('sp_track', { id })

/* ── Креденшелы ────────────────────────────────────────────────────────── */

export const spSetCreds = (clientId: string, clientSecret: string): Promise<void> =>
  invoke<void>('sp_set_creds', { clientId, clientSecret })

export const spGetCreds = (): Promise<SpotifyCreds> => invoke<SpotifyCreds>('sp_get_creds')

export const spHasCreds = (): Promise<boolean> => invoke<boolean>('sp_has_creds')

/** Проверить creds (обмен на токен). Бросает с сообщением при невалидных. */
export const spCheck = (): Promise<void> => invoke<void>('sp_check')

export const spClearCreds = (): Promise<void> => invoke<void>('sp_clear_creds')
