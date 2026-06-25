// Кросс-доменные типы, возвращаемые/принимаемые Rust-командами и событиями.
// Доменно-специфичные типы живут в features/<x>/model/types.ts.
// Источник правды: src-tauri/COMMANDS.md, src-tauri/src/{commands,events,config}.rs.

// ---------------- AppSettings (commands.get_app_settings) ----------------
// snake_case, как приходит из serde Rust (Tauri передаёт без преобразования).
export interface AppSettings {
  minimize_to_tray: boolean
  autoplay: boolean
  discord_rpc: boolean
  change_titlebar: boolean
  change_tray_cover: boolean
  lyrics_disk_cache: boolean
  discord_show_progress: boolean
  discord_custom_artwork: string
  discord_show_small_img: boolean
  discord_small_img_url: string
  discord_small_img_mode: string
  discord_btn1_mode: string
  discord_btn1_label: string
  discord_btn1_url: string
  discord_btn2_mode: string
  discord_btn2_label: string
  discord_btn2_url: string
}

// ---------------- Обновления (updater.check_update / download_update) ----------------
export interface UpdateInfo {
  available: boolean
  current: string
  latest: string
  notes: string
  download_url: string
  asset_name: string
}

export interface UpdateProgress {
  downloaded: number
  total: number
  percent: number
}

// ---------------- Описания обновлений (updater.fetch_update_notes) ----------------
// Манифест update-notes.json: { "<version>": UpdateNoteRaw }. Тянется по сети из
// репозитория, поэтому правится без пересборки. Локализуемые поля — строка (одна
// на все языки) или { ru, en }.
export type LocalizedText = string | { ru?: string; en?: string }

/** Одна страница-слайд: свой заголовок, текст (markdown) и (опц.) одна картинка. */
export interface UpdateNotePageRaw {
  title?: LocalizedText
  body?: LocalizedText
  /** Имя файла из update-notes/assets/ или полная https-ссылка. */
  image?: string
  /** Бренд-иконки площадок вместо/в дополнение к фото: 'spotify' | 'ytmusic' | 'soundcloud' | 'yandex'. */
  icons?: string[]
}

export interface UpdateNoteRaw {
  /** Общий заголовок модалки (шапка). */
  title?: LocalizedText
  /** Страницы-слайды (переключаются стрелками). */
  pages?: UpdateNotePageRaw[]
  // Легаси-формат одной страницы (если pages не задан):
  body?: LocalizedText
  images?: string[]
}

/** Разрешённая под локаль страница. */
export interface UpdateNotePage {
  title: string
  body: string
  image: string | null
  icons: string[]
}

/** Разрешённая под текущую локаль запись (то, что отдаётся в UI). */
export interface UpdateNote {
  version: string
  title: string
  pages: UpdateNotePage[]
}

// ---------------- MpState (miniplayer + tray-popup) ----------------
export interface MpState {
  title: string
  artist: string
  playing: boolean
  artwork: string | null
  position: number
  duration: number
  volume: number
  shuffle: boolean
  repeat: number
  fav: boolean
  can_add_to_lib: boolean
  /** Площадка текущего трека для бейджа на обложке мини-плеера/трея:
   *  'soundcloud' | 'yandex' | null (локальный/без бейджа). */
  source: string | null
}

// ---------------- DiscordSettings (плоский DTO из commands.rs) ----------------
export interface DiscordSettings {
  show_progress: boolean
  custom_artwork: string
  show_small_img: boolean
  small_img_url: string
  btn1_mode: string
  btn1_label: string
  btn1_url: string
  btn2_mode: string
  btn2_label: string
  btn2_url: string
}

// ---------------- LyricsResult (event bloom-lyrics) ----------------
// events.rs использует #[serde(rename_all = "camelCase")] — поля camelCase.
export interface LyricsResult {
  found: boolean
  plain: string | null
  synced: string | null
  source: string | null
  requestId: string | null
}

// ---------------- LocalTrackInfo (event bloom-folder-tracks) ----------------
export interface LocalTrackInfo {
  id: string
  name: string
  artist: string
  album: string
  year: string
  publisher: string
  genres: string[]
  _localPath: string
  _folder: string
}

// ---------------- DownloadState (event bloom-download-state) ----------------
export type DownloadStateName = 'downloading' | 'done' | 'cancelled' | 'error'
export interface DownloadState {
  state: DownloadStateName
  // commands.rs шлёт inline { state, message }, events.rs — { state, errorMsg }.
  // Бэкенд использует обе формы, поэтому делаем оба поля опциональными.
  message?: string | null
  errorMsg?: string | null
}

// ---------------- MiniplayerCmd payload (event bloom-command) ----------------
export type PlayerCommand =
  | 'playpause'
  | 'prev'
  | 'next'
  | 'shuffle'
  | 'repeat'
  | 'fav'
