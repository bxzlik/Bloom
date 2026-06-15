//! Сканирование и отслеживание папок с локальной музыкой.
//! Список путей в folders.json, рекурсивный скан через walkdir, real-time watch через notify,
//! метаданные через lofty, стабильный id = "lf" + md5(lower(path)).

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use anyhow::{Context, Result};
use lofty::file::TaggedFileExt;
use lofty::tag::{Accessor, ItemKey};
use md5::{Digest, Md5};
use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use once_cell::sync::Lazy;
use tauri::AppHandle;
use walkdir::WalkDir;

use crate::config;
use crate::events::{self, LocalTrackInfo};

const AUDIO_EXTS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "aac", "m4a", "opus", "wma", "aiff", "aif", "webm", "wv", "ape",
    "tta", "alac", "dsf", "dff",
];

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTS.iter().any(|x| x.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

struct WatcherEntry {
    folder: PathBuf,
    _watcher: RecommendedWatcher,
}

static WATCHERS: Lazy<Mutex<Vec<WatcherEntry>>> = Lazy::new(|| Mutex::new(Vec::new()));

/// Старт при запуске приложения: загрузить folders.json, навесить watchers и отправить треки.
pub fn start_all(app: &AppHandle) {
    let folders = match config::load_folders() {
        Ok(f) => f,
        Err(e) => {
            tracing::error!("folder_watcher: load_folders failed: {e}");
            return;
        }
    };
    for folder in folders {
        if !folder.is_dir() {
            tracing::warn!("folder_watcher: folder not found, skipping: {}", folder.display());
            continue;
        }
        start_watcher(app, &folder);
        spawn_scan(app.clone(), folder);
    }
}

pub fn add_folder(app: &AppHandle, path: PathBuf) -> Result<()> {
    if !path.is_dir() {
        anyhow::bail!("not a directory: {}", path.display());
    }
    let mut folders = config::load_folders().unwrap_or_default();
    let already = folders
        .iter()
        .any(|f| f.to_string_lossy().eq_ignore_ascii_case(&path.to_string_lossy()));
    if already {
        return Ok(());
    }
    folders.push(path.clone());
    config::save_folders(&folders)?;
    tracing::info!("folder_watcher: added {}", path.display());
    start_watcher(app, &path);
    spawn_scan(app.clone(), path);
    Ok(())
}

pub fn remove_folder(app: &AppHandle, path: &Path) -> Result<()> {
    let mut folders = config::load_folders().unwrap_or_default();
    let before = folders.len();
    folders.retain(|f| !f.to_string_lossy().eq_ignore_ascii_case(&path.to_string_lossy()));
    if folders.len() == before {
        return Ok(());
    }
    config::save_folders(&folders)?;
    tracing::info!("folder_watcher: removed {}", path.display());

    let mut guard = WATCHERS.lock().unwrap();
    guard.retain(|w| {
        !w.folder
            .to_string_lossy()
            .eq_ignore_ascii_case(&path.to_string_lossy())
    });

    events::emit_folder_removed(app, &path.to_string_lossy());
    Ok(())
}

pub fn scan_folder(app: &AppHandle, folder: PathBuf) {
    spawn_scan(app.clone(), folder);
}

fn spawn_scan(app: AppHandle, folder: PathBuf) {
    std::thread::spawn(move || {
        if let Err(e) = do_scan(&app, &folder) {
            tracing::error!("folder_watcher: scan {} failed: {e}", folder.display());
        }
    });
}

fn do_scan(app: &AppHandle, folder: &Path) -> Result<()> {
    let mut tracks: Vec<LocalTrackInfo> = Vec::new();
    for entry in WalkDir::new(folder).follow_links(false).into_iter().filter_map(Result::ok) {
        let p = entry.path();
        if p.is_file() && is_audio(p) {
            tracks.push(make_track(p, folder));
        }
    }
    tracing::info!("folder_watcher: scanned {} — {} tracks", folder.display(), tracks.len());
    if !tracks.is_empty() {
        events::emit_folder_tracks(app, &tracks);
    }
    Ok(())
}

fn make_track(file_path: &Path, folder: &Path) -> LocalTrackInfo {
    let raw = file_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let (artist, name) = match raw.find(" - ") {
        Some(sep) => (raw[..sep].trim().to_string(), raw[sep + 3..].trim().to_string()),
        None => ("Неизвестный".to_string(), raw.clone()),
    };

    let id = make_stable_id(file_path);

    let mut album = String::new();
    let mut year = String::new();
    let mut publisher = String::new();
    let mut genres: Vec<String> = Vec::new();

    if let Ok(tagged) = lofty::read_from_path(file_path) {
        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            if let Some(a) = tag.album() {
                album = a.into_owned();
            }
            if let Some(y) = tag.year() {
                year = y.to_string();
            }
            if let Some(g) = tag.genre() {
                genres = g
                    .split([';', '\0'])
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
            if let Some(p) = tag.get_string(&ItemKey::Publisher) {
                publisher = p.to_string();
            }
        }
    }

    LocalTrackInfo {
        id,
        name,
        artist,
        album,
        year,
        publisher,
        genres,
        local_path: file_path.to_string_lossy().to_string(),
        folder: folder.to_string_lossy().to_string(),
    }
}

fn make_stable_id(path: &Path) -> String {
    let lower = path.to_string_lossy().to_lowercase();
    let mut hasher = Md5::new();
    hasher.update(lower.as_bytes());
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(2 + digest.len() * 2);
    hex.push_str("lf");
    for b in digest {
        hex.push_str(&format!("{b:02x}"));
    }
    hex
}

fn start_watcher(app: &AppHandle, folder: &Path) {
    let mut guard = WATCHERS.lock().unwrap();
    if guard
        .iter()
        .any(|w| w.folder.to_string_lossy().eq_ignore_ascii_case(&folder.to_string_lossy()))
    {
        return;
    }

    let app_clone = app.clone();
    let folder_owned = folder.to_path_buf();
    let folder_for_cb = folder_owned.clone();

    let mut watcher = match notify::recommended_watcher(
        move |res: notify::Result<notify::Event>| match res {
            Ok(ev) => handle_event(&app_clone, &folder_for_cb, ev),
            Err(e) => tracing::warn!("fsw error: {e}"),
        },
    ) {
        Ok(w) => w,
        Err(e) => {
            tracing::error!("folder_watcher: create watcher failed: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(folder, RecursiveMode::Recursive) {
        tracing::error!("folder_watcher: watch {} failed: {e}", folder.display());
        return;
    }

    guard.push(WatcherEntry {
        folder: folder_owned,
        _watcher: watcher,
    });
    tracing::info!("folder_watcher: watching {}", folder.display());
}

fn handle_event(app: &AppHandle, folder: &Path, ev: notify::Event) {
    match ev.kind {
        EventKind::Create(CreateKind::File) | EventKind::Create(CreateKind::Any) => {
            for p in ev.paths {
                if is_audio(&p) {
                    // Файл может быть ещё не полностью записан — небольшая пауза.
                    std::thread::sleep(Duration::from_millis(200));
                    if p.is_file() {
                        tracing::info!("fsw Created: {}", p.display());
                        let track = make_track(&p, folder);
                        events::emit_folder_tracks(app, &[track]);
                    }
                }
            }
        }
        EventKind::Remove(RemoveKind::File) | EventKind::Remove(RemoveKind::Any) => {
            for p in ev.paths {
                if is_audio(&p) {
                    tracing::info!("fsw Deleted: {}", p.display());
                    let id = make_stable_id(&p);
                    events::emit_folder_track_removed(app, &id);
                }
            }
        }
        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
            // notify отдаёт старый и новый путь в ev.paths именно в таком порядке.
            if ev.paths.len() == 2 {
                let old_p = &ev.paths[0];
                let new_p = &ev.paths[1];
                if is_audio(old_p) {
                    let id = make_stable_id(old_p);
                    events::emit_folder_track_removed(app, &id);
                }
                if is_audio(new_p) && new_p.is_file() {
                    let track = make_track(new_p, folder);
                    events::emit_folder_tracks(app, &[track]);
                }
            }
        }
        _ => {}
    }
}

pub fn get_folders() -> Result<Vec<String>> {
    let folders = config::load_folders().context("load folders")?;
    Ok(folders.into_iter().map(|p| p.to_string_lossy().to_string()).collect())
}

/// Проверяет, лежит ли путь внутри одной из добавленных пользователем папок.
/// Безопасность: local_download запрещает скачивать что-либо за пределами
/// библиотеки пользователя.
pub fn is_path_allowed(path: &Path) -> bool {
    let Ok(canonical) = path.canonicalize() else { return false };
    let Ok(folders) = config::load_folders() else { return false };
    folders.iter().any(|root| {
        root.canonicalize()
            .map(|r| canonical.starts_with(&r))
            .unwrap_or(false)
    })
}
