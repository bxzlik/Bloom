//! Лёгкая проверка/установка обновлений через GitHub Releases — без
//! updater-плагина и ключей подписи. Сверяемся с latest release репозитория,
//! сравниваем версии, при наличии новой качаем NSIS-установщик (.exe) и
//! запускаем его, закрывая приложение (чтобы установщик смог заменить файлы).

use std::io::Write;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// owner/repo, чьи релизы проверяем.
const REPO: &str = "bxzlik/Bloom";
/// Версия текущей сборки (из Cargo.toml / tauri.conf.json — они синхронны).
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const USER_AGENT: &str = "Bloom-Updater";
/// Манифест с описаниями обновлений (текст + фото) — лежит в репозитории и
/// тянется по сети, чтобы старая сборка могла показать анонс новой версии, а
/// новая — экран «Что нового». Правится без пересборки приложения.
const NOTES_URL: &str =
    "https://raw.githubusercontent.com/bxzlik/Bloom/main/update-notes/update-notes.json";

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    /// Доступна ли новая версия (latest строго больше current).
    pub available: bool,
    /// Текущая версия приложения.
    pub current: String,
    /// Версия последнего релиза (без префикса 'v').
    pub latest: String,
    /// Описание релиза (markdown body), может быть пустым.
    pub notes: String,
    /// Прямая ссылка на NSIS-установщик (.exe). Пусто, если ассет не найден.
    pub download_url: String,
    /// Имя файла установщика.
    pub asset_name: String,
}

#[derive(Serialize, Clone)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: u32,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

/// Текущая версия приложения — для отображения в «О программе».
#[tauri::command]
pub fn app_version() -> String {
    CURRENT_VERSION.to_string()
}

/// Запрашивает latest release с GitHub и сравнивает версии.
#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let rel: GhRelease = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let latest = rel.tag_name.trim_start_matches('v').trim().to_string();
    let available = is_newer(&latest, CURRENT_VERSION);

    // Ищем NSIS-установщик: имя оканчивается на "setup.exe".
    let asset = rel
        .assets
        .iter()
        .find(|a| a.name.to_ascii_lowercase().ends_with("setup.exe"));
    let (download_url, asset_name) = match asset {
        Some(a) => (a.browser_download_url.clone(), a.name.clone()),
        None => (String::new(), String::new()),
    };

    Ok(UpdateInfo {
        available,
        current: CURRENT_VERSION.to_string(),
        latest,
        notes: rel.body,
        download_url,
        asset_name,
    })
}

/// Тянет манифест описаний обновлений (`update-notes.json`) как сырую строку —
/// парсинг и выбор записи по версии делает фронтенд. Кэш CDN обходим query-меткой
/// времени, чтобы свежие правки доезжали без задержки в ~5 минут.
#[tauri::command]
pub async fn fetch_update_notes() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let bust = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let text = client
        .get(format!("{NOTES_URL}?t={bust}"))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    Ok(text)
}

/// Качает установщик во временную папку, эмиття прогресс в `bloom-update-progress`.
/// Возвращает путь к скачанному файлу.
#[tauri::command]
pub async fn download_update(app: AppHandle, url: String, asset_name: String) -> Result<String, String> {
    if url.is_empty() {
        return Err("Нет ссылки на установщик".into());
    }
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;

    let mut resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    let safe_name = if asset_name.trim().is_empty() {
        "BloomSetup.exe".to_string()
    } else {
        // Берём только имя файла, без подкаталогов из чужого asset_name.
        PathBuf::from(&asset_name)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "BloomSetup.exe".to_string())
    };
    let path = std::env::temp_dir().join(&safe_name);

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;

    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let percent = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0) as u32
        } else {
            0
        };
        let _ = app.emit(
            "bloom-update-progress",
            UpdateProgress { downloaded, total, percent },
        );
    }
    file.flush().map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

/// Запускает скачанный установщик (отдельным процессом) и закрывает приложение,
/// чтобы NSIS мог заменить файлы.
#[tauri::command]
pub fn install_update(app: AppHandle, path: String) -> Result<(), String> {
    std::process::Command::new(&path)
        .spawn()
        .map_err(|e| format!("Не удалось запустить установщик: {e}"))?;
    app.exit(0);
    Ok(())
}

/// true, если `latest` строго больше `current` (semver-подобно, по числовым полям).
fn is_newer(latest: &str, current: &str) -> bool {
    parse_ver(latest) > parse_ver(current)
}

/// "1.2.3-foo" → (1, 2, 3). Нечисловые хвосты у компонентов игнорируются.
fn parse_ver(v: &str) -> (u32, u32, u32) {
    let mut it = v.split('.').map(|p| {
        p.chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse::<u32>()
            .unwrap_or(0)
    });
    (it.next().unwrap_or(0), it.next().unwrap_or(0), it.next().unwrap_or(0))
}
