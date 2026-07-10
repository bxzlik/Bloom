//! Сканирование и отслеживание папок с локальной музыкой.
//! Список путей в folders.json, рекурсивный скан через walkdir, real-time watch через notify,
//! метаданные через lofty, стабильный id = "lf" + md5(lower(path)).
//!
//! Первичная загрузка библиотеки приходит ОТВЕТОМ команды `folder_scan_all`,
//! а не событием: скан стартовал из `setup()` и его `emit` успевал улететь
//! раньше, чем React смонтирует слушателя, — треки молча терялись.
//! Событиями (`bloom-folder-tracks`, `bloom-folder-track-removed`) ходят только
//! живые изменения ФС, когда фронт заведомо уже подписан.
//!
//! Колбэк notify ничего не разбирает сам — он лишь кладёт путь в очередь.
//! Всю работу делает воркер: дебаунсит события и ждёт, пока файл допишется
//! (размер перестанет расти). Иначе копирование сотни файлов блокировало бы
//! поток notify, переполняя буфер ReadDirectoryChangesW, а lofty читал бы
//! наполовину записанные файлы.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use lofty::config::{ParseOptions, ParsingMode};
use lofty::file::{AudioFile, TaggedFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use md5::{Digest, Md5};
use notify::event::{ModifyKind, RenameMode};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use once_cell::sync::{Lazy, OnceCell};
use parking_lot::RwLock;
use serde::Serialize;
use tauri::AppHandle;
use walkdir::WalkDir;

use crate::config;
use crate::events::{self, LocalTrackInfo};

const AUDIO_EXTS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "aac", "m4a", "opus", "wma", "aiff", "aif", "webm", "wv", "ape",
    "tta", "alac", "dsf", "dff",
];

/// Пауза после последнего события по файлу, прежде чем читать теги.
const DEBOUNCE: Duration = Duration::from_millis(400);
/// Потолок ожидания «файл дописался»: копирование гигабайтного архива не должно
/// держать запись в очереди вечно.
const SETTLE_TIMEOUT: Duration = Duration::from_secs(180);
/// Треков в одном событии. Один `emit` на 10k треков — гигантский JSON.
const EMIT_CHUNK: usize = 200;

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTS.iter().any(|x| x.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

/// Результат скана. Отдаётся ответом команды, а не событием.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    /// Папки, которые реально удалось прочитать. Недоступные (отключённый диск,
    /// вынутая флешка) сюда НЕ попадают: иначе фронт счёл бы их треки удалёнными
    /// и вычистил бы ссылки на них из плейлистов.
    pub folders: Vec<String>,
    pub tracks: Vec<LocalTrackInfo>,
}

// ============================ Разрешённые корни ============================

/// Канонические корни из folders.json и отдельные файлы из files.json.
/// Кеш, а не чтение с диска на каждый вызов: `bloom-file` дёргает
/// `is_path_allowed` на КАЖДЫЙ range-чанк аудио.
static ROOTS: Lazy<RwLock<Vec<PathBuf>>> = Lazy::new(|| RwLock::new(Vec::new()));
static FILES: Lazy<RwLock<Vec<PathBuf>>> = Lazy::new(|| RwLock::new(Vec::new()));
/// Те же файлы, но как записаны в files.json. Удалённый файл канонизировать уже
/// нельзя, а сопоставлять пути в событиях ФС надо и для него.
static FILES_RAW: Lazy<RwLock<Vec<PathBuf>>> = Lazy::new(|| RwLock::new(Vec::new()));

fn canonical_list(list: &[PathBuf]) -> Vec<PathBuf> {
    list.iter().filter_map(|p| p.canonicalize().ok()).collect()
}

/// Пересобрать кеш разрешённых путей. Публичная: офлайн-кеш (commands.rs) зовёт
/// её после скачивания/удаления, чтобы `bloom-file` сразу пускал новую копию.
pub fn refresh_allowlist() {
    let mut roots = canonical_list(&config::load_folders().unwrap_or_default());
    // Офлайн-корень — тоже разрешённый корень: под ним лежат скачанные копии
    // треков площадок, которые играются через тот же `bloom-file`. Каталог мог
    // ещё не существовать (ни одной офлайн-загрузки) — тогда просто пропускаем.
    if let Some(off) = config::offline_root().ok().and_then(|r| r.canonicalize().ok()) {
        roots.push(off);
    }
    *ROOTS.write() = roots;
    let files = config::load_files().unwrap_or_default();
    *FILES.write() = canonical_list(&files);
    *FILES_RAW.write() = files;
}

/// Одиночный трек, добавленный плюсиком/перетаскиванием?
fn is_tracked_file(path: &Path) -> bool {
    FILES_RAW.read().iter().any(|f| same_path(f, path))
}

/// Разрешён ли путь к воспроизведению: он либо внутри добавленной папки, либо
/// это одиночный трек, добавленный плюсиком/перетаскиванием.
///
/// Сравнение покомпонентное и по каноническим путям. Строковый префикс пускал бы
/// и `C:\Music_backup\…` при разрешённой `C:\Music`, и `C:\Music\..\..\secret`.
pub fn is_path_allowed(path: &Path) -> bool {
    let Ok(canonical) = path.canonicalize() else {
        return false;
    };
    ROOTS.read().iter().any(|root| canonical.starts_with(root))
        || FILES.read().iter().any(|f| *f == canonical)
}

// ================================ Watchers ================================

/// Что именно сторожит watcher.
#[derive(Clone)]
enum WatchScope {
    /// Папка библиотеки: рекурсивно, любой аудиофайл под ней — её трек.
    Folder(PathBuf),
    /// Каталог, где лежат одиночные добавленные треки. Реагируем только на пути
    /// из files.json — остальные файлы этого каталога нас не касаются.
    Files,
}

struct WatcherEntry {
    /// Каталог, за которым следим (для `Folder` — сама папка библиотеки).
    path: PathBuf,
    scope: WatchScope,
    _watcher: RecommendedWatcher,
}

static WATCHERS: Lazy<Mutex<Vec<WatcherEntry>>> = Lazy::new(|| Mutex::new(Vec::new()));

fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy())
}

/// Старт при запуске приложения: поднять воркер и навесить watchers.
/// Скан НЕ запускаем — за треками фронт придёт сам через `folder_scan_all`
/// и `file_scan_all`.
pub fn start_all(app: &AppHandle) {
    refresh_allowlist();
    init_worker(app);

    match config::load_folders() {
        Ok(folders) => {
            for folder in folders {
                if !folder.is_dir() {
                    tracing::warn!("folder_watcher: folder not found, skipping: {}", folder.display());
                    continue;
                }
                start_watcher(&folder, WatchScope::Folder(folder.clone()), RecursiveMode::Recursive);
            }
        }
        Err(e) => tracing::error!("folder_watcher: load_folders failed: {e}"),
    }
    start_file_watchers();
}

/// По одному нерекурсивному watcher'у на каталог, где лежат одиночные треки.
/// Каталоги, уже накрытые папкой библиотеки, пропускаем — иначе на каждое
/// событие приходило бы по два.
fn start_file_watchers() {
    let files = FILES_RAW.read().clone();
    let mut seen: Vec<PathBuf> = Vec::new();
    for file in files {
        let Some(dir) = file.parent().map(Path::to_path_buf) else { continue };
        if !dir.is_dir() || seen.iter().any(|d| same_path(d, &dir)) {
            continue;
        }
        seen.push(dir.clone());
        if ROOTS.read().iter().any(|root| dir.canonicalize().map(|d| d.starts_with(root)).unwrap_or(false)) {
            continue;
        }
        start_watcher(&dir, WatchScope::Files, RecursiveMode::NonRecursive);
    }
}

/// Свободное имя внутри `root`: `Музыка`, `Музыка (2)`, `Музыка (3)`…
fn unique_dir(root: &Path, name: &str) -> PathBuf {
    let mut candidate = root.join(name);
    let mut n = 2;
    while candidate.exists() {
        candidate = root.join(format!("{name} ({n})"));
        n += 1;
    }
    candidate
}

/// Копирует аудиофайлы из `src` в `dest`, сохраняя относительную структуру.
/// Возвращает число скопированных файлов. Не-аудио пропускается: в музыкальных
/// папках хватает картинок, cue и прочего, что библиотеке не нужно.
fn copy_audio_tree(src: &Path, dest: &Path) -> Result<usize> {
    let mut copied = 0usize;
    for entry in WalkDir::new(src).follow_links(false).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() || !is_audio(entry.path()) {
            continue;
        }
        let rel = entry.path().strip_prefix(src).unwrap_or(entry.path());
        let target = dest.join(rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(entry.path(), &target)
            .with_context(|| format!("copy {}", entry.path().display()))?;
        copied += 1;
    }
    Ok(copied)
}

/// Копирует папку в профиль. Оригиналы не трогаются.
/// Возвращает путь копии — следим уже за ней.
fn copy_into_library(src: &Path) -> Result<PathBuf> {
    let root = config::library_root()?;
    std::fs::create_dir_all(&root)?;

    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "music".to_string());
    let dest = unique_dir(&root, &name);

    let copied = copy_audio_tree(src, &dest)?;
    if copied == 0 {
        // Пустую директорию не оставляем — иначе следующее добавление той же
        // папки уйдёт в «Музыка (2)».
        let _ = std::fs::remove_dir_all(&dest);
        anyhow::bail!("no audio files in {}", src.display());
    }
    tracing::info!("folder_watcher: copied {copied} files → {}", dest.display());
    Ok(dest)
}

/// Лежит ли папка ВНУТРИ библиотеки Bloom, то есть является ли она нашей копией.
/// Сам корень библиотеки — не копия, его удалять нельзя.
pub fn is_copied_folder(path: &Path) -> bool {
    let Ok(root) = config::library_root().and_then(|r| Ok(r.canonicalize()?)) else {
        return false;
    };
    let Ok(canonical) = path.canonicalize() else {
        return false;
    };
    canonical != root && canonical.starts_with(&root)
}

/// `copy` — скопировать аудио в профиль и следить за копией (настройка
/// `local_import_mode`). Иначе следим за исходным путём.
pub fn add_folder(app: &AppHandle, path: PathBuf, copy: bool) -> Result<()> {
    if !path.is_dir() {
        anyhow::bail!("not a directory: {}", path.display());
    }

    // Папку, которая уже лежит внутри нашей библиотеки, копировать в неё же
    // бессмысленно — добавляем как есть.
    let path = if copy && !is_copied_folder(&path) { copy_into_library(&path)? } else { path };

    let mut folders = config::load_folders().unwrap_or_default();
    if folders.iter().any(|f| same_path(f, &path)) {
        return Ok(());
    }
    folders.push(path.clone());
    config::save_folders(&folders)?;
    refresh_allowlist();
    tracing::info!("folder_watcher: added {}", path.display());

    emit_folder_list(app, &folders);
    start_watcher(&path, WatchScope::Folder(path.clone()), RecursiveMode::Recursive);

    // Тут событие безопасно: приложение уже работает, слушатель подписан.
    let app = app.clone();
    std::thread::spawn(move || {
        let tracks = collect_tracks(&path);
        for chunk in tracks.chunks(EMIT_CHUNK) {
            events::emit_folder_tracks(&app, chunk);
        }
    });
    Ok(())
}

/// Отвязывает папку от библиотеки. Если это НАША копия (режим «В Bloom»), файлы
/// с диска удаляются: иначе профиль копил бы их вечно, и удалить их из
/// интерфейса было бы нечем. Пользовательские папки не трогаем никогда.
pub fn remove_folder(app: &AppHandle, path: &Path) -> Result<()> {
    let mut folders = config::load_folders().unwrap_or_default();
    let before = folders.len();
    folders.retain(|f| !same_path(f, path));
    if folders.len() == before {
        return Ok(());
    }
    // Watcher снимаем ДО удаления файлов, иначе получим шквал событий
    // «файл удалён» на треки, которых и так больше нет в библиотеке.
    WATCHERS
        .lock()
        .unwrap()
        .retain(|w| !(matches!(w.scope, WatchScope::Folder(_)) && same_path(&w.path, path)));

    config::save_folders(&folders)?;
    refresh_allowlist();
    tracing::info!("folder_watcher: removed {}", path.display());

    if is_copied_folder(path) {
        match std::fs::remove_dir_all(path) {
            Ok(()) => tracing::info!("folder_watcher: deleted copy {}", path.display()),
            Err(e) => tracing::warn!("folder_watcher: delete copy {} failed: {e}", path.display()),
        }
    }

    emit_folder_list(app, &folders);
    events::emit_folder_removed(app, &path.to_string_lossy());
    Ok(())
}

fn emit_folder_list(app: &AppHandle, folders: &[PathBuf]) {
    let list: Vec<String> = folders.iter().map(|p| p.to_string_lossy().to_string()).collect();
    events::emit_folder_list(app, &list);
}

// ============================ Одиночные треки ============================
//
// Всё как у папок, только поштучно: files.json хранит пути, метаданные читает
// тот же lofty, стрим отдаёт тот же bloom-file. В режиме «В Bloom» файл
// копируется в `tracks/`, и путь запоминается уже к копии.

/// Свободное имя файла: `Song.mp3`, `Song (2).mp3`, `Song (3).mp3`…
fn unique_file(root: &Path, name: &str) -> PathBuf {
    let mut candidate = root.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let as_path = Path::new(name);
    let stem = as_path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = as_path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let mut n = 2;
    while candidate.exists() {
        candidate = root.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    candidate
}

fn copy_into_tracks(src: &Path) -> Result<PathBuf> {
    let root = config::tracks_root()?;
    std::fs::create_dir_all(&root)?;
    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| anyhow::anyhow!("bad file name: {}", src.display()))?;
    let dest = unique_file(&root, &name);
    std::fs::copy(src, &dest).with_context(|| format!("copy {}", src.display()))?;
    tracing::info!("folder_watcher: copied track → {}", dest.display());
    Ok(dest)
}

/// Файл — наша копия внутри профиля (режим «В Bloom»)?
pub fn is_copied_file(path: &Path) -> bool {
    let Ok(root) = config::tracks_root().and_then(|r| Ok(r.canonicalize()?)) else {
        return false;
    };
    let Ok(canonical) = path.canonicalize() else {
        return false;
    };
    canonical.starts_with(&root)
}

/// В режиме «В Bloom» исходный путь не сохраняется, поэтому повторное добавление
/// того же файла ловим по имени и размеру среди уже скопированных.
fn already_copied(files: &[PathBuf], src: &Path) -> bool {
    let (Some(name), Ok(len)) = (src.file_name(), std::fs::metadata(src).map(|m| m.len())) else {
        return false;
    };
    files.iter().any(|f| {
        f.file_name() == Some(name)
            && std::fs::metadata(f).map(|m| m.len() == len).unwrap_or(false)
    })
}

/// Добавляет одиночные треки. `copy` — скопировать в профиль (`local_import_mode`).
/// Не-аудио и дубликаты молча пропускаются. Возвращает только реально добавленные.
pub fn add_files(paths: Vec<PathBuf>, copy: bool) -> Result<Vec<LocalTrackInfo>> {
    let mut files = config::load_files().unwrap_or_default();
    let mut added: Vec<PathBuf> = Vec::new();

    for src in paths {
        if !src.is_file() || !is_audio(&src) {
            continue;
        }
        let duplicate = if copy {
            already_copied(&files, &src)
        } else {
            files.iter().any(|f| same_path(f, &src))
        };
        if duplicate {
            continue;
        }
        let path = if copy && !is_copied_file(&src) { copy_into_tracks(&src)? } else { src };
        files.push(path.clone());
        added.push(path);
    }

    if added.is_empty() {
        return Ok(Vec::new());
    }
    config::save_files(&files)?;
    refresh_allowlist();
    // Файл мог лечь в каталог, за которым мы ещё не следим.
    start_file_watchers();

    tracing::info!("folder_watcher: added {} track(s)", added.len());
    Ok(added.iter().map(|p| make_track(p, Path::new(""))).collect())
}

/// Убирает путь из files.json, ничего не удаляя с диска.
fn forget_file(path: &Path) {
    let mut files = config::load_files().unwrap_or_default();
    let before = files.len();
    files.retain(|f| !same_path(f, path));
    if files.len() == before {
        return;
    }
    if let Err(e) = config::save_files(&files) {
        tracing::warn!("folder_watcher: save files.json failed: {e}");
        return;
    }
    refresh_allowlist();
}

/// Убрать трек из библиотеки. Копию из профиля стираем с диска, файл
/// пользователя не трогаем — ровно как с папками.
pub fn remove_file(path: &Path) -> Result<()> {
    if !is_tracked_file(path) {
        return Ok(());
    }
    let copied = is_copied_file(path);
    forget_file(path);

    if copied {
        match std::fs::remove_file(path) {
            Ok(()) => tracing::info!("folder_watcher: deleted copy {}", path.display()),
            Err(e) => tracing::warn!("folder_watcher: delete copy {} failed: {e}", path.display()),
        }
    }
    Ok(())
}

/// Первичная загрузка одиночных треков. Блокирующая — звать из `spawn_blocking`.
///
/// Пропавшие файлы просто не попадают в ответ, но из files.json НЕ вычищаются:
/// путь на отключённой флешке — это не удалённый трек.
pub fn scan_files() -> Vec<LocalTrackInfo> {
    let files = config::load_files().unwrap_or_default();
    let tracks: Vec<LocalTrackInfo> = files
        .iter()
        .filter(|p| p.is_file())
        .map(|p| make_track(p, Path::new("")))
        .collect();
    tracing::info!("folder_watcher: {} single track(s) of {}", tracks.len(), files.len());
    tracks
}

fn start_watcher(dir: &Path, scope: WatchScope, mode: RecursiveMode) {
    let mut guard = WATCHERS.lock().unwrap();
    if guard.iter().any(|w| same_path(&w.path, dir)) {
        return;
    }

    let scope_for_cb = scope.clone();
    let mut watcher = match notify::recommended_watcher(
        move |res: notify::Result<notify::Event>| match res {
            Ok(ev) => handle_event(&scope_for_cb, ev),
            Err(e) => tracing::warn!("fsw error: {e}"),
        },
    ) {
        Ok(w) => w,
        Err(e) => {
            tracing::error!("folder_watcher: create watcher failed: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(dir, mode) {
        tracing::error!("folder_watcher: watch {} failed: {e}", dir.display());
        return;
    }

    guard.push(WatcherEntry {
        path: dir.to_path_buf(),
        scope,
        _watcher: watcher,
    });
    tracing::info!("folder_watcher: watching {}", dir.display());
}

/// Только раскладывает событие по очереди — никакого I/O и никаких пауз:
/// этот колбэк крутится на потоке notify, и всё, что он делает, задерживает
/// доставку следующих событий.
fn handle_event(scope: &WatchScope, ev: notify::Event) {
    let Some(tx) = QUEUE.get() else { return };

    // Папка библиотеки отвечает за любое аудио под собой. Каталог с одиночными
    // треками — только за те файлы, что перечислены в files.json.
    let mine = |p: &Path| {
        is_audio(p)
            && match scope {
                WatchScope::Folder(_) => true,
                WatchScope::Files => is_tracked_file(p),
            }
    };
    let owner = || match scope {
        WatchScope::Folder(f) => f.clone(),
        // Одиночный трек не принадлежит ни одной папке.
        WatchScope::Files => PathBuf::new(),
    };
    let upsert = |p: PathBuf| FsMsg::Upsert { path: p, folder: owner() };

    match ev.kind {
        EventKind::Create(_) => {
            for p in ev.paths.into_iter().filter(|p| mine(p)) {
                let _ = tx.send(upsert(p));
            }
        }
        EventKind::Remove(_) => {
            for p in ev.paths.into_iter().filter(|p| mine(p)) {
                let _ = tx.send(FsMsg::Remove { path: p });
            }
        }
        EventKind::Modify(ModifyKind::Name(mode)) => match mode {
            // notify отдаёт старый и новый путь в ev.paths именно в таком порядке.
            RenameMode::Both if ev.paths.len() == 2 => {
                let (old_p, new_p) = (ev.paths[0].clone(), ev.paths[1].clone());
                if mine(&old_p) {
                    let _ = tx.send(FsMsg::Remove { path: old_p });
                }
                if mine(&new_p) {
                    let _ = tx.send(upsert(new_p));
                }
            }
            RenameMode::From => {
                for p in ev.paths.into_iter().filter(|p| mine(p)) {
                    let _ = tx.send(FsMsg::Remove { path: p });
                }
            }
            RenameMode::To => {
                for p in ev.paths.into_iter().filter(|p| mine(p)) {
                    let _ = tx.send(upsert(p));
                }
            }
            // Backend не сказал, какая половина переименования пришла — решаем
            // по факту существования файла (воркер всё равно перепроверит).
            _ => {
                for p in ev.paths.into_iter().filter(|p| mine(p)) {
                    let _ = if p.is_file() {
                        tx.send(upsert(p))
                    } else {
                        tx.send(FsMsg::Remove { path: p })
                    };
                }
            }
        },
        // Правка тегов сторонним редактором — перечитать метаданные.
        EventKind::Modify(_) => {
            for p in ev.paths.into_iter().filter(|p| mine(p)) {
                let _ = tx.send(upsert(p));
            }
        }
        _ => {}
    }
}

// ================================= Воркер =================================

enum FsMsg {
    Upsert { path: PathBuf, folder: PathBuf },
    Remove { path: PathBuf },
}

static QUEUE: OnceCell<Sender<FsMsg>> = OnceCell::new();

struct Pending {
    folder: PathBuf,
    remove: bool,
    /// Когда запись можно обрабатывать (сдвигается каждым новым событием).
    due: Instant,
    /// Жёсткий потолок ожидания — ставится один раз, при первом событии.
    deadline: Instant,
    /// Размер на прошлой проверке; растёт — файл ещё копируется.
    last_size: Option<u64>,
}

fn init_worker(app: &AppHandle) {
    let (tx, rx) = mpsc::channel::<FsMsg>();
    if QUEUE.set(tx).is_err() {
        return; // уже запущен
    }
    let app = app.clone();
    std::thread::spawn(move || worker_loop(app, rx));
}

fn worker_loop(app: AppHandle, rx: Receiver<FsMsg>) {
    let mut pending: HashMap<PathBuf, Pending> = HashMap::new();
    loop {
        // Пусто — спим до первого события. Есть отложенное — просыпаемся дожать.
        let wait = if pending.is_empty() {
            Duration::from_secs(3600)
        } else {
            Duration::from_millis(100)
        };
        match rx.recv_timeout(wait) {
            Ok(msg) => {
                enqueue(&mut pending, msg);
                // Забираем всё, что уже накопилось, одним махом.
                while let Ok(m) = rx.try_recv() {
                    enqueue(&mut pending, m);
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        flush(&app, &mut pending);
    }
}

fn enqueue(pending: &mut HashMap<PathBuf, Pending>, msg: FsMsg) {
    let now = Instant::now();
    let (path, folder, remove) = match msg {
        FsMsg::Upsert { path, folder } => (path, folder, false),
        FsMsg::Remove { path } => (path, PathBuf::new(), true),
    };
    let entry = pending.entry(path).or_insert(Pending {
        folder: folder.clone(),
        remove,
        due: now,
        deadline: now + SETTLE_TIMEOUT,
        last_size: None,
    });
    entry.remove = remove;
    if !remove {
        entry.folder = folder;
    }
    entry.due = now + DEBOUNCE;
    // deadline намеренно не двигаем: иначе непрерывно растущий файл никогда бы
    // не дождался обработки.
}

fn flush(app: &AppHandle, pending: &mut HashMap<PathBuf, Pending>) {
    let now = Instant::now();
    let ready: Vec<PathBuf> = pending
        .iter()
        .filter(|(_, p)| now >= p.due)
        .map(|(path, _)| path.clone())
        .collect();
    if ready.is_empty() {
        return;
    }

    let mut upserts: Vec<LocalTrackInfo> = Vec::new();
    let mut removed: Vec<String> = Vec::new();

    for path in ready {
        let Some(p) = pending.get_mut(&path) else { continue };

        if p.remove || !path.is_file() {
            // Одиночный трек исчез с диска — забываем и сам путь, иначе он
            // остался бы висеть в files.json навсегда.
            if is_tracked_file(&path) {
                forget_file(&path);
            }
            removed.push(make_stable_id(&path));
            pending.remove(&path);
            continue;
        }

        // Файл ещё может дописываться — читаем теги, только когда размер замер.
        let size = std::fs::metadata(&path).map(|m| m.len()).ok();
        if now < p.deadline && (size.is_none() || p.last_size != size) {
            p.last_size = size;
            p.due = now + DEBOUNCE;
            continue;
        }

        let folder = p.folder.clone();
        pending.remove(&path);
        upserts.push(make_track(&path, &folder));
    }

    for id in &removed {
        events::emit_folder_track_removed(app, id);
    }
    for chunk in upserts.chunks(EMIT_CHUNK) {
        events::emit_folder_tracks(app, chunk);
    }
}

// ============================== Скан и метаданные ==============================

/// Синхронный рекурсивный обход. Вызывающий решает, отдать треки ответом команды
/// или разослать событием.
fn collect_tracks(folder: &Path) -> Vec<LocalTrackInfo> {
    let mut tracks = Vec::new();
    for entry in WalkDir::new(folder).follow_links(false).into_iter().filter_map(Result::ok) {
        if entry.file_type().is_file() && is_audio(entry.path()) {
            tracks.push(make_track(entry.path(), folder));
        }
    }
    tracing::info!("folder_watcher: scanned {} — {} tracks", folder.display(), tracks.len());
    tracks
}

/// Скан одной папки. Блокирующий — вызывать из `spawn_blocking`.
pub fn scan_one(folder: &Path) -> ScanResult {
    if !folder.is_dir() {
        tracing::warn!("folder_watcher: scan skipped, not a dir: {}", folder.display());
        return ScanResult { folders: Vec::new(), tracks: Vec::new() };
    }
    ScanResult {
        folders: vec![folder.to_string_lossy().to_string()],
        tracks: collect_tracks(folder),
    }
}

/// Скан всех папок из folders.json. Блокирующий — вызывать из `spawn_blocking`.
pub fn scan_all() -> ScanResult {
    let mut result = ScanResult { folders: Vec::new(), tracks: Vec::new() };
    for folder in config::load_folders().unwrap_or_default() {
        let mut one = scan_one(&folder);
        result.folders.append(&mut one.folders);
        result.tracks.append(&mut one.tracks);
    }
    result
}

#[derive(Default)]
struct Meta {
    title: Option<String>,
    artist: Option<String>,
    album: String,
    year: String,
    publisher: String,
    genres: Vec<String>,
    dur: String,
    has_cover: bool,
}

/// Обрезает пробелы и схлопывает пустую строку в `None` — теги сплошь и рядом
/// содержат `"   "` вместо отсутствия значения.
fn norm(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

fn fmt_dur(d: Duration) -> String {
    let total = d.as_secs();
    if total == 0 {
        return String::new();
    }
    let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

/// Читает файл через lofty, не сдаваясь на первом же битом фрейме.
///
/// Relaxed выбрасывает испорченные поля вместо ошибки, но обрезанный ID3-тег
/// (частая беда файлов из онлайн-тэггеров) роняет lofty в любом режиме: он не
/// может «промотать» фрейм, чья заявленная длина уходит за конец тега.
/// Тогда зовущая сторона уходит в `meta_from_id3` / `read_id3_fallback`.
pub fn read_tagged(file_path: &Path) -> Option<TaggedFile> {
    if let Ok(f) = lofty::read_from_path(file_path) {
        return Some(f);
    }
    let probe = Probe::open(file_path)
        .ok()?
        .options(ParseOptions::new().parsing_mode(ParsingMode::Relaxed));
    match probe.read() {
        Ok(f) => Some(f),
        Err(e) => {
            tracing::debug!("folder_watcher: lofty gave up on {}: {e}", file_path.display());
            None
        }
    }
}

/// Резервное чтение ID3 для файлов, которые lofty не осилил.
///
/// Крейт `id3` терпимее к обрезанным фреймам и вдобавок отдаёт всё, что успел
/// разобрать до ошибки, через `partial_tag`. Для не-ID3 форматов (flac, ogg)
/// вернёт `None` — там справляется lofty.
pub fn read_id3_fallback(path: &Path) -> Option<id3::Tag> {
    match id3::Tag::read_from_path(path) {
        Ok(tag) => Some(tag),
        Err(e) => e.partial_tag,
    }
}

/// Длительность считается по аудиофреймам и от битых тегов не зависит — просим
/// lofty не трогать теги вовсе.
fn read_duration_only(path: &Path) -> String {
    Probe::open(path)
        .and_then(|p| p.options(ParseOptions::new().read_tags(false)).read())
        .map(|f| fmt_dur(f.properties().duration()))
        .unwrap_or_default()
}

fn meta_from_id3(file_path: &Path) -> Meta {
    use id3::TagLike;

    let mut m = Meta { dur: read_duration_only(file_path), ..Meta::default() };
    let Some(tag) = read_id3_fallback(file_path) else {
        tracing::warn!("folder_watcher: no readable tags in {}", file_path.display());
        return m;
    };
    m.title = tag.title().and_then(norm);
    m.artist = tag.artist().and_then(norm).or_else(|| tag.album_artist().and_then(norm));
    m.album = tag.album().and_then(norm).unwrap_or_default();
    m.year = tag
        .year()
        .map(|y| y.to_string())
        .or_else(|| tag.date_recorded().map(|d| d.year.to_string()))
        .unwrap_or_default();
    m.publisher = tag.get("TPUB").and_then(|f| f.content().text()).and_then(norm).unwrap_or_default();
    m.genres = tag
        .genre()
        .map(|g| g.split([';', '\0']).filter_map(norm).collect())
        .unwrap_or_default();
    m.has_cover = tag.pictures().any(|p| !p.data.is_empty());
    m
}

fn read_meta(file_path: &Path) -> Meta {
    let mut m = Meta::default();
    let Some(tagged) = read_tagged(file_path) else {
        return meta_from_id3(file_path);
    };
    m.dur = fmt_dur(tagged.properties().duration());

    let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else {
        return m;
    };
    m.title = tag.title().as_deref().and_then(norm);
    m.artist = tag
        .artist()
        .as_deref()
        .and_then(norm)
        .or_else(|| tag.get_string(&ItemKey::AlbumArtist).and_then(norm));
    m.album = tag.album().as_deref().and_then(norm).unwrap_or_default();
    m.year = tag
        .year()
        .map(|y| y.to_string())
        // У vorbis/mp4 год часто лежит только в DATE как «2019-04-05».
        .or_else(|| {
            tag.get_string(&ItemKey::RecordingDate)
                .and_then(norm)
                .map(|d| d.chars().take(4).collect())
        })
        .unwrap_or_default();
    // ID3v2-фрейм TPUB замаплен в lofty и на Publisher, и на Label, причём при
    // чтении выигрывает Label — по одному Publisher издатель у mp3 не находится.
    m.publisher = tag
        .get_string(&ItemKey::Publisher)
        .or_else(|| tag.get_string(&ItemKey::Label))
        .and_then(norm)
        .unwrap_or_default();
    m.genres = tag
        .genre()
        .as_deref()
        .map(|g| g.split([';', '\0']).filter_map(norm).collect())
        .unwrap_or_default();
    m.has_cover = tag.pictures().iter().any(|p| !p.data().is_empty());
    m
}

fn make_track(file_path: &Path, folder: &Path) -> LocalTrackInfo {
    let stem = file_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    // Фолбэк на случай отсутствия тегов: «Артист - Название» из имени файла.
    let (fb_artist, fb_name) = match stem.find(" - ") {
        Some(sep) => (stem[..sep].trim().to_string(), stem[sep + 3..].trim().to_string()),
        None => (String::new(), stem.clone()),
    };

    let meta = read_meta(file_path);

    LocalTrackInfo {
        id: make_stable_id(file_path),
        name: meta.title.unwrap_or(fb_name),
        artist: meta.artist.unwrap_or(fb_artist),
        album: meta.album,
        year: meta.year,
        publisher: meta.publisher,
        genres: meta.genres,
        dur: meta.dur,
        has_cover: meta.has_cover,
        local_path: file_path.to_string_lossy().to_string(),
        folder: folder.to_string_lossy().to_string(),
    }
}

/// Встроенная обложка (APIC / METADATA_BLOCK_PICTURE / covr) как есть, вместе с
/// mime. Отдаётся протоколом `bloom-file` в `<img>` и cover_server'ом в
/// Discord RPC / SMTC / иконку трея.
pub fn read_cover(path: &Path) -> Option<(Vec<u8>, String)> {
    match read_tagged(path) {
        Some(tagged) => {
            let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
            let pics = tag.pictures();
            let pic = pics
                .iter()
                .find(|p| p.pic_type() == PictureType::CoverFront && !p.data().is_empty())
                .or_else(|| pics.iter().find(|p| !p.data().is_empty()))?;
            let mime = pic
                .mime_type()
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| "image/jpeg".to_string());
            Some((pic.data().to_vec(), mime))
        }
        None => cover_from_id3(path),
    }
}

fn cover_from_id3(path: &Path) -> Option<(Vec<u8>, String)> {
    let tag = read_id3_fallback(path)?;
    let front = tag
        .pictures()
        .find(|p| p.picture_type == id3::frame::PictureType::CoverFront && !p.data.is_empty());
    let pic = front.or_else(|| tag.pictures().find(|p| !p.data.is_empty()))?;
    Some((pic.data.clone(), pic.mime_type.clone()))
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

pub fn get_folders() -> Result<Vec<String>> {
    let folders = config::load_folders().context("load folders")?;
    Ok(folders.into_iter().map(|p| p.to_string_lossy().to_string()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    /// Фикстуры генерируются ffmpeg'ом: настоящие MPEG-фреймы нужны, чтобы lofty
    /// прочитал длительность. Без ffmpeg тест пропускается, а не падает.
    fn ffmpeg_missing() -> bool {
        Command::new("ffmpeg")
            .arg("-version")
            .output()
            .map(|o| !o.status.success())
            .unwrap_or(true)
    }

    /// Замок на глобальное состояние процесса: переменная LOCALAPPDATA и кеши
    /// ROOTS/FILES. Тесты бегут параллельно, и без него один затирал бы другому
    /// allowlist прямо посреди проверки.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn lock_globals() -> std::sync::MutexGuard<'static, ()> {
        ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Подменяет LOCALAPPDATA на `profile` и возвращает его обратно при выходе
    /// из области видимости — даже если тест упал по assert'у.
    struct ProfileGuard {
        _lock: std::sync::MutexGuard<'static, ()>,
        prev: Option<std::ffi::OsString>,
    }

    impl ProfileGuard {
        fn new(profile: &Path) -> Self {
            let lock = lock_globals();
            let prev = std::env::var_os("LOCALAPPDATA");
            std::env::set_var("LOCALAPPDATA", profile);
            Self { _lock: lock, prev }
        }
    }

    impl Drop for ProfileGuard {
        fn drop(&mut self) {
            match self.prev.take() {
                Some(v) => std::env::set_var("LOCALAPPDATA", v),
                None => std::env::remove_var("LOCALAPPDATA"),
            }
        }
    }

    fn tmp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bloom_fw_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn run_ffmpeg(args: &[&str], out: &Path) {
        let ok = Command::new("ffmpeg")
            .args(["-hide_banner", "-loglevel", "error", "-y"])
            .args(args)
            .arg(out)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        assert!(ok, "ffmpeg failed for {}", out.display());
    }

    /// Молчание нужной длины, все теги вычищены.
    fn untagged(out: &Path, secs: &str) {
        run_ffmpeg(
            &["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", secs, "-map_metadata", "-1"],
            out,
        );
    }

    /// Молчание с полным набором тегов и встроенной обложкой.
    ///
    /// Двумя проходами: если генерировать аудио и картинку одной командой,
    /// attached_pic обрезает вывод по длине видеопотока и трек выходит
    /// длиной 0.02 с. Сначала аудио, потом обложка через `-c copy`.
    fn tagged_with_cover(out: &Path) {
        let dir = out.parent().unwrap();
        let audio = dir.join("__audio.mp3");
        let cover = dir.join("__cover.jpg");

        run_ffmpeg(&["-f", "lavfi", "-i", "color=c=red:s=64x64:d=1", "-frames:v", "1"], &cover);
        untagged(&audio, "3");
        run_ffmpeg(
            &[
                "-i", audio.to_str().unwrap(),
                "-i", cover.to_str().unwrap(),
                "-map", "0:a", "-map", "1:v", "-c", "copy",
                "-disposition:v", "attached_pic",
                "-metadata", "title=Real Title",
                "-metadata", "artist=Real Artist",
                "-metadata", "album=Real Album",
                "-metadata", "date=2019-04-05",
                "-metadata", "genre=Rock;Indie",
                "-metadata", "publisher=Some Label",
            ],
            out,
        );
        let _ = std::fs::remove_file(&audio);
        let _ = std::fs::remove_file(&cover);
    }

    fn dur_secs(dur: &str) -> u64 {
        let parts: Vec<u64> = dur.split(':').map(|p| p.parse().unwrap()).collect();
        match parts.len() {
            2 => parts[0] * 60 + parts[1],
            3 => parts[0] * 3600 + parts[1] * 60 + parts[2],
            _ => panic!("bad dur {dur}"),
        }
    }

    #[test]
    fn tags_beat_filename_and_carry_duration_and_cover() {
        if ffmpeg_missing() {
            eprintln!("skip: ffmpeg not found");
            return;
        }
        let dir = tmp_dir("tags");
        // Имя файла врёт: артист по нему получился бы «01».
        let file = dir.join("01 - Song.mp3");
        tagged_with_cover(&file);

        let t = make_track(&file, &dir);
        assert_eq!(t.name, "Real Title");
        assert_eq!(t.artist, "Real Artist");
        assert_eq!(t.album, "Real Album");
        assert_eq!(t.year, "2019");
        assert_eq!(t.publisher, "Some Label");
        assert_eq!(t.genres, vec!["Rock".to_string(), "Indie".to_string()]);
        assert!(t.has_cover, "встроенная обложка должна находиться");
        assert!((2..=4).contains(&dur_secs(&t.dur)), "dur = {}", t.dur);

        let (bytes, mime) = read_cover(&file).expect("cover bytes");
        assert!(!bytes.is_empty());
        assert_eq!(mime, "image/jpeg");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn filename_is_the_fallback_when_tags_are_absent() {
        if ffmpeg_missing() {
            eprintln!("skip: ffmpeg not found");
            return;
        }
        let dir = tmp_dir("fallback");

        let split = dir.join("Fallback Artist - Fallback Name.mp3");
        untagged(&split, "65");
        let t = make_track(&split, &dir);
        assert_eq!(t.name, "Fallback Name");
        assert_eq!(t.artist, "Fallback Artist");
        assert!(!t.has_cover);
        assert!((64..=66).contains(&dur_secs(&t.dur)), "dur = {}", t.dur);

        // Без разделителя артист остаётся пустым — фронт подставит «Неизвестный».
        let lonely = dir.join("LonelyName.flac");
        untagged(&lonely, "2");
        let t = make_track(&lonely, &dir);
        assert_eq!(t.name, "LonelyName");
        assert_eq!(t.artist, "");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn collect_tracks_walks_subdirectories_and_skips_non_audio() {
        if ffmpeg_missing() {
            eprintln!("skip: ffmpeg not found");
            return;
        }
        let dir = tmp_dir("walk");
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        untagged(&dir.join("a.mp3"), "1");
        untagged(&dir.join("sub").join("b.flac"), "1");
        std::fs::write(dir.join("cover.jpg"), b"not audio").unwrap();
        std::fs::write(dir.join("notes.txt"), b"nope").unwrap();

        let tracks = collect_tracks(&dir);
        assert_eq!(tracks.len(), 2, "должны найтись только два аудиофайла");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn stable_id_ignores_case_but_not_path() {
        let a = make_stable_id(Path::new(r"C:\Music\Song.mp3"));
        let b = make_stable_id(Path::new(r"c:\music\song.mp3"));
        let c = make_stable_id(Path::new(r"C:\Music\Other.mp3"));
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert!(a.starts_with("lf"));
    }

    #[test]
    fn allowlist_rejects_sibling_prefix_and_traversal() {
        let _lock = lock_globals(); // ROOTS/FILES — общие на процесс
        let base = tmp_dir("roots");
        let root = base.join("music");
        let sibling = base.join("music_backup");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();
        std::fs::write(root.join("ok.mp3"), b"x").unwrap();
        std::fs::write(sibling.join("secret.mp3"), b"x").unwrap();
        std::fs::write(base.join("outside.mp3"), b"x").unwrap();

        *ROOTS.write() = vec![root.canonicalize().unwrap()];

        assert!(is_path_allowed(&root.join("ok.mp3")));
        // Строковый префикс пустил бы соседнюю папку с тем же началом имени.
        assert!(!is_path_allowed(&sibling.join("secret.mp3")));
        // И вылет наружу через «..».
        assert!(!is_path_allowed(&root.join("..").join("outside.mp3")));
        // Несуществующий путь канонизировать нельзя — значит, не разрешён.
        assert!(!is_path_allowed(&root.join("ghost.mp3")));

        ROOTS.write().clear();
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Путь, которым идут файлы с обрезанным ID3: lofty на них падает целиком,
    /// и без этого резерва трек показывался именем файла и «Неизвестным».
    #[test]
    fn id3_fallback_reads_tags_cover_and_duration() {
        if ffmpeg_missing() {
            eprintln!("skip: ffmpeg not found");
            return;
        }
        let dir = tmp_dir("id3fb");
        let file = dir.join("track.mp3");
        tagged_with_cover(&file);

        let m = meta_from_id3(&file);
        assert_eq!(m.title.as_deref(), Some("Real Title"));
        assert_eq!(m.artist.as_deref(), Some("Real Artist"));
        assert_eq!(m.album, "Real Album");
        assert_eq!(m.year, "2019");
        assert_eq!(m.publisher, "Some Label");
        assert!(m.has_cover);
        // Длительность берётся из аудиофреймов, в обход тегов.
        assert!((2..=4).contains(&dur_secs(&m.dur)), "dur = {}", m.dur);

        let (bytes, mime) = cover_from_id3(&file).expect("cover via id3");
        assert!(!bytes.is_empty());
        assert_eq!(mime, "image/jpeg");

        // На flac ID3-резерв молча пасует — там работает lofty.
        let flac = dir.join("x.flac");
        untagged(&flac, "1");
        assert!(read_id3_fallback(&flac).is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Режим «В Bloom»: копия сохраняет подпапки, тащит только аудио и не
    /// трогает оригиналы.
    #[test]
    fn copy_audio_tree_keeps_structure_and_skips_non_audio() {
        let base = tmp_dir("copy");
        let src = base.join("Моя музыка");
        let dest = base.join("dest");
        std::fs::create_dir_all(src.join("Альбом")).unwrap();
        std::fs::write(src.join("a.mp3"), b"aaa").unwrap();
        std::fs::write(src.join("Альбом").join("b.flac"), b"bbb").unwrap();
        std::fs::write(src.join("Folder.jpg"), b"img").unwrap();
        std::fs::write(src.join("list.cue"), b"cue").unwrap();

        let copied = copy_audio_tree(&src, &dest).unwrap();
        assert_eq!(copied, 2);
        assert_eq!(std::fs::read(dest.join("a.mp3")).unwrap(), b"aaa");
        assert_eq!(std::fs::read(dest.join("Альбом").join("b.flac")).unwrap(), b"bbb");
        assert!(!dest.join("Folder.jpg").exists());
        assert!(!dest.join("list.cue").exists());
        // Оригиналы на месте.
        assert!(src.join("a.mp3").exists() && src.join("Folder.jpg").exists());

        let _ = std::fs::remove_dir_all(&base);
    }

    /// Полный путь режима «В Bloom»: копия ложится в профиль, повторное
    /// добавление той же папки не затирает первую, а папка без музыки не
    /// оставляет за собой пустую директорию.
    ///
    /// LOCALAPPDATA подменяется на temp — иначе тест писал бы в реальный профиль.
    #[test]
    fn copy_into_library_lands_in_profile() {
        let base = tmp_dir("intolib");
        let profile = base.join("profile");
        std::fs::create_dir_all(&profile).unwrap();
        let _guard = ProfileGuard::new(&profile);

        let src = base.join("Сборник");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("a.mp3"), b"aaa").unwrap();

        let music = profile.join("com.bloom.app").join("music");

        let first = copy_into_library(&src).unwrap();
        assert_eq!(first, music.join("Сборник"));
        assert_eq!(std::fs::read(first.join("a.mp3")).unwrap(), b"aaa");

        let second = copy_into_library(&src).unwrap();
        assert_eq!(second, music.join("Сборник (2)"));
        assert!(first.join("a.mp3").exists(), "первая копия не должна пострадать");

        // Папка без аудио — ошибка и никакого мусора в профиле.
        let empty = base.join("Документы");
        std::fs::create_dir_all(&empty).unwrap();
        std::fs::write(empty.join("readme.txt"), b"x").unwrap();
        assert!(copy_into_library(&empty).is_err());
        assert!(!music.join("Документы").exists());

        let _ = std::fs::remove_dir_all(&base);
    }

    /// Копию из профиля отвязка стирает, пользовательскую папку — никогда.
    /// Сам корень библиотеки копией не считается, иначе удалили бы всё разом.
    #[test]
    fn only_copies_inside_the_profile_count_as_deletable() {
        let base = tmp_dir("iscopy");
        let profile = base.join("profile");
        std::fs::create_dir_all(&profile).unwrap();
        let _guard = ProfileGuard::new(&profile);

        let music = profile.join("com.bloom.app").join("music");
        let copy = music.join("Сборник");
        std::fs::create_dir_all(&copy).unwrap();
        let user_folder = base.join("Моя музыка");
        std::fs::create_dir_all(&user_folder).unwrap();

        assert!(is_copied_folder(&copy));
        assert!(!is_copied_folder(&user_folder), "папку пользователя удалять нельзя");
        assert!(!is_copied_folder(&music), "корень библиотеки — не копия");

        let _ = std::fs::remove_dir_all(&base);
    }

    /// Одиночные треки: «На месте» помнит исходный путь, «В Bloom» копирует в
    /// профиль. Дубликаты не добавляются, не-аудио отсеивается.
    #[test]
    fn single_files_follow_the_import_mode() {
        let base = tmp_dir("files");
        let profile = base.join("profile");
        std::fs::create_dir_all(&profile).unwrap();
        let _guard = ProfileGuard::new(&profile);
        config::save_files(&[]).unwrap();
        refresh_allowlist();

        let src = base.join("src");
        std::fs::create_dir_all(&src).unwrap();
        let song = src.join("Song.mp3");
        std::fs::write(&song, b"aaa").unwrap();
        std::fs::write(src.join("notes.txt"), b"x").unwrap();

        // «На месте»: путь остаётся исходным, файл никуда не копируется.
        let added = add_files(vec![song.clone(), src.join("notes.txt")], false).unwrap();
        assert_eq!(added.len(), 1, "текстовый файл не должен добавиться");
        assert_eq!(added[0].local_path, song.to_string_lossy());
        assert_eq!(added[0].folder, "", "у одиночного трека нет папки");
        assert!(is_path_allowed(&song), "трек должен стать проигрываемым");

        // Повторное добавление того же пути — дубликат.
        assert!(add_files(vec![song.clone()], false).unwrap().is_empty());

        // «В Bloom»: копия в профиле, оригинал на месте.
        let other = src.join("Other.mp3");
        std::fs::write(&other, b"bbb").unwrap();
        let added = add_files(vec![other.clone()], true).unwrap();
        assert_eq!(added.len(), 1);
        let copy = PathBuf::from(&added[0].local_path);
        assert_eq!(copy, profile.join("com.bloom.app").join("tracks").join("Other.mp3"));
        assert!(other.exists(), "оригинал не трогаем");
        assert!(is_copied_file(&copy));
        assert!(is_path_allowed(&copy));

        // Тот же файл ещё раз в режиме копии — ловим по имени и размеру.
        assert!(add_files(vec![other.clone()], true).unwrap().is_empty());

        // Удаление: копия стирается с диска, файл пользователя — нет.
        remove_file(&copy).unwrap();
        assert!(!copy.exists(), "копию удаляем");
        assert!(!is_path_allowed(&copy));
        remove_file(&song).unwrap();
        assert!(song.exists(), "исходный файл пользователя остаётся");
        assert!(!is_path_allowed(&song));

        config::save_files(&[]).unwrap();
        refresh_allowlist();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn unique_file_sidesteps_name_collisions() {
        let root = tmp_dir("uniqf");
        assert_eq!(unique_file(&root, "Song.mp3"), root.join("Song.mp3"));

        std::fs::write(root.join("Song.mp3"), b"x").unwrap();
        assert_eq!(unique_file(&root, "Song.mp3"), root.join("Song (2).mp3"));

        std::fs::write(root.join("Song (2).mp3"), b"x").unwrap();
        assert_eq!(unique_file(&root, "Song.mp3"), root.join("Song (3).mp3"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn unique_dir_sidesteps_name_collisions() {
        let root = tmp_dir("uniq");
        assert_eq!(unique_dir(&root, "Музыка"), root.join("Музыка"));

        std::fs::create_dir_all(root.join("Музыка")).unwrap();
        assert_eq!(unique_dir(&root, "Музыка"), root.join("Музыка (2)"));

        std::fs::create_dir_all(root.join("Музыка (2)")).unwrap();
        assert_eq!(unique_dir(&root, "Музыка"), root.join("Музыка (3)"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn duration_formatting() {
        assert_eq!(fmt_dur(Duration::from_secs(0)), "");
        assert_eq!(fmt_dur(Duration::from_secs(3)), "0:03");
        assert_eq!(fmt_dur(Duration::from_secs(65)), "1:05");
        assert_eq!(fmt_dur(Duration::from_secs(3661)), "1:01:01");
    }
}


