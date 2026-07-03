//! Tauri-команды: мост между фронтендом и нативным бэкендом.

use base64::Engine as _;
use tauri::{AppHandle, Emitter, Manager};
use once_cell::sync::OnceCell;
use parking_lot::Mutex;

static PENDING_DEEP_LINK: OnceCell<Mutex<Option<String>>> = OnceCell::new();

// ============= Mini Player State Cache =============

#[derive(Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct MpState {
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub artwork: Option<String>,
    pub position: f64,
    pub duration: f64,
    pub volume: i32,
    pub shuffle: bool,
    pub repeat: i32,
    pub fav: bool,
    pub can_add_to_lib: bool,
    /// Площадка текущего трека для бейджа на обложке мини-плеера/трея
    /// ("soundcloud" | "yandex" | None).
    pub source: Option<String>,
}

static MP_STATE: OnceCell<Mutex<MpState>> = OnceCell::new();

fn mp_state() -> &'static Mutex<MpState> {
    MP_STATE.get_or_init(|| Mutex::new(MpState::default()))
}

pub fn set_pending_deep_link(url: String) {
    PENDING_DEEP_LINK.get_or_init(|| Mutex::new(None)).lock().replace(url);
}

#[tauri::command]
pub fn get_pending_deep_link() -> Option<String> {
    PENDING_DEEP_LINK.get().and_then(|m| m.lock().take())
}

use std::path::{Path, PathBuf};

use crate::autostart;
use crate::config::{self, AppSettings};
use crate::cover_server;
#[cfg(windows)]
use crate::discord_rpc;
use crate::folder_watcher;
use crate::lyrics_service;
#[cfg(windows)]
use crate::smtc;
#[cfg(windows)]
use crate::thumb_toolbar;
#[cfg(windows)]
use crate::tray;

// ============= Settings (get/set) =============

#[tauri::command]
pub fn get_app_settings() -> Result<AppSettings, String> {
    config::load_app_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn setautostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        autostart::enable(&app).map_err(|e| e.to_string())
    } else {
        autostart::disable(&app).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn getautostart(app: AppHandle) -> Result<bool, String> {
    Ok(autostart::is_enabled(&app))
}

#[tauri::command]
pub fn setautoplay(enabled: bool) -> Result<(), String> {
    let mut s = config::load_app_settings().map_err(|e| e.to_string())?;
    s.autoplay = enabled;
    config::save_app_settings(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn getautoplay() -> Result<bool, String> {
    Ok(config::load_app_settings().map(|s| s.autoplay).unwrap_or(false))
}

#[tauri::command]
pub fn setminimize_to_tray(enabled: bool) -> Result<(), String> {
    let mut s = config::load_app_settings().map_err(|e| e.to_string())?;
    s.minimize_to_tray = enabled;
    config::save_app_settings(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn getminimize_to_tray() -> Result<bool, String> {
    Ok(config::load_app_settings().map(|s| s.minimize_to_tray).unwrap_or(false))
}

#[tauri::command]
pub fn setdiscordrpc(enabled: bool) -> Result<(), String> {
    let mut s = config::load_app_settings().map_err(|e| e.to_string())?;
    s.discord_rpc = enabled;
    config::save_app_settings(&s).map_err(|e| e.to_string())?;
    if enabled {
        // Запускаем worker-поток, если приложение стартовало с ВЫКЛ RPC: в setup
        // `initialize()` зовётся только при discord_rpc=true, иначе TX=None и
        // последующие update() уходят в никуда. initialize() идемпотентна.
        discord_rpc::initialize();
    } else {
        // Гасим presence немедленно: обработчик `now_playing` при discord_rpc=false
        // пропускает весь блок и сам clear() не вызовет — активность висела бы до рестарта.
        discord_rpc::clear();
    }
    Ok(())
}

#[tauri::command]
pub fn getdiscordrpc() -> Result<bool, String> {
    Ok(config::load_app_settings().map(|s| s.discord_rpc).unwrap_or(true))
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DiscordSettings {
    pub show_progress: bool,
    pub custom_artwork: String,
    pub show_small_img: bool,
    pub small_img_url: String,
    pub small_img_mode: String,
    pub btn1_mode: String,
    pub btn1_label: String,
    pub btn1_url: String,
    pub btn2_mode: String,
    pub btn2_label: String,
    pub btn2_url: String,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // сигнатура зеркалит набор настроек Discord на фронте
pub fn set_discord_settings(
    show_progress: bool,
    custom_artwork: String,
    show_small_img: bool,
    small_img_url: String,
    small_img_mode: String,
    btn1_mode: String,
    btn1_label: String,
    btn1_url: String,
    btn2_mode: String,
    btn2_label: String,
    btn2_url: String,
) -> Result<(), String> {
    let mut s = config::load_app_settings().map_err(|e| e.to_string())?;
    s.discord_show_progress  = show_progress;
    s.discord_custom_artwork = custom_artwork;
    s.discord_show_small_img = show_small_img;
    s.discord_small_img_url  = small_img_url;
    s.discord_small_img_mode = small_img_mode;
    s.discord_btn1_mode      = btn1_mode;
    s.discord_btn1_label     = btn1_label;
    s.discord_btn1_url       = btn1_url;
    s.discord_btn2_mode      = btn2_mode;
    s.discord_btn2_label     = btn2_label;
    s.discord_btn2_url       = btn2_url;
    config::save_app_settings(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_discord_settings() -> Result<DiscordSettings, String> {
    let s = config::load_app_settings().unwrap_or_default();
    Ok(DiscordSettings {
        show_progress: s.discord_show_progress,
        custom_artwork: s.discord_custom_artwork,
        show_small_img: s.discord_show_small_img,
        small_img_url: s.discord_small_img_url,
        small_img_mode: s.discord_small_img_mode,
        btn1_mode: s.discord_btn1_mode,
        btn1_label: s.discord_btn1_label,
        btn1_url: s.discord_btn1_url,
        btn2_mode: s.discord_btn2_mode,
        btn2_label: s.discord_btn2_label,
        btn2_url: s.discord_btn2_url,
    })
}

#[tauri::command]
pub fn setchangetitlebar(enabled: bool) -> Result<(), String> {
    let mut s = config::load_app_settings().map_err(|e| e.to_string())?;
    s.change_titlebar = enabled;
    config::save_app_settings(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn getchangetitlebar() -> Result<bool, String> {
    Ok(config::load_app_settings().map(|s| s.change_titlebar).unwrap_or(true))
}

#[tauri::command]
pub fn setchangetray_cover(enabled: bool) -> Result<(), String> {
    let mut s = config::load_app_settings().map_err(|e| e.to_string())?;
    s.change_tray_cover = enabled;
    config::save_app_settings(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn getchangetray_cover() -> Result<bool, String> {
    Ok(config::load_app_settings().map(|s| s.change_tray_cover).unwrap_or(false))
}

#[tauri::command]
pub fn setzoom(app: AppHandle, zoom: f64) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let fullscreen = w.is_maximized().unwrap_or(false);
        if fullscreen {
            let _ = w.set_zoom(zoom);
        }
    }
    let mut ws = config::load_window_state().map_err(|e| e.to_string())?;
    ws.zoom = Some(zoom);
    config::save_window_state(&ws).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn setwinzoom(app: AppHandle, zoom: f64) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let fullscreen = w.is_maximized().unwrap_or(false);
        if !fullscreen {
            let _ = w.set_zoom(zoom);
        }
    }
    let mut ws = config::load_window_state().map_err(|e| e.to_string())?;
    ws.window_zoom = Some(zoom);
    config::save_window_state(&ws).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_cover_data(data_url: String, playing: bool) -> Result<(), String> {
    cover_server::set_cover_from_data_url(&data_url);
    let settings = config::load_app_settings().unwrap_or_default();
    #[cfg(windows)]
    if settings.change_tray_cover && playing {
        if let Some(bytes) = cover_server::current_bytes() {
            tray::set_icon_from_bytes(&bytes);
        }
    } else {
        tray::reset_icon();
    }
    #[cfg(not(windows))]
    {
        let _ = (playing, settings);
    }
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // сигнатура зеркалит payload now_playing с фронта
pub fn now_playing(
    app: AppHandle,
    title: String,
    artist: String,
    playing: bool,
    artwork: Option<String>,
    position: Option<f64>,
    duration: Option<f64>,
    track_url: Option<String>,
    artist_url: Option<String>,
    fav: Option<bool>,
    can_add_to_lib: Option<bool>,
    shuffle: Option<bool>,
    repeat: Option<i32>,
    source: Option<String>,
) -> Result<(), String> {
    // `now_playing` пушится с фронта ~раз в секунду на позиционных тиках. Логируем
    // только при смене значимых полей (трек/состояние/обложка), иначе лог
    // заваливается одинаковыми строками всё время воспроизведения.
    {
        static LAST_LOGGED: OnceCell<Mutex<Option<(String, String, bool, String)>>> =
            OnceCell::new();
        let key = (
            title.clone(),
            artist.clone(),
            playing,
            artwork.clone().unwrap_or_default(),
        );
        let mut last = LAST_LOGGED.get_or_init(|| Mutex::new(None)).lock();
        if last.as_ref() != Some(&key) {
            tracing::info!(
                "now_playing: '{title}' — '{artist}' playing={playing} artwork={}",
                artwork.as_deref().map(|s| &s[..s.len().min(60)]).unwrap_or("")
            );
            *last = Some(key);
        }
    }
    let settings = config::load_app_settings().unwrap_or_default();

    // Оконный тайтл + HTML-тайтлбар через emit.
    let display_title = if settings.change_titlebar && playing && !title.is_empty() {
        if artist.is_empty() {
            format!("  {title}")
        } else {
            format!("  {title}  —  {artist}")
        }
    } else {
        "Bloom".to_string()
    };
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_title(&display_title);
    }
    let _ = app.emit("bloom-set-title", &display_title);

    // Обложка для Discord RPC.
    if let Some(ref aw) = artwork {
        if aw.starts_with("data:") {
            cover_server::set_cover_from_data_url(aw);
        } else if aw.starts_with("http") {
            cover_server::fetch_cover_async(aw.clone());
        } else if aw.is_empty() {
            cover_server::clear_cover();
        }
    } else {
        cover_server::clear_cover();
    }

    #[cfg(windows)]
    {
        smtc::update_display(&title, &artist, playing, artwork.as_deref());
        tray::update_now_playing(&title, &artist, playing);
        thumb_toolbar::set_playing(playing);
        // Обложка в трее: если data:-URL → уже в cover_server. Иначе ждём cover_data.
        if settings.change_tray_cover && playing {
            if let Some(bytes) = cover_server::current_bytes() {
                tray::set_icon_from_bytes(&bytes);
            }
        } else {
            tray::reset_icon();
        }
    }

    #[cfg(windows)]
    if settings.discord_rpc {
        if playing && !title.is_empty() {
            let t_url  = track_url.as_deref().unwrap_or("").to_string();
            let a_url  = artist_url.as_deref().unwrap_or("").to_string();
            let resolve_btn_url = |mode: &str, stored: &str| -> String {
                match mode {
                    "track"  => t_url.clone(),
                    "artist" => a_url.clone(),
                    _        => stored.to_string(),
                }
            };
            discord_rpc::update(discord_rpc::PresenceState {
                title: title.clone(),
                artist: artist.clone(),
                playing,
                artwork_url: artwork.clone().unwrap_or_default(),
                position_sec: position.unwrap_or(0.0),
                duration_sec: duration.unwrap_or(0.0),
                show_progress: settings.discord_show_progress,
                custom_artwork: settings.discord_custom_artwork.clone(),
                show_small_img: settings.discord_show_small_img,
                small_img_url:  settings.discord_small_img_url.clone(),
                small_img_mode: settings.discord_small_img_mode.clone(),
                source:         source.clone().unwrap_or_default(),
                btn1_mode:  settings.discord_btn1_mode.clone(),
                btn1_label: settings.discord_btn1_label.clone(),
                btn1_url:   resolve_btn_url(&settings.discord_btn1_mode, &settings.discord_btn1_url),
                btn2_mode:  settings.discord_btn2_mode.clone(),
                btn2_label: settings.discord_btn2_label.clone(),
                btn2_url:   resolve_btn_url(&settings.discord_btn2_mode, &settings.discord_btn2_url),
            });
        } else {
            discord_rpc::clear();
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (position, duration);
    }

    // Обновляем кэш мини-плеера и шлём состояние в его окно.
    {
        let mut s = mp_state().lock();
        s.title = title.clone();
        s.artist = artist.clone();
        s.playing = playing;
        s.artwork = artwork.clone();
        s.position = position.unwrap_or(0.0);
        s.duration = duration.unwrap_or(0.0);
        if let Some(f) = fav { s.fav = f; }
        if let Some(b) = can_add_to_lib { s.can_add_to_lib = b; }
        if let Some(sh) = shuffle { s.shuffle = sh; }
        if let Some(rp) = repeat { s.repeat = rp; }
        s.source = source;
    }
    if let Some(mp) = app.get_webview_window("miniplayer") {
        let s = mp_state().lock().clone();
        let _ = mp.emit("bloom-mp-state", s);
    }
    if let Some(tp) = app.get_webview_window("tray-popup") {
        let s = mp_state().lock().clone();
        let _ = tp.emit("bloom-mp-state", s);
    }
    // Оверлей-«остров»: держим контент свежим, пока плашка закреплена/видна.
    if let Some(ov) = app.get_webview_window("overlay") {
        let s = mp_state().lock().clone();
        let _ = ov.emit("bloom-mp-state", s);
    }

    Ok(())
}

// ============= Overlay (HUD-«остров») =============

/// Конфиг оверлея с фронта (режим/якорь/масштаб + свободная позиция). enabled=false прячет окно.
#[tauri::command]
pub fn overlay_set_config(
    app: AppHandle,
    enabled: bool,
    anchor: String,
    size: f64,
    custom_x: f64,
    custom_y: f64,
    preview: bool,
) -> Result<(), String> {
    crate::overlay::set_config(&app, enabled, anchor, size, custom_x, custom_y, preview);
    Ok(())
}

/// Вкл/выкл режим ручного размещения плашки (перетаскивание мышью).
#[tauri::command]
pub fn overlay_place_mode(app: AppHandle, on: bool) -> Result<(), String> {
    crate::overlay::set_place_mode(&app, on);
    Ok(())
}

/// Сдвинуть окно оверлея на дельту мыши (логич. CSS-пиксели) при ручном размещении.
#[tauri::command]
pub fn overlay_drag_by(app: AppHandle, dx: f64, dy: f64) -> Result<(), String> {
    crate::overlay::drag_by(&app, dx, dy);
    Ok(())
}

/// Всплытие плашки на смену трека (фронт зовёт, если включено в настройках).
#[tauri::command]
pub fn overlay_flash(app: AppHandle) -> Result<(), String> {
    crate::overlay::flash(&app);
    Ok(())
}

/// Тогл закрепления плашки (дублирует глобальный хоткей для UI-кнопок).
#[tauri::command]
pub fn overlay_toggle(app: AppHandle) -> Result<(), String> {
    crate::overlay::toggle(&app);
    Ok(())
}

/// Переключить click-through оверлея: interactive=true → окно ловит мышь (кнопки
/// кликабельны), false → клики проходят насквозь. Зовётся плашкой при показе/скрытии.
#[tauri::command]
pub fn overlay_set_interactive(app: AppHandle, interactive: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.set_ignore_cursor_events(!interactive);
    }
    Ok(())
}

// ============= Mini Player Commands =============

#[tauri::command]
pub fn miniplayer_get_state() -> MpState {
    mp_state().lock().clone()
}

#[tauri::command]
pub fn open_miniplayer(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("miniplayer") {
        let _ = w.show();
        let _ = w.set_focus();
        let s = mp_state().lock().clone();
        let _ = w.emit("bloom-mp-state", s);
    }
    Ok(())
}

#[tauri::command]
pub fn close_miniplayer(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("miniplayer") {
        let _ = w.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("bloom-mp-closed", ());
    }
    Ok(())
}

#[tauri::command]
pub fn miniplayer_cmd(window: tauri::Window, app: AppHandle, cmd: String, value: Option<f64>) -> Result<(), String> {
    match cmd.as_str() {
        "playpause" => { let _ = app.emit("bloom-command", "playpause"); }
        "prev"      => { let _ = app.emit("bloom-command", "prev"); }
        "next"      => { let _ = app.emit("bloom-command", "next"); }
        "shuffle"   => { let _ = app.emit("bloom-command", "shuffle"); }
        "repeat"    => { let _ = app.emit("bloom-command", "repeat"); }
        "fav"       => { let _ = app.emit("bloom-command", "fav"); }
        "seek" => {
            if let Some(v) = value {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.emit("bloom-mp-seek", v);
                }
            }
        }
        "volume" => {
            if let Some(v) = value {
                let vi = v as i32;
                mp_state().lock().volume = vi;
                let src = window.label().to_string();
                for label in ["main", "miniplayer", "tray-popup"] {
                    if label == src { continue; }
                    if let Some(w) = app.get_webview_window(label) {
                        let _ = w.emit("bloom-mp-volume", vi);
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub fn mp_add_to_lib(app: AppHandle) -> Result<(), String> {
    let _ = app.emit("bloom-mp-add-to-lib", ());
    Ok(())
}

#[tauri::command]
pub fn mp_add_to_pl(app: AppHandle, pl_id: String) -> Result<(), String> {
    let _ = app.emit("bloom-mp-add-to-pl", pl_id);
    Ok(())
}

#[tauri::command]
pub fn mp_open_new_pl(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    let _ = app.emit("bloom-mp-new-pl", ());
    Ok(())
}

#[tauri::command]
pub fn open_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn hide_tray_popup(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("tray-popup") {
        let _ = w.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn exit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn tray_open_artist(app: AppHandle, artist: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        let _ = w.emit("bloom-open-artist", artist);
    }
    if let Some(tp) = app.get_webview_window("tray-popup") {
        let _ = tp.hide();
    }
    Ok(())
}

// ============= Заглушки (будут реализованы) =============

#[tauri::command]
pub fn folder_add(app: AppHandle, path: String) -> Result<(), String> {
    folder_watcher::add_folder(&app, PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn folder_remove(app: AppHandle, path: String) -> Result<(), String> {
    folder_watcher::remove_folder(&app, Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn folder_scan(app: AppHandle, path: String) -> Result<(), String> {
    folder_watcher::scan_folder(&app, PathBuf::from(path));
    Ok(())
}

#[tauri::command]
pub fn folder_get() -> Result<Vec<String>, String> {
    folder_watcher::get_folders().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sc_download(
    app: AppHandle,
    url: String,
    filename: String,
    cover_url: Option<String>,
    title: Option<String>,
    artist: Option<String>,
    referer: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        download_sc(app, url, filename, cover_url, title, artist, referer).await;
    });
    Ok(())
}

/// Диалог выбора папки для скачивания плейлиста. Создаёт внутри выбранной
/// директории подпапку с именем плейлиста и возвращает её путь (или None, если
/// пользователь отменил выбор). Фронтенд затем покадрово вызывает
/// `download_to_dir` — так подписанные CDN-ссылки (SC/YM, живут минуты)
/// резолвятся непосредственно перед скачиванием и не успевают протухнуть.
#[tauri::command]
pub async fn pick_playlist_dir(app: AppHandle, folder_name: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    // Async-команда выполняется вне главного потока → blocking-диалог безопасен.
    let picked = app
        .dialog()
        .file()
        .set_title("Выберите папку для сохранения плейлиста")
        .blocking_pick_folder();
    let base = match picked.and_then(|p| p.into_path().ok()) {
        Some(p) => p,
        None => return Ok(None),
    };
    let dir = base.join(sanitize_filename(&folder_name));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(Some(dir.to_string_lossy().to_string()))
}

/// Скачать один трек площадки в уже выбранную папку (без диалога), вшить теги.
/// Имя файла при коллизии получает суффикс ` (N)`.
#[tauri::command]
pub async fn download_to_dir(
    dir: String,
    url: String,
    filename: String,
    cover_url: Option<String>,
    title: Option<String>,
    artist: Option<String>,
    referer: Option<String>,
) -> Result<(), String> {
    let bytes = fetch_audio(&url, referer.as_deref()).await?;
    let ext = audio_ext(&bytes);
    let dir = PathBuf::from(dir);
    let safe = sanitize_filename(&filename);
    let path = unique_path(&dir, &safe, ext);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    embed_tags_async(&path, cover_url.as_deref(), title.as_deref(), artist.as_deref(), referer.as_deref()).await;
    Ok(())
}

/// MIME по magic-bytes для `data:`-URL (по умолчанию JPEG).
fn image_mime(b: &[u8]) -> &'static str {
    if b.len() < 4 {
        return "image/jpeg";
    }
    match (b[0], b[1]) {
        (0x89, 0x50) => "image/png",
        (0x47, 0x49) => "image/gif",
        (0x52, 0x49) => "image/webp",
        _ => "image/jpeg",
    }
}

/// Скачать удалённую картинку (reqwest + rustls, в обход CORS WebView2) и вернуть
/// её как `data:`-URL. Нужно «Оптимизации»: заморозка GIF снимает первый кадр
/// через canvas, но браузерный `fetch` из WebView блокируется CORS для площадок
/// без `Access-Control-Allow-Origin` (Pinterest и пр.) — поэтому тянем байты на
/// стороне Rust и отдаём data-URL, который canvas рисует без CORS-ограничений.
#[tauri::command]
pub async fn fetch_image_data_url(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = fetch_bytes_retry(&client, &url, None, 3).await?;
    if !looks_like_image(&bytes) {
        return Err("ответ не похож на изображение".into());
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", image_mime(&bytes), b64))
}

#[tauri::command]
pub fn cover_download(
    app: AppHandle,
    data_url: Option<String>,
    url: Option<String>,
    filename: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        download_cover(app, data_url, url, filename).await;
    });
    Ok(())
}

#[tauri::command]
pub fn local_download(app: AppHandle, local_path: String, filename: String) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        download_local(app, local_path, filename).await;
    });
    Ok(())
}

fn emit_download_state(app: &AppHandle, state: &str, message: Option<&str>) {
    #[derive(serde::Serialize, Clone)]
    struct Payload<'a> {
        state: &'a str,
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<&'a str>,
    }
    let _ = app.emit("bloom-download-state", Payload { state, message });
}

fn sanitize_filename(name: &str) -> String {
    let invalid = ['\\', '/', ':', '*', '?', '"', '<', '>', '|', '\0'];
    let s: String = name.chars().filter(|c| !invalid.contains(c)).collect();
    if s.trim().is_empty() { "track".to_string() } else { s }
}

/// GET с повтором при троттлинге (403/429/5xx) и проверкой статуса ДО чтения
/// тела. Важно: без проверки статуса `.bytes()` отдаёт тело-ошибку (HTML 403),
/// которое иначе попало бы в аудиофайл или вшилось как «обложка». Бэкофф растёт
/// экспоненциально, чтобы переждать rate-limit площадки при пакетной загрузке.
async fn fetch_bytes_retry(
    client: &reqwest::Client,
    url: &str,
    referer: Option<&str>,
    attempts: u32,
) -> Result<Vec<u8>, String> {
    use std::time::Duration;
    let mut last = "нет ответа".to_string();
    for attempt in 0..attempts {
        if attempt > 0 {
            // 0.7s, 1.4s, 2.8s, …
            let ms = 700u64 * (1u64 << (attempt - 1));
            tokio::time::sleep(Duration::from_millis(ms)).await;
        }
        let mut rb = client.get(url);
        if let Some(r) = referer {
            rb = rb.header("Referer", r);
        }
        match rb.send().await {
            Ok(resp) => {
                let st = resp.status();
                if st.is_success() {
                    return resp.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string());
                }
                last = format!("HTTP {}", st.as_u16());
                let code = st.as_u16();
                // Не троттлинг (404/410 и пр.) — повторять бессмысленно.
                if !(code == 403 || code == 429 || st.is_server_error()) {
                    return Err(last);
                }
            }
            Err(e) => last = e.to_string(),
        }
    }
    Err(last)
}

/// Похоже ли начало буфера на изображение (JPEG/PNG/GIF/WebP) — защита от
/// вшивания тела-ошибки как обложки.
fn looks_like_image(b: &[u8]) -> bool {
    b.len() >= 4
        && ((b[0] == 0xFF && b[1] == 0xD8) // JPEG
            || (b[0] == 0x89 && b[1] == 0x50) // PNG
            || (b[0] == 0x47 && b[1] == 0x49) // GIF
            || (b[0] == 0x52 && b[1] == 0x49)) // RIFF/WebP
}

/// Скачать аудио по прямому CDN-URL (reqwest + rustls, в обход CORS WebView2).
/// `referer` нужен SC (виртуальный origin → 403 без него); YM передаёт `None`.
async fn fetch_audio(url: &str, referer: Option<&str>) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;
    fetch_bytes_retry(&client, url, referer, 4).await
}

/// Расширение по magic-bytes: MP4/M4A — "ftyp" по смещению 4, иначе mp3.
fn audio_ext(bytes: &[u8]) -> &'static str {
    if bytes.len() > 8 && &bytes[4..8] == b"ftyp" { "m4a" } else { "mp3" }
}

async fn download_sc(
    app: AppHandle,
    url: String,
    filename: String,
    cover_url: Option<String>,
    title: Option<String>,
    artist: Option<String>,
    referer: Option<String>,
) {
    use tauri_plugin_dialog::DialogExt;

    tracing::info!("stream download: {filename} — {}", &url[..url.len().min(80)]);
    emit_download_state(&app, "downloading", None);

    let bytes = match fetch_audio(&url, referer.as_deref()).await {
        Ok(b) => b,
        Err(e) => { emit_download_state(&app, "error", Some(&e)); return; }
    };

    let ext = audio_ext(&bytes);

    let safe = sanitize_filename(&filename);
    let default_name = format!("{safe}.{ext}");
    let filter = if ext == "m4a" { "AAC audio" } else { "MP3 audio" };

    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .set_title("Сохранить трек")
        .set_file_name(&default_name)
        .add_filter(filter, &[ext])
        .add_filter("Все файлы", &["*"])
        .save_file(move |path| {
            let _ = tx.send(path.and_then(|p| p.into_path().ok()));
        });

    let target = rx.recv().ok().flatten();
    match target {
        Some(path) => {
            if let Err(e) = std::fs::write(&path, &bytes) {
                emit_download_state(&app, "error", Some(&e.to_string()));
                return;
            }
            tracing::info!("SC download saved: {}", path.display());
            // Embed cover + metadata tags after saving audio.
            embed_tags_async(&path, cover_url.as_deref(), title.as_deref(), artist.as_deref(), referer.as_deref()).await;
            emit_download_state(&app, "done", None);
        }
        None => emit_download_state(&app, "cancelled", None),
    }
}

async fn embed_tags_async(
    path: &Path,
    cover_url: Option<&str>,
    title: Option<&str>,
    artist: Option<&str>,
    referer: Option<&str>,
) {
    use std::time::Duration;

    tracing::info!("embed_tags_async: cover_url={:?} title={:?} artist={:?}",
        cover_url.map(|s| &s[..s.len().min(60)]), title, artist);
    // Download cover image if URL provided.
    let cover_bytes: Option<Vec<u8>> = if let Some(cu) = cover_url {
        if cu.starts_with("data:") {
            // data: URL — decode base64 portion.
            cu.find(',').and_then(|i| {
                base64::engine::general_purpose::STANDARD.decode(&cu[i + 1..]).ok()
            })
        } else if cu.starts_with("http") || cu.starts_with("//") {
            // Протокол-относительный `//host/...` → дополняем https.
            let url = if let Some(rest) = cu.strip_prefix("//") {
                format!("https://{rest}")
            } else {
                cu.to_string()
            };
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(12))
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                .build();
            match client {
                Ok(c) => match fetch_bytes_retry(&c, &url, referer, 3).await {
                    Ok(b) if looks_like_image(&b) => Some(b),
                    Ok(_) => { tracing::warn!("cover: ответ не похож на изображение, пропускаем"); None }
                    Err(e) => { tracing::warn!("cover download failed: {e}"); None }
                },
                Err(e) => { tracing::warn!("cover client build: {e}"); None }
            }
        } else {
            None
        }
    } else {
        None
    };

    let path = path.to_path_buf();
    let title = title.map(str::to_string);
    let artist = artist.map(str::to_string);

    let res = tokio::task::spawn_blocking(move || {
        embed_tags_sync(&path, cover_bytes.as_deref(), title.as_deref(), artist.as_deref())
    })
    .await;

    match res {
        Ok(Ok(())) => tracing::info!("tags embedded"),
        Ok(Err(e)) => tracing::warn!("embed tags: {e}"),
        Err(e) => tracing::warn!("embed tags task: {e}"),
    }
}

fn embed_tags_sync(
    path: &std::path::Path,
    cover_bytes: Option<&[u8]>,
    title: Option<&str>,
    artist: Option<&str>,
) -> anyhow::Result<()> {
    use lofty::config::WriteOptions;
    use lofty::file::{AudioFile, TaggedFileExt};
    use lofty::picture::{Picture, PictureType};
    use lofty::tag::{Accessor, Tag, TagExt, TagType};

    if cover_bytes.is_none() && title.is_none() && artist.is_none() {
        return Ok(());
    }

    let mut tagged_file = lofty::read_from_path(path)?;

    let tag: &mut lofty::tag::Tag = if tagged_file.primary_tag_mut().is_some() {
        tagged_file.primary_tag_mut().unwrap()
    } else if tagged_file.first_tag_mut().is_some() {
        tagged_file.first_tag_mut().unwrap()
    } else {
        // No existing tags — create a new one and save it separately.
        let tag_type = match path
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("m4a") | Some("aac") => TagType::Mp4Ilst,
            Some("flac") => TagType::VorbisComments,
            Some("ogg") | Some("opus") => TagType::VorbisComments,
            _ => TagType::Id3v2,
        };
        let mut new_tag = Tag::new(tag_type);
        if let Some(t) = title { new_tag.set_title(t.to_string()); }
        if let Some(a) = artist { new_tag.set_artist(a.to_string()); }
        if let Some(cb) = cover_bytes {
            let mime = detect_cover_mime(cb);
            let picture = Picture::new_unchecked(
                PictureType::CoverFront,
                Some(mime),
                None,
                cb.to_vec(),
            );
            new_tag.push_picture(picture);
        }
        new_tag.save_to_path(path, WriteOptions::default())
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        return Ok(());
    };

    if let Some(t) = title {
        if tag.title().map(|v| v.is_empty()).unwrap_or(true) {
            tag.set_title(t.to_string());
        }
    }
    if let Some(a) = artist {
        if tag.artist().map(|v| v.is_empty()).unwrap_or(true) {
            tag.set_artist(a.to_string());
        }
    }
    if let Some(cb) = cover_bytes {
        let mime = detect_cover_mime(cb);
        tag.remove_picture_type(PictureType::CoverFront);
        let picture = Picture::new_unchecked(
            PictureType::CoverFront,
            Some(mime),
            None,
            cb.to_vec(),
        );
        tag.push_picture(picture);
    }

    tagged_file.save_to_path(path, WriteOptions::default())
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(())
}

fn detect_cover_mime(bytes: &[u8]) -> lofty::picture::MimeType {
    use lofty::picture::MimeType;
    if bytes.len() < 4 { return MimeType::Jpeg; }
    match (bytes[0], bytes[1]) {
        (0x89, 0x50) => MimeType::Png,
        (0x47, 0x49) => MimeType::Gif,
        (0x52, 0x49) => MimeType::Unknown("image/webp".to_string()),
        _ => MimeType::Jpeg,
    }
}

async fn download_local(app: AppHandle, src: String, filename: String) {
    use tauri_plugin_dialog::DialogExt;

    let src_path = PathBuf::from(&src);
    tracing::info!("local download: {filename} — {}", src_path.display());

    if !src_path.exists() {
        emit_download_state(&app, "error", Some("Файл не найден"));
        return;
    }
    if !folder_watcher::is_path_allowed(&src_path) {
        tracing::warn!("local_download: access denied: {}", src_path.display());
        emit_download_state(&app, "error", Some("Доступ запрещён"));
        return;
    }

    emit_download_state(&app, "downloading", None);

    let ext = src_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_string();
    let safe = sanitize_filename(&filename);
    let default_name = if ext.is_empty() { safe.clone() } else { format!("{safe}.{ext}") };
    let filter_label = format!("{} audio", ext.to_uppercase());

    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    let mut dlg = app
        .dialog()
        .file()
        .set_title("Сохранить трек")
        .set_file_name(&default_name);
    if !ext.is_empty() {
        dlg = dlg.add_filter(&filter_label, &[&ext]);
    }
    dlg.add_filter("Все файлы", &["*"]).save_file(move |path| {
        let _ = tx.send(path.and_then(|p| p.into_path().ok()));
    });

    let target = rx.recv().ok().flatten();
    match target {
        Some(path) => match std::fs::copy(&src_path, &path) {
            Ok(_) => {
                tracing::info!("local download saved: {}", path.display());
                emit_download_state(&app, "done", None);
            }
            Err(e) => emit_download_state(&app, "error", Some(&e.to_string())),
        },
        None => emit_download_state(&app, "cancelled", None),
    }
}

async fn download_cover(app: AppHandle, data_url: Option<String>, url: Option<String>, filename: String) {
    use std::time::Duration;
    use tauri_plugin_dialog::DialogExt;

    emit_download_state(&app, "downloading", None);

    // Get image bytes from data URL or HTTP URL.
    let image_bytes: Vec<u8> = if let Some(du) = data_url {
        let comma = du.find(',').unwrap_or(0);
        match base64::engine::general_purpose::STANDARD.decode(&du[comma + 1..]) {
            Ok(b) => b,
            Err(e) => { emit_download_state(&app, "error", Some(&e.to_string())); return; }
        }
    } else if let Some(ref src_url) = url {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            .build()
        {
            Ok(c) => c,
            Err(e) => { emit_download_state(&app, "error", Some(&e.to_string())); return; }
        };
        match client.get(src_url).header("Referer", "https://soundcloud.com/").send().await {
            Ok(r) if r.status().is_success() => match r.bytes().await {
                Ok(b) => b.to_vec(),
                Err(e) => { emit_download_state(&app, "error", Some(&e.to_string())); return; }
            },
            Ok(r) => { emit_download_state(&app, "error", Some(&format!("HTTP {}", r.status()))); return; }
            Err(e) => { emit_download_state(&app, "error", Some(&e.to_string())); return; }
        }
    } else {
        emit_download_state(&app, "error", Some("Нет данных обложки"));
        return;
    };

    let ext = if image_bytes.len() >= 4 && image_bytes[0] == 0x89 && image_bytes[1] == 0x50 { "png" } else { "jpg" };
    let safe = sanitize_filename(&filename);
    let default_name = format!("{safe}.{ext}");

    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .set_title("Сохранить обложку")
        .set_file_name(&default_name)
        .add_filter("Image", &["jpg", "jpeg", "png"])
        .add_filter("Все файлы", &["*"])
        .save_file(move |path| {
            let _ = tx.send(path.and_then(|p| p.into_path().ok()));
        });

    let target = rx.recv().ok().flatten();
    match target {
        Some(path) => match std::fs::write(&path, &image_bytes) {
            Ok(_) => {
                tracing::info!("cover saved: {}", path.display());
                emit_download_state(&app, "done", None);
            }
            Err(e) => emit_download_state(&app, "error", Some(&e.to_string())),
        },
        None => emit_download_state(&app, "cancelled", None),
    }
}

/// Уникальный путь в папке: при коллизии имени добавляет суффикс ` (N)`.
fn unique_path(dir: &Path, base: &str, ext: &str) -> PathBuf {
    let mut p = dir.join(format!("{base}.{ext}"));
    let mut n = 2;
    while p.exists() {
        p = dir.join(format!("{base} ({n}).{ext}"));
        n += 1;
    }
    p
}

#[tauri::command]
pub fn lyrics_request(
    app: AppHandle,
    artist: String,
    title: String,
    duration: f64,
    local_path: Option<String>,
    genius_token: Option<String>,
    request_id: String,
) -> Result<(), String> {
    lyrics_service::dispatch_request(app, request_id, artist, title, duration, local_path, genius_token);
    Ok(())
}

#[tauri::command]
pub fn lyrics_cache_clear() -> Result<(), String> {
    let deleted = lyrics_service::clear_all_cache();
    tracing::info!("lyrics_cache_clear: removed {deleted} disk entries");
    Ok(())
}

#[derive(serde::Serialize)]
pub struct LyricsCacheStats {
    pub count: usize,
    pub bytes: u64,
}

#[tauri::command]
pub fn lyrics_cache_stats() -> Result<LyricsCacheStats, String> {
    let (count, bytes) = lyrics_service::cache_stats();
    Ok(LyricsCacheStats { count, bytes })
}

/// Удалить записи кеша текстов старше `max_age_secs` секунд. Возвращает число удалённых.
#[tauri::command]
pub fn lyrics_cache_purge(max_age_secs: i64) -> Result<usize, String> {
    let deleted = lyrics_service::purge_older_than(max_age_secs);
    if deleted > 0 {
        tracing::info!("lyrics_cache_purge: removed {deleted} disk entries older than {max_age_secs}s");
    }
    Ok(deleted)
}

#[tauri::command]
pub fn set_lyrics_cache(enabled: bool) -> Result<(), String> {
    lyrics_service::set_disk_cache(enabled);
    let mut s = config::load_app_settings().map_err(|e| e.to_string())?;
    s.lyrics_disk_cache = enabled;
    config::save_app_settings(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn genius_token(_token: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn jserror(message: String) -> Result<(), String> {
    tracing::error!("[JS] {}", message);
    Ok(())
}

#[tauri::command]
pub async fn export_playlist_file(app: AppHandle, content: String, default_name: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel::<Option<std::path::PathBuf>>();
    app.dialog()
        .file()
        .set_title("Экспорт плейлиста")
        .set_file_name(&default_name)
        .add_filter("Bloom Playlist", &["bloomplaylist"])
        .save_file(move |path| { let _ = tx.send(path.and_then(|p| p.into_path().ok())); });
    match rx.recv().ok().flatten() {
        Some(path) => std::fs::write(&path, content.as_bytes()).map(|_| true).map_err(|e| e.to_string()),
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn import_playlist_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel::<Option<std::path::PathBuf>>();
    app.dialog()
        .file()
        .set_title("Импорт плейлиста")
        .add_filter("Bloom Playlist", &["bloomplaylist"])
        .pick_file(move |path| { let _ = tx.send(path.and_then(|p| p.into_path().ok())); });
    match rx.recv().ok().flatten() {
        Some(path) => std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn export_presets_file(app: AppHandle, content: String, default_name: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel::<Option<std::path::PathBuf>>();
    app.dialog()
        .file()
        .set_title("Экспорт пресетов")
        .set_file_name(&default_name)
        .add_filter("Bloom Presets", &["bloompresets"])
        .save_file(move |path| { let _ = tx.send(path.and_then(|p| p.into_path().ok())); });
    match rx.recv().ok().flatten() {
        Some(path) => std::fs::write(&path, content.as_bytes()).map(|_| true).map_err(|e| e.to_string()),
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn import_presets_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel::<Option<std::path::PathBuf>>();
    app.dialog()
        .file()
        .set_title("Импорт пресетов")
        .add_filter("Bloom Presets", &["bloompresets"])
        .pick_file(move |path| { let _ = tx.send(path.and_then(|p| p.into_path().ok())); });
    match rx.recv().ok().flatten() {
        Some(path) => std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

/// Экспорт логов: склеивает ротированный `bloom.log.1` (старое) и текущий
/// `bloom.log` (новое) в один файл и предлагает сохранить через диалог.
/// Возвращает `true`, если файл сохранён, `false` — если пользователь отменил.
#[tauri::command]
pub async fn export_logs(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let combined = read_combined_logs()?;
    if combined.is_empty() {
        return Err("Лог пуст или недоступен".into());
    }

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let default_name = format!("bloom-logs-{stamp}.log");

    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .set_title("Сохранить логи")
        .set_file_name(&default_name)
        .add_filter("Лог", &["log", "txt"])
        .add_filter("Все файлы", &["*"])
        .save_file(move |path| { let _ = tx.send(path.and_then(|p| p.into_path().ok())); });

    match rx.recv().ok().flatten() {
        Some(path) => std::fs::write(&path, combined.as_bytes()).map(|_| true).map_err(|e| e.to_string()),
        None => Ok(false),
    }
}

/// Собрать содержимое логов (`bloom.log.1` + `bloom.log`, старое→новое).
fn read_combined_logs() -> Result<String, String> {
    let dir = config::local_appdata_dir().map_err(|e| e.to_string())?;
    let mut combined = String::new();
    for name in ["bloom.log.1", "bloom.log"] {
        if let Ok(content) = std::fs::read_to_string(dir.join(name)) {
            combined.push_str(&content);
        }
    }
    Ok(combined)
}

/// Прочитать логи для просмотра в приложении. Возвращает «хвост» — последние
/// ~256 КБ, чтобы не тащить мегабайты в webview (полный объём — через `export_logs`).
#[tauri::command]
pub async fn read_logs() -> Result<String, String> {
    const MAX: usize = 256 * 1024;
    let combined = read_combined_logs()?;
    if combined.len() <= MAX {
        return Ok(combined);
    }
    // Сдвигаем точку среза до ближайшей валидной границы UTF-8 (в логах есть
    // кириллица), затем — до начала следующей строки, чтобы не рвать на полуслове.
    let mut cut = combined.len() - MAX;
    while cut < combined.len() && !combined.is_char_boundary(cut) {
        cut += 1;
    }
    let tail = &combined[cut..];
    let start = tail.find('\n').map(|i| i + 1).unwrap_or(0);
    Ok(format!("…(показаны последние записи)\n{}", &tail[start..]))
}

/// Очистить логи: усечь текущий `bloom.log` и удалить ротированный `bloom.log.1`.
#[tauri::command]
pub async fn clear_logs() -> Result<(), String> {
    let dir = config::local_appdata_dir().map_err(|e| e.to_string())?;
    // Текущий файл занят активным writer'ом — не удаляем, а усекаем до нуля.
    std::fs::write(dir.join("bloom.log"), b"").map_err(|e| e.to_string())?;
    let rotated = dir.join("bloom.log.1");
    if rotated.exists() {
        let _ = std::fs::remove_file(rotated);
    }
    tracing::info!("logs cleared by user");
    Ok(())
}

// ============================ Яндекс.Музыка ============================

use crate::yandex;

/// Шаг 1 device-flow: код устройства + ссылка для подтверждения.
#[tauri::command]
pub async fn ym_auth_start() -> Result<yandex::DeviceCode, String> {
    yandex::auth_start().await.map_err(|e| e.to_string())
}

/// Шаг 2 device-flow: один опрос. Возвращает "pending" | "ok".
/// При "ok" токен сохраняется в yandex.json.
#[tauri::command]
pub async fn ym_auth_poll(device_code: String) -> Result<String, String> {
    match yandex::auth_poll(&device_code).await.map_err(|e| e.to_string())? {
        yandex::PollOutcome::Pending => Ok("pending".into()),
        yandex::PollOutcome::Token(token) => {
            config::save_yandex(&config::YandexAuth { token }).map_err(|e| e.to_string())?;
            Ok("ok".into())
        }
    }
}

/// Авторизован ли пользователь (есть ли сохранённый токен).
#[tauri::command]
pub fn ym_is_authed() -> bool {
    config::load_yandex().map(|a| !a.token.is_empty()).unwrap_or(false)
}

/// Выйти — удалить сохранённый токен.
#[tauri::command]
pub fn ym_logout() -> Result<(), String> {
    config::clear_yandex().map_err(|e| e.to_string())
}

fn ym_token() -> Result<String, String> {
    let a = config::load_yandex().map_err(|e| e.to_string())?;
    if a.token.is_empty() {
        return Err("Не авторизован в Яндекс.Музыке".into());
    }
    Ok(a.token)
}

/// Поиск по всем категориям (треки/артисты/альбомы/плейлисты).
#[tauri::command]
pub async fn ym_search(query: String, page: Option<u32>) -> Result<yandex::YmSearch, String> {
    let token = ym_token()?;
    yandex::search(&token, &query, page.unwrap_or(0)).await.map_err(|e| e.to_string())
}

/// Альбом с треками.
#[tauri::command]
pub async fn ym_album(id: String) -> Result<yandex::YmEntity, String> {
    let token = ym_token()?;
    yandex::album(&token, &id).await.map_err(|e| e.to_string())
}

/// Артист: популярные треки.
#[tauri::command]
pub async fn ym_artist(id: String) -> Result<yandex::YmEntity, String> {
    let token = ym_token()?;
    yandex::artist(&token, &id).await.map_err(|e| e.to_string())
}

/// Плейлист с треками.
#[tauri::command]
pub async fn ym_playlist(owner: String, kind: String) -> Result<yandex::YmEntity, String> {
    let token = ym_token()?;
    yandex::playlist(&token, &owner, &kind).await.map_err(|e| e.to_string())
}

/// Публичный плейлист нового формата (music.yandex.ru/playlists/<uuid>) с треками.
#[tauri::command]
pub async fn ym_playlist_uuid(uuid: String) -> Result<yandex::YmEntity, String> {
    let token = ym_token()?;
    yandex::playlist_by_uuid(&token, &uuid).await.map_err(|e| e.to_string())
}

/// Резолв ссылки music.yandex.ru → трек/альбом/артист/плейлист.
#[tauri::command]
pub async fn ym_resolve(url: String) -> Result<yandex::YmResolved, String> {
    let token = ym_token()?;
    yandex::resolve(&token, &url).await.map_err(|e| e.to_string())
}

/// Есть ли активный Яндекс Плюс (для выбора источника на фронте).
#[tauri::command]
pub async fn ym_has_plus() -> Result<bool, String> {
    let token = ym_token()?;
    yandex::has_plus(&token).await.map_err(|e| e.to_string())
}

/// Прямой mp3-URL для воспроизведения в плеере.
#[tauri::command]
pub async fn ym_stream_url(id: String) -> Result<String, String> {
    let token = ym_token()?;
    yandex::stream_url(&token, &id).await.map_err(|e| e.to_string())
}

/// «Моя волна»: очередной батч rotor-станции.
#[tauri::command]
pub async fn ym_wave_tracks(
    station: Option<String>,
    last_id: Option<String>,
) -> Result<yandex::YmWave, String> {
    let token = ym_token()?;
    yandex::wave_tracks(
        &token,
        station.as_deref().unwrap_or(""),
        last_id.as_deref().unwrap_or(""),
    )
    .await
    .map_err(|e| e.to_string())
}

/// Общий чарт Яндекс.Музыки (треки) — для витрины «Чарты» на главной.
#[tauri::command]
pub async fn ym_chart() -> Result<Vec<yandex::YmTrack>, String> {
    let token = ym_token()?;
    yandex::chart(&token).await.map_err(|e| e.to_string())
}

/// Новинки Яндекс.Музыки (свежие альбомы) — для витрины «Новинки» на главной.
#[tauri::command]
pub async fn ym_new_releases() -> Result<Vec<yandex::YmAlbum>, String> {
    let token = ym_token()?;
    yandex::new_releases(&token).await.map_err(|e| e.to_string())
}

/// Фидбек «Моей волны» (best-effort, не критично при ошибке).
#[tauri::command]
pub async fn ym_wave_feedback(
    station: Option<String>,
    event: String,
    track_id: Option<String>,
    batch_id: Option<String>,
    played: Option<f64>,
) -> Result<(), String> {
    let token = ym_token()?;
    let _ = yandex::wave_feedback(
        &token,
        station.as_deref().unwrap_or(""),
        &event,
        track_id.as_deref().unwrap_or(""),
        batch_id.as_deref().unwrap_or(""),
        played.unwrap_or(0.0),
    )
    .await;
    Ok(())
}

/// Заворачивает любой аудио-URL (Яндекс/SoundCloud) в локальный прокси,
/// чтобы обойти TLS/CORS-проблемы WebView2.
#[tauri::command]
pub fn ym_proxy_url(url: String) -> Result<String, String> {
    crate::audio_proxy::proxied_url(&url).ok_or_else(|| "Аудио-прокси не запущен".to_string())
}

// ============================ YouTube Music ============================

use crate::ytm;

/// Поиск YouTube Music (треки/артисты/альбомы/плейлисты). Без авторизации.
#[tauri::command]
pub async fn ytm_search(query: String) -> Result<ytm::YtmSearch, String> {
    ytm::search(&query).await.map_err(|e| e.to_string())
}

/// Прямой аудио-URL для трека YTM по videoId. Заворачивать в `ym_proxy_url`
/// на фронте (googlevideo — range/CORS, как у Яндекса).
#[tauri::command]
pub async fn ytm_stream_url(video_id: String) -> Result<String, String> {
    ytm::stream_url(&video_id).await.map_err(|e| e.to_string())
}

/// Альбом с треками (browseId MPRE…).
#[tauri::command]
pub async fn ytm_album(id: String) -> Result<ytm::YtmEntity, String> {
    ytm::album(&id).await.map_err(|e| e.to_string())
}

/// Артист: популярные треки + альбомы (browseId UC…).
#[tauri::command]
pub async fn ytm_artist(id: String) -> Result<ytm::YtmEntity, String> {
    ytm::artist(&id).await.map_err(|e| e.to_string())
}

/// Плейлист с треками (browseId VL…/playlistId).
#[tauri::command]
pub async fn ytm_playlist(id: String) -> Result<ytm::YtmEntity, String> {
    ytm::playlist(&id).await.map_err(|e| e.to_string())
}

/// Один трек по videoId (метаданные для ре-резолва из «недавних»).
#[tauri::command]
pub async fn ytm_track(video_id: String) -> Result<ytm::YtmTrack, String> {
    ytm::track(&video_id).await.map_err(|e| e.to_string())
}

/// Лог-строка из фронта в общий tracing-лог (диагностика, напр. матч YTM-бриджа).
#[tauri::command]
pub fn ui_log(msg: String) {
    tracing::info!("{msg}");
}

// ============================ Spotify ============================

use crate::spotify;

/// Поиск Spotify (треки/артисты/альбомы/плейлисты). Нужны creds в настройках.
#[tauri::command]
pub async fn sp_search(query: String) -> Result<spotify::SpSearch, String> {
    spotify::search(&query).await.map_err(|e| e.to_string())
}

/// Альбом с треками.
#[tauri::command]
pub async fn sp_album(id: String) -> Result<spotify::SpEntity, String> {
    spotify::album(&id).await.map_err(|e| e.to_string())
}

/// Артист: популярные треки + альбомы.
#[tauri::command]
pub async fn sp_artist(id: String) -> Result<spotify::SpEntity, String> {
    spotify::artist(&id).await.map_err(|e| e.to_string())
}

/// Плейлист с треками.
#[tauri::command]
pub async fn sp_playlist(id: String) -> Result<spotify::SpEntity, String> {
    spotify::playlist(&id).await.map_err(|e| e.to_string())
}

/// Один трек по id (ре-резолв из «недавних»).
#[tauri::command]
pub async fn sp_track(id: String) -> Result<spotify::SpTrack, String> {
    spotify::track(&id).await.map_err(|e| e.to_string())
}

/// Сохранить креденшелы приложения Spotify (Client Credentials).
#[tauri::command]
pub fn sp_set_creds(client_id: String, client_secret: String) -> Result<(), String> {
    config::save_spotify(&config::SpotifyCreds {
        client_id: client_id.trim().to_string(),
        client_secret: client_secret.trim().to_string(),
    })
    .map_err(|e| e.to_string())
}

/// Текущие сохранённые creds (для префилла полей настроек; локальный конфиг).
#[tauri::command]
pub fn sp_get_creds() -> Result<config::SpotifyCreds, String> {
    config::load_spotify().map_err(|e| e.to_string())
}

/// Заданы ли creds (для гейта провайдера `isEnabled`).
#[tauri::command]
pub fn sp_has_creds() -> Result<bool, String> {
    let c = config::load_spotify().map_err(|e| e.to_string())?;
    Ok(!c.client_id.is_empty() && !c.client_secret.is_empty())
}

/// Проверить creds (обменять на токен). Ok → валидны.
#[tauri::command]
pub async fn sp_check() -> Result<(), String> {
    spotify::check().await.map_err(|e| e.to_string())
}

/// Удалить сохранённые creds.
#[tauri::command]
pub fn sp_clear_creds() -> Result<(), String> {
    config::clear_spotify().map_err(|e| e.to_string())
}
