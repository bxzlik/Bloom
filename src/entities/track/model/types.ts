/**
 * Унифицированный Track для всех источников (local / SoundCloud / Yandex).
 * Источник правды — это определение. wave/types.ts реэкспортирует Track отсюда
 * для обратной совместимости с wave-кодом.
 *
 * Семантика полей:
 * - `id`         — сквозной id («sc_123», локальный uuid, «ym_456»). Префикс источника.
 * - `name`       — заголовок трека (поле названо так исторически; не путать с UI label).
 * - `artist`     — отображаемое имя артиста (может быть «Artist A, Artist B»).
 * - `dur`        — длительность в формате «m:ss» (строкой, не миллисекундами).
 * - `cover`      — URL обложки (http(s) или data:).
 * - `genres`     — нормализованные жанры (lowercase, без дублей).
 */
export interface Track {
  id: string
  name: string
  artist: string
  dur: string
  cover?: string | null
  fav?: boolean
  favAt?: number
  playCount?: number
  addedAt?: number
  genres?: string[]
  album?: string
  year?: string
  publisher?: string
  description?: string
  explicit?: boolean

  // SoundCloud-специфика.
  _sc?: boolean
  _scTemp?: boolean
  _scIsHls?: boolean
  scId?: string | number
  scTrackId?: string | number
  scPermalink?: string | null
  scMedia?: unknown
  artistAvatar?: string | null
  artistPermalink?: string | null
  /** SC user id артиста (для клика по имени артиста → страница артиста). */
  artistScId?: number | null
  artistVerified?: boolean
  creditedArtist?: string
  url?: string | null

  // Yandex-специфика. `ymTrackId` — числовой id Яндекса (source-resolver тянет стрим).
  _ym?: boolean
  _ymTemp?: boolean
  ymTrackId?: string
  ymAvailable?: boolean

  // YouTube Music-специфика. `ytmVideoId` — id видео YouTube. Воспроизведение/
  // скачивание — бридж на SoundCloud (прямой стрим YouTube заблокирован).
  _ytm?: boolean
  _ytmTemp?: boolean
  ytmVideoId?: string

  // Spotify-специфика. `spTrackId` — id трека Spotify. Воспроизведение/скачивание
  // — бридж на SoundCloud (Spotify не отдаёт прямой стрим).
  _sp?: boolean
  _spTemp?: boolean
  spTrackId?: string

  /**
   * Сквозной entity-id артиста (`ym_artist_<id>` / sc можно добавить позже) +
   * его провайдер — для прямого открытия страницы артиста по клику на имя,
   * минуя резолв по имени (см. ArtistLinks + глоб. обработчик в App).
   */
  artistId?: string
  artistProvider?: 'yandex' | 'soundcloud' | 'ytmusic' | 'spotify'

  // Поля «Волны».
  skipCount?: number
  lastSkipAt?: number
  disliked?: boolean

  // Локальный файл (из folder_watcher или manual upload).
  _folder?: string
  _localPath?: string
}
