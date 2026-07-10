//! Типизированные эмиттеры событий Rust → JS.
//! Названия событий — bloom-* в kebab-case.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    pub found: bool,
    pub plain: Option<String>,
    pub synced: Option<String>,
    pub source: Option<String>,
    pub request_id: Option<String>,
}

pub fn emit_lyrics(app: &AppHandle, payload: LyricsResult) {
    let _ = app.emit("bloom-lyrics", payload);
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalTrackInfo {
    pub id: String,
    pub name: String,
    /// Пусто, если ни в тегах, ни в имени файла артиста нет — фронт подставит
    /// локализованное «Неизвестный».
    pub artist: String,
    pub album: String,
    pub year: String,
    pub publisher: String,
    pub genres: Vec<String>,
    /// «m:ss» либо «h:mm:ss»; пусто, если lofty не смог прочитать properties.
    pub dur: String,
    /// Есть ли встроенная обложка. Сами байты не гоняем через IPC — их по
    /// запросу отдаёт `bloom-file://<path>?cover=1`.
    pub has_cover: bool,
    #[serde(rename = "_localPath")]
    pub local_path: String,
    #[serde(rename = "_folder")]
    pub folder: String,
}

pub fn emit_folder_tracks(app: &AppHandle, tracks: &[LocalTrackInfo]) {
    let _ = app.emit("bloom-folder-tracks", tracks);
}

/// Актуальный список папок после add/remove — сайдбар перерисовывается сам.
pub fn emit_folder_list(app: &AppHandle, folders: &[String]) {
    let _ = app.emit("bloom-folder-list", folders);
}

pub fn emit_folder_removed(app: &AppHandle, folder: &str) {
    let _ = app.emit("bloom-folder-removed", folder);
}

pub fn emit_folder_track_removed(app: &AppHandle, id: &str) {
    let _ = app.emit("bloom-folder-track-removed", id);
}

pub fn emit_window_focus(app: &AppHandle, focused: bool) {
    let _ = app.emit("bloom-window-focus", focused);
}

pub fn emit_window_minimized(app: &AppHandle, minimized: bool) {
    let _ = app.emit("bloom-window-minimized", minimized);
}
