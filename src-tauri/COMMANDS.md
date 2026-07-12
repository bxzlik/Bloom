# Bloom Rust API — справочник

Источник правды: `src/commands.rs` + `src/lib.rs` (invoke_handler) + `src/events.rs`.
Используется при написании TS-обёрток в `src/shared/tauri/` и `src/features/<x>/api/`.

## Команды (по доменам)

### App settings (общие) → features/settings/api
| Команда | Аргументы | Возврат |
|---|---|---|
| `get_app_settings` | — | `AppSettings` |
| `setautostart` | `enabled: bool` | `()` |
| `getautostart` | — | `bool` |
| `setautoplay` | `enabled: bool` | `()` |
| `getautoplay` | — | `bool` |
| `setminimize_to_tray` | `enabled: bool` | `()` |
| `getminimize_to_tray` | — | `bool` |
| `setchangetitlebar` | `enabled: bool` | `()` |
| `getchangetitlebar` | — | `bool` |
| `setchangetray_cover` | `enabled: bool` | `()` |
| `getchangetray_cover` | — | `bool` |
| `setzoom` | `zoom: f64` | `()` (для maximized) |
| `setwinzoom` | `zoom: f64` | `()` (для windowed) |

### Discord RPC → features/discord-rpc/api
| Команда | Аргументы | Возврат |
|---|---|---|
| `setdiscordrpc` | `enabled: bool` | `()` |
| `getdiscordrpc` | — | `bool` |
| `set_discord_settings` | DiscordSettings (11 полей плоско) | `()` |
| `get_discord_settings` | — | `DiscordSettings` |

### Player / Now playing → features/player/api
| Команда | Аргументы | Возврат |
|---|---|---|
| `now_playing` | title, artist, playing, artwork?, position?, duration?, track_url?, artist_url?, fav?, can_add_to_lib? | `()` |
| `set_cover_data` | `data_url: string, playing: bool` | `()` |

### Mini player / tray-popup → features/player/api
| Команда | Аргументы | Возврат |
|---|---|---|
| `miniplayer_get_state` | — | `MpState` |
| `open_miniplayer` | — | `()` |
| `close_miniplayer` | — | `()` |
| `miniplayer_cmd` | `cmd: string, value?: f64` | `()` (см. ниже) |
| `mp_add_to_lib` | — | `()` |
| `mp_add_to_pl` | `pl_id: string` | `()` |
| `mp_open_new_pl` | — | `()` |
| `open_main_window` | — | `()` |
| `hide_tray_popup` | — | `()` |
| `tray_open_artist` | `artist: string` | `()` |
| `exit_app` | — | `()` |

`miniplayer_cmd.cmd` ∈ `playpause | prev | next | shuffle | repeat | fav | seek | volume`. Для `seek`/`volume` передавать `value`.

### Library / folders → features/library/api
| Команда | Аргументы | Возврат |
|---|---|---|
| `folder_add` | `path: string` | `()` |
| `folder_remove` | `path: string` | `()` |
| `folder_scan` | `path: string` | `()` |
| `folder_get` | — | `string[]` |
| `open_folder` | `path: string` | `()` — открыть папку в проводнике; не-директория → `Err` |

### Downloads → features/soundcloud/api (SC), features/library/api (local), features/player/api (cover)
| Команда | Аргументы | Возврат |
|---|---|---|
| `sc_download` | url, filename, cover_url?, title?, artist? | `()` |
| `local_download` | `local_path: string, filename: string` | `()` |
| `cover_download` | data_url?, url?, filename | `()` |

### Offline cache (локальное прослушивание) → features/offline/api
| Команда | Аргументы | Возврат |
|---|---|---|
| `offline_download` | id, url, filename, cover_url?, title?, artist?, referer? | `string` (путь копии) |
| `offline_remove` | `id: string` | `()` |
| `offline_scan_all` | — | `{ id, path }[]` |
| `offline_cache_stats` | — | `{ count, bytes }` |
| `offline_clear_all` | — | `usize` (удалено файлов) |

### Lyrics → features/lyrics/api
| Команда | Аргументы | Возврат |
|---|---|---|
| `lyrics_request` | artist, title, duration, local_path?, genius_token?, request_id | `()` |
| `lyrics_cache_clear` | — | `()` |
| `set_lyrics_cache` | `enabled: bool` | `()` |
| `genius_token` | `token: string` | `()` (заглушка) |

### Playlist export/import → features/library/api
| Команда | Аргументы | Возврат |
|---|---|---|
| `export_playlist_file` | `content: string, default_name: string` | `bool` (true если сохранили) |
| `import_playlist_file` | — | `string?` (содержимое файла или null если отменили) |

### Misc → shared/tauri
| Команда | Аргументы | Возврат |
|---|---|---|
| `jserror` | `message: string` | `()` (для логирования JS-ошибок в Rust) |
| `get_pending_deep_link` | — | `string?` |

### Yandex → features/yandex/api
| Команда | Аргументы | Возврат |
|---|---|---|
| `ym_auth_start` | — | `DeviceCode` |
| `ym_auth_poll` | `device_code: string` | `'pending' \| 'ok'` |
| `ym_is_authed` | — | `bool` |
| `ym_logout` | — | `()` |
| `ym_search` | `query: string, page?: u32` | `YmSearch` |
| `ym_album` | `id: string` | `YmEntity` |
| `ym_artist` | `id: string` | `YmEntity` |
| `ym_playlist` | `owner: string, kind: string` | `YmEntity` |
| `ym_resolve` | `url: string` | `YmResolved` |
| `ym_has_plus` | — | `bool` |
| `ym_stream_url` | `id: string` | `string` |
| `ym_proxy_url` | `url: string` | `string` |
| `ym_wave_tracks` | `last_id?: string` | `YmWave` |
| `ym_wave_feedback` | event, track_id?, batch_id?, played? | `()` |

Yandex-типы (`DeviceCode`, `YmSearch`, `YmEntity`, `YmResolved`, `YmWave`) живут в `src-tauri/src/yandex.rs` — выпишутся при работе над `features/yandex/`.

## События (Rust → JS)

Все через `app.emit(name, payload)`. Имя в kebab-case с префиксом `bloom-`.

| Событие | Payload | Источник |
|---|---|---|
| `bloom-set-title` | `string` | now_playing |
| `bloom-mp-state` | `MpState` | now_playing, open_miniplayer |
| `bloom-mp-closed` | `()` | close_miniplayer |
| `bloom-mp-seek` | `number` (sec) | miniplayer_cmd seek |
| `bloom-mp-volume` | `number` (0..100) | miniplayer_cmd volume |
| `bloom-mp-add-to-lib` | `()` | mp_add_to_lib |
| `bloom-mp-add-to-pl` | `string` (plId) | mp_add_to_pl |
| `bloom-mp-new-pl` | `()` | mp_open_new_pl |
| `bloom-command` | `'playpause' \| 'prev' \| 'next' \| 'shuffle' \| 'repeat' \| 'fav'` | miniplayer_cmd |
| `bloom-open-artist` | `string` (artist) | tray_open_artist |
| `bloom-deeplink` | `string` (url) | deep_link |
| `bloom-download-state` | `{ state: 'downloading'\|'done'\|'cancelled'\|'error', errorMsg?: string }` | downloads |
| `bloom-lyrics` | `LyricsResult` | lyrics_service |
| `bloom-folder-list` | `string[]` | folder_watcher |
| `bloom-folder-tracks` | `LocalTrackInfo[]` | folder_watcher |
| `bloom-folder-removed` | `string` (folder path) | folder_watcher |
| `bloom-folder-track-removed` | `string` (track id) | folder_watcher |
| `bloom-autostart-state` | `bool` | autostart |
| `bloom-autoplay-state` | `bool` | settings |
| `bloom-minimize-to-tray` | `bool` | settings |
| `bloom-window-focus` | `bool` | window |
| `bloom-window-minimized` | `bool` | window |
| `bloom-set-maximized` | `bool` | window |

## Соглашения миграции

- Команды/типы строго для одной фичи → в `src/features/<x>/api/` и `src/features/<x>/model/types.ts`.
- Кросс-доменные (`AppSettings`, `MpState`, `DiscordSettings`, `LyricsResult`, `LocalTrackInfo`) → в `src/shared/tauri/types.ts`.
- Все события → `src/shared/tauri/events.ts` (один discriminated union `AppEvent`).
- Низкоуровневые хелперы (`invoke`, `listen`, хуки `useTauriEvent`, `useInvoke`) → `src/shared/tauri/core.ts` + `src/shared/hooks/`.
