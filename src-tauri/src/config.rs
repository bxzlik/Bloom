//! Конфигурация приложения: window.json, folders.json, appsettings.json
//! в %LocalAppData%\com.bloom.app\ (рядом с WebView2-данными).

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// %LocalAppData%\com.bloom.app (совпадает с bundle identifier и папкой WebView2).
pub fn local_appdata_dir() -> Result<PathBuf> {
    let base = dirs_local_app_data().context("LOCALAPPDATA not found")?;
    Ok(base.join("com.bloom.app"))
}

fn dirs_local_app_data() -> Option<PathBuf> {
    // Избегаем внешнего крейта `dirs` — читаем переменную окружения напрямую.
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
}

// ---------------- window.json ----------------
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    #[serde(default)]
    pub left: Option<f64>,
    #[serde(default)]
    pub top: Option<f64>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
    #[serde(default)]
    pub zoom: Option<f64>,
    #[serde(default)]
    pub window_zoom: Option<f64>,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            left: None,
            top: None,
            width: Some(1280.0),
            height: Some(768.0),
            zoom: Some(1.0),
            window_zoom: Some(1.0),
        }
    }
}

pub fn load_window_state() -> Result<WindowState> {
    let path = local_appdata_dir()?.join("window.json");
    if !path.exists() {
        return Ok(WindowState::default());
    }
    let raw = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_window_state(state: &WindowState) -> Result<()> {
    let dir = local_appdata_dir()?;
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("window.json");
    std::fs::write(path, serde_json::to_string_pretty(state)?)?;
    Ok(())
}

// ---------------- appsettings.json ----------------
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub minimize_to_tray: bool,
    #[serde(default)]
    pub autoplay: bool,
    #[serde(default = "default_true")]
    pub discord_rpc: bool,
    #[serde(default = "default_true")]
    pub change_titlebar: bool,
    #[serde(default)]
    pub change_tray_cover: bool,
    #[serde(default)]
    pub lyrics_disk_cache: bool,
    /// Что делать с папкой, которую добавляют в библиотеку:
    /// `"inPlace"` — держать ссылку на исходный путь (по умолчанию),
    /// `"copy"` — скопировать аудиофайлы в профиль и следить уже за копией.
    /// Действует только на новые папки; ранее добавленные не трогаются.
    #[serde(default = "default_import_mode")]
    pub local_import_mode: String,
    // Discord RPC extended settings
    #[serde(default = "default_true")]
    pub discord_show_progress: bool,
    #[serde(default)]
    pub discord_custom_artwork: String,
    #[serde(default = "default_true")]
    pub discord_show_small_img: bool,
    #[serde(default)]
    pub discord_small_img_url: String,
    /// Режим маленькой иконки: "off" | "default" | "custom" | "platform".
    /// Пусто = legacy-конфиг (поведение выводится из url, см. discord_rpc).
    #[serde(default)]
    pub discord_small_img_mode: String,
    #[serde(default)]
    pub discord_btn1_mode: String,
    #[serde(default)]
    pub discord_btn1_label: String,
    #[serde(default)]
    pub discord_btn1_url: String,
    #[serde(default)]
    pub discord_btn2_mode: String,
    #[serde(default)]
    pub discord_btn2_label: String,
    #[serde(default)]
    pub discord_btn2_url: String,
}

fn default_true() -> bool {
    true
}

pub const IMPORT_IN_PLACE: &str = "inPlace";
pub const IMPORT_COPY: &str = "copy";

fn default_import_mode() -> String {
    IMPORT_IN_PLACE.to_string()
}

/// Корень для копий папок в режиме `"copy"`: `%LocalAppData%\com.bloom.app\music`.
pub fn library_root() -> Result<PathBuf> {
    Ok(local_appdata_dir()?.join("music"))
}

/// Корень для копий одиночных треков в режиме `"copy"`. Отдельно от `music`,
/// чтобы копии файлов не выглядели как добавленная пользователем папка.
pub fn tracks_root() -> Result<PathBuf> {
    Ok(local_appdata_dir()?.join("tracks"))
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            minimize_to_tray: false,
            autoplay: false,
            discord_rpc: true,
            change_titlebar: true,
            change_tray_cover: false,
            lyrics_disk_cache: false,
            local_import_mode: default_import_mode(),
            discord_show_progress: true,
            discord_custom_artwork: String::new(),
            discord_show_small_img: true,
            discord_small_img_url: String::new(),
            discord_small_img_mode: "default".to_string(),
            discord_btn1_mode: String::new(),
            discord_btn1_label: String::new(),
            discord_btn1_url: String::new(),
            discord_btn2_mode: String::new(),
            discord_btn2_label: String::new(),
            discord_btn2_url: String::new(),
        }
    }
}

pub fn load_app_settings() -> Result<AppSettings> {
    let path = local_appdata_dir()?.join("appsettings.json");
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_app_settings(s: &AppSettings) -> Result<()> {
    let dir = local_appdata_dir()?;
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join("appsettings.json"), serde_json::to_string_pretty(s)?)?;
    Ok(())
}

// ---------------- yandex.json ----------------
// Токен Яндекс.Музыки хранится отдельно от appsettings.json — это секрет,
// не мешаем его с обычными настройками.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct YandexAuth {
    #[serde(default)]
    pub token: String,
}

pub fn load_yandex() -> Result<YandexAuth> {
    let path = local_appdata_dir()?.join("yandex.json");
    if !path.exists() {
        return Ok(YandexAuth::default());
    }
    let raw = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_yandex(a: &YandexAuth) -> Result<()> {
    let dir = local_appdata_dir()?;
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join("yandex.json"), serde_json::to_string_pretty(a)?)?;
    Ok(())
}

pub fn clear_yandex() -> Result<()> {
    let path = local_appdata_dir()?.join("yandex.json");
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

// ---------------- spotify.json ----------------
// Креденшелы Spotify-приложения (Client Credentials flow). Секрет — отдельным
// файлом, не в appsettings.json. Вводятся пользователем в настройках.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SpotifyCreds {
    #[serde(default, rename = "clientId")]
    pub client_id: String,
    #[serde(default, rename = "clientSecret")]
    pub client_secret: String,
}

pub fn load_spotify() -> Result<SpotifyCreds> {
    let path = local_appdata_dir()?.join("spotify.json");
    if !path.exists() {
        return Ok(SpotifyCreds::default());
    }
    let raw = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_spotify(c: &SpotifyCreds) -> Result<()> {
    let dir = local_appdata_dir()?;
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join("spotify.json"), serde_json::to_string_pretty(c)?)?;
    Ok(())
}

pub fn clear_spotify() -> Result<()> {
    let path = local_appdata_dir()?.join("spotify.json");
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

// ---------------- folders.json / files.json ----------------
fn load_path_list(name: &str) -> Result<Vec<PathBuf>> {
    let path = local_appdata_dir()?.join(name);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&path)?;
    let list: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(list.into_iter().map(PathBuf::from).collect())
}

fn save_path_list(name: &str, items: &[PathBuf]) -> Result<()> {
    let dir = local_appdata_dir()?;
    std::fs::create_dir_all(&dir)?;
    let list: Vec<String> = items.iter().map(|p| p.to_string_lossy().to_string()).collect();
    std::fs::write(dir.join(name), serde_json::to_string_pretty(&list)?)?;
    Ok(())
}

pub fn load_folders() -> Result<Vec<PathBuf>> {
    load_path_list("folders.json")
}

pub fn save_folders(folders: &[PathBuf]) -> Result<()> {
    save_path_list("folders.json", folders)
}

/// Одиночные треки, добавленные плюсиком или перетаскиванием.
/// Хранят путь к файлу — как папки, только поштучно.
pub fn load_files() -> Result<Vec<PathBuf>> {
    load_path_list("files.json")
}

pub fn save_files(files: &[PathBuf]) -> Result<()> {
    save_path_list("files.json", files)
}

// ---------------- offline.json ----------------

/// Корень для офлайн-копий треков площадок (SC/YM/YTM/Spotify), скачанных
/// кнопкой «Скачать офлайн». Отдельно от `music`/`tracks`: это невидимый кеш,
/// а не добавленная пользователем библиотека — в UI такие треки остаются
/// треками своей площадки, просто играют из локальной копии.
pub fn offline_root() -> Result<PathBuf> {
    Ok(local_appdata_dir()?.join("offline"))
}

/// Запись офлайн-кеша: сквозной id трека → путь к скачанному файлу.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineEntry {
    pub id: String,
    pub path: String,
}

pub fn load_offline() -> Result<Vec<OfflineEntry>> {
    let path = local_appdata_dir()?.join("offline.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_offline(list: &[OfflineEntry]) -> Result<()> {
    let dir = local_appdata_dir()?;
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join("offline.json"), serde_json::to_string_pretty(list)?)?;
    Ok(())
}
