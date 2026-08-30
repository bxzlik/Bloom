//! Получение текстов песен: local tag → LRCLIB, с L1 in-memory и
//! L2 disk-кешем в `%LocalAppData%\com.bloom.app\lyrics\*.json`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use anyhow::Result;
use chrono::{DateTime, Utc};
use lofty::file::TaggedFileExt;
use lofty::tag::ItemKey;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use crate::config;
use crate::events::{self, LyricsResult as LyricsEvent};

// ---------------- Модель результата ----------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LyricsResult {
    pub found: bool,
    pub plain: String,
    pub synced: String,
    pub source: String, // "lrclib" | "local_tag" | "none" | "user_edit"
}

impl LyricsResult {
    fn not_found() -> Self {
        Self {
            found: false,
            plain: String::new(),
            synced: String::new(),
            source: "none".into(),
        }
    }
}

// ---------------- Кеш ----------------
#[derive(Clone)]
struct CacheEntry {
    result: LyricsResult,
    cached_at: DateTime<Utc>,
}

static CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static DISK_CACHE_ENABLED: AtomicBool = AtomicBool::new(true);

const NOT_FOUND_TTL: Duration = Duration::from_secs(5 * 60);
const DISK_CACHE_MAX_AGE_DAYS: i64 = 30;

pub fn set_disk_cache(enabled: bool) {
    DISK_CACHE_ENABLED.store(enabled, Ordering::Relaxed);
}

pub fn clear_all_cache() -> usize {
    CACHE.lock().clear();
    let mut deleted = 0usize;
    if let Ok(dir) = disk_cache_dir() {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) == Some("json")
                    && std::fs::remove_file(&p).is_ok() {
                        deleted += 1;
                    }
            }
        }
    }
    deleted
}

/// Статистика дискового кеша текстов: (кол-во файлов, суммарный размер в байтах).
pub fn cache_stats() -> (usize, u64) {
    let mut count = 0usize;
    let mut bytes = 0u64;
    if let Ok(dir) = disk_cache_dir() {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) == Some("json") {
                    count += 1;
                    if let Ok(meta) = e.metadata() {
                        bytes += meta.len();
                    }
                }
            }
        }
    }
    (count, bytes)
}

/// Удалить записи дискового кеша старше `max_age_secs` секунд (по полю `cachedAt`).
/// Записи `user_edit` не трогаем. Возвращает число удалённых файлов.
pub fn purge_older_than(max_age_secs: i64) -> usize {
    let mut deleted = 0usize;
    let now = Utc::now();
    if let Ok(dir) = disk_cache_dir() {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) != Some("json") {
                    continue;
                }
                let Ok(raw) = std::fs::read_to_string(&p) else { continue };
                let Ok(rec) = serde_json::from_str::<DiskCacheFile>(&raw) else { continue };
                if rec.source == "user_edit" {
                    continue;
                }
                let Ok(cached_at) = DateTime::parse_from_rfc3339(&rec.cached_at) else { continue };
                let age = now.signed_duration_since(cached_at.with_timezone(&Utc));
                if age.num_seconds() > max_age_secs && std::fs::remove_file(&p).is_ok() {
                    deleted += 1;
                }
            }
        }
    }
    if deleted > 0 {
        CACHE.lock().clear();
    }
    deleted
}

// ---------------- Regex-ы ----------------
static RX_NOISE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)[\(\[](feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]\
|[\(\[](remix|edit|version|deluxe|remaster|live|acoustic|bonus|original\s*mix)[^\)\]]*[\)\]]\
|[\(\[][^\)\]]*[\)\]]",
    )
    .unwrap()
});

static RX_TITLE_JUNK: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(?:official\s+(?:music\s+)?(?:video|audio|clip|lyric(?:s\s+)?video))\
|\b(?:lyric(?:s)?\s+video|audio|visuali[sz]er)\
|[\(\[]\s*prod\.?(?:\s+by)?\s+[^\)\]]*[\)\]]\
|\s*\bprod\.?(?:\s+by)?\s+.+$\
|\b(?:type\s+beat)\
|[\(\[]\s*(?:HD|HQ|4K|lyrics?|audio|official)\s*[\)\]]",
    )
    .unwrap()
});

static RX_MULTI_SPACE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s{2,}").unwrap());

static RX_ARTIST_SEP: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\s*[,&/]\s*|\s+(?:feat\.?|ft\.?|featuring|and|x)\s+").unwrap());

static RX_LRC_TAG: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[\d+:\d+\.\d+\]").unwrap());
static RX_LRC_DETECT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\[\d{1,2}:\d{2}\.\d{2,3}\]").unwrap());

// ---------------- HTTP-клиенты ----------------
fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Bloom/1.0 (github.com/bloom)")
        .build()
        .expect("build http client")
}

// ---------------- Основной метод ----------------
pub async fn fetch(
    artist: &str,
    title: &str,
    duration_sec: Option<u32>,
    local_path: Option<&str>,
) -> LyricsResult {
    if title.trim().is_empty() {
        return LyricsResult::not_found();
    }

    let key = format!("{}::{}", artist.to_lowercase(), title.to_lowercase());

    // L1 cache
    {
        let mut guard = CACHE.lock();
        if let Some(entry) = guard.get(&key).cloned() {
            if entry.result.found
                || (Utc::now() - entry.cached_at).to_std().unwrap_or_default() < NOT_FOUND_TTL
            {
                return entry.result;
            }
            guard.remove(&key);
        }
    }

    let now = Utc::now();

    // 1. Локальный тег
    if let Some(lp) = local_path {
        if !lp.is_empty() {
            let r = try_read_local_tag(lp);
            if r.found {
                CACHE.lock().insert(
                    key.clone(),
                    CacheEntry {
                        result: r.clone(),
                        cached_at: now,
                    },
                );
                return r;
            }
        }
    }

    // 1.5. Disk cache
    if let Some(dr) = try_read_disk_cache(artist, title) {
        CACHE.lock().insert(
            key.clone(),
            CacheEntry {
                result: dr.clone(),
                cached_at: now,
            },
        );
        return dr;
    }

    // 2. LRCLIB
    let r = fetch_lrclib(artist, title, duration_sec).await;
    if r.found {
        write_disk_cache(artist, title, &r);
        CACHE.lock().insert(
            key.clone(),
            CacheEntry {
                result: r.clone(),
                cached_at: now,
            },
        );
        return r;
    }

    // 3. Split "Artist - Title"
    if let Some(idx) = title.find(" - ") {
        let alt_artist = title[..idx].trim();
        let alt_title = title[idx + 3..].trim();
        if !alt_title.is_empty() {
            tracing::info!(
                "LyricsService: trying split title → '{alt_artist} - {alt_title}'"
            );
            let r = fetch_lrclib(alt_artist, alt_title, duration_sec).await;
            if r.found {
                write_disk_cache(artist, title, &r);
                CACHE.lock().insert(
                    key.clone(),
                    CacheEntry {
                        result: r.clone(),
                        cached_at: now,
                    },
                );
                return r;
            }
        }
    }

    let nf = LyricsResult::not_found();
    CACHE.lock().insert(
        key,
        CacheEntry {
            result: nf.clone(),
            cached_at: now,
        },
    );
    nf
}

/// Асинхронно запускает fetch и эмитит результат событием bloom-lyrics.
pub fn dispatch_request(
    app: AppHandle,
    request_id: String,
    artist: String,
    title: String,
    duration: f64,
    local_path: Option<String>,
) {
    tauri::async_runtime::spawn(async move {
        let duration_sec = if duration > 0.0 {
            Some(duration.round() as u32)
        } else {
            None
        };
        let result = fetch(&artist, &title, duration_sec, local_path.as_deref()).await;

        events::emit_lyrics(
            &app,
            LyricsEvent {
                found: result.found,
                plain: if result.plain.is_empty() { None } else { Some(result.plain) },
                synced: if result.synced.is_empty() {
                    None
                } else {
                    Some(result.synced)
                },
                source: Some(result.source),
                request_id: Some(request_id),
            },
        );
    });
}

// ---------------- 1. Локальный тег ----------------

/// USLT через резервный ID3-ридер: файлы с обрезанным тегом lofty не открывает
/// вовсе, и встроенный текст у них терялся (см. `folder_watcher::read_tagged`).
fn lyrics_via_id3(path: &std::path::Path) -> String {
    let Some(tag) = crate::folder_watcher::read_id3_fallback(path) else {
        return String::new();
    };
    let text = tag
        .lyrics()
        .map(|l| l.text.clone())
        .find(|t| !t.trim().is_empty())
        .unwrap_or_default();
    text
}

fn try_read_local_tag(path: &str) -> LyricsResult {
    let p = std::path::Path::new(path);

    let lyrics = match crate::folder_watcher::read_tagged(p) {
        Some(tagged) => tagged
            .primary_tag()
            .or_else(|| tagged.first_tag())
            .and_then(|tag| tag.get_string(&ItemKey::Lyrics))
            .map(str::to_string)
            .unwrap_or_default(),
        None => lyrics_via_id3(p),
    };

    if lyrics.trim().is_empty() {
        return LyricsResult::not_found();
    }

    tracing::info!("LyricsService: local tag lyrics found for {path}");
    let is_lrc = RX_LRC_DETECT.is_match(&lyrics);
    let synced = if is_lrc { lyrics.clone() } else { String::new() };
    let plain = if is_lrc { strip_lrc_tags(&lyrics) } else { lyrics };

    LyricsResult {
        found: true,
        plain,
        synced,
        source: "local_tag".into(),
    }
}

// ---------------- 2. LRCLIB ----------------
async fn fetch_lrclib(artist: &str, title: &str, duration_sec: Option<u32>) -> LyricsResult {
    let client = http_client();

    // 1) exact с длительностью
    if let (Some(d), false) = (duration_sec, artist.is_empty()) {
        let url = format!(
            "https://lrclib.net/api/get?artist_name={}&track_name={}&duration={}",
            urlencoding::encode(artist),
            urlencoding::encode(title),
            d
        );
        let r = try_parse_lrclib(&client, &url, "lrclib/exact").await;
        if r.found {
            return r;
        }
    }

    // 2) exact с нормализованным названием
    let clean_title = normalize_for_search(title);
    let clean_artist = normalize_for_search(artist);
    if !(clean_artist.is_empty()
        || clean_title.eq_ignore_ascii_case(title) && clean_artist.eq_ignore_ascii_case(artist))
    {
        if let Some(dur) = duration_sec {
            let url = format!(
                "https://lrclib.net/api/get?artist_name={}&track_name={}&duration={}",
                urlencoding::encode(&clean_artist),
                urlencoding::encode(&clean_title),
                dur
            );
            let r = try_parse_lrclib(&client, &url, "lrclib/exact-clean").await;
            if r.found {
                return r;
            }
        }
    }

    // 3) search по строке
    let q_raw = if artist.is_empty() {
        title.to_string()
    } else {
        format!("{artist} {title}")
    };
    let url = format!("https://lrclib.net/api/search?q={}", urlencoding::encode(&q_raw));
    let resp = match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return LyricsResult::not_found(),
    };
    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => return LyricsResult::not_found(),
    };

    let arr = match json.as_array() {
        Some(a) if !a.is_empty() => a,
        _ => return LyricsResult::not_found(),
    };

    let mut best: Option<&serde_json::Value> = None;
    let mut best_score: i32 = -1;
    let mut best_has_synced = false;

    for item in arr {
        let hit_title = item.get("trackName").and_then(|v| v.as_str()).unwrap_or("");
        let hit_artist = item.get("artistName").and_then(|v| v.as_str()).unwrap_or("");
        let has_synced = item
            .get("syncedLyrics")
            .and_then(|v| v.as_str())
            .map(|s| !s.is_empty())
            .unwrap_or(false);

        let score = score_hit(hit_title, hit_artist, title, artist);
        if score > best_score || (score >= best_score - 10 && has_synced && !best_has_synced) {
            best = Some(item);
            best_score = score;
            best_has_synced = has_synced;
        }
    }

    if best_score < 20 {
        return LyricsResult::not_found();
    }
    match best {
        Some(item) => {
            tracing::info!("LyricsService.LRCLIB: search best score={best_score} synced={best_has_synced}");
            parse_lrclib_item(item, "lrclib/search")
        }
        None => LyricsResult::not_found(),
    }
}

async fn try_parse_lrclib(client: &reqwest::Client, url: &str, source: &str) -> LyricsResult {
    let resp = match client.get(url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return LyricsResult::not_found(),
    };
    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => return LyricsResult::not_found(),
    };
    parse_lrclib_item(&json, source)
}

fn parse_lrclib_item(item: &serde_json::Value, source: &str) -> LyricsResult {
    let plain = item.get("plainLyrics").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let synced = item.get("syncedLyrics").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if plain.trim().is_empty() && synced.trim().is_empty() {
        return LyricsResult::not_found();
    }
    let plain_final = if plain.is_empty() && !synced.is_empty() {
        strip_lrc_tags(&synced)
    } else {
        plain
    };
    tracing::info!(
        "LyricsService: LRCLIB found ({source}), synced={}",
        !synced.is_empty()
    );
    LyricsResult {
        found: true,
        plain: plain_final,
        synced,
        source: source.into(),
    }
}

// ---------------- Нормализация и скоринг ----------------
fn normalize_for_search(input: &str) -> String {
    if input.trim().is_empty() {
        return String::new();
    }
    let s = RX_NOISE.replace_all(input, " ");
    let s = RX_TITLE_JUNK.replace_all(&s, " ");
    let s = RX_MULTI_SPACE.replace_all(&s, " ");
    s.trim().to_string()
}

fn primary_artist(artist: &str) -> String {
    if artist.trim().is_empty() {
        return String::new();
    }
    let parts: Vec<&str> = RX_ARTIST_SEP.split(artist).collect();
    parts.first().map(|s| s.trim().to_string()).unwrap_or_default()
}

fn score_hit(hit_title: &str, hit_artist: &str, query_title: &str, query_artist: &str) -> i32 {
    let ht = hit_title.trim();
    let ha = hit_artist.trim();
    let qt = query_title.trim();
    let qa = query_artist.trim();
    let mut score = 0i32;

    // Title 0-60
    if ht.eq_ignore_ascii_case(qt) {
        score += 60;
    } else if ci_contains(ht, qt) || ci_contains(qt, ht) {
        score += 40;
    } else {
        let nht = normalize_for_search(ht);
        let nqt = normalize_for_search(qt);
        if nht.eq_ignore_ascii_case(&nqt) {
            score += 50;
        } else if ci_contains(&nht, &nqt) || ci_contains(&nqt, &nht) {
            score += 30;
        }
    }

    // Artist 0-40
    if !qa.is_empty() && !ha.is_empty() {
        if ha.eq_ignore_ascii_case(qa) {
            score += 40;
        } else if ci_contains(ha, qa) || ci_contains(qa, ha) {
            score += 30;
        } else {
            let pha = primary_artist(ha);
            let pqa = primary_artist(qa);
            if pha.eq_ignore_ascii_case(&pqa) {
                score += 35;
            } else if ci_contains(&pha, &pqa) || ci_contains(&pqa, &pha) {
                score += 20;
            }
        }
    }

    score
}

fn ci_contains(hay: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return false;
    }
    hay.to_lowercase().contains(&needle.to_lowercase())
}

// ---------------- Служебное ----------------
fn strip_lrc_tags(lrc: &str) -> String {
    if lrc.is_empty() {
        return String::new();
    }
    RX_LRC_TAG.replace_all(lrc, "").trim().to_string()
}

// ---------------- Disk cache ----------------
fn disk_cache_dir() -> Result<PathBuf> {
    Ok(config::local_appdata_dir()?.join("lyrics"))
}

fn disk_cache_key(artist: &str, title: &str) -> String {
    let input = format!("{}::{}", artist.to_lowercase(), title.to_lowercase());
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for b in digest.iter() {
        hex.push_str(&format!("{b:02x}"));
    }
    hex[..16].to_string()
}

#[derive(Serialize, Deserialize)]
struct DiskCacheFile {
    plain: String,
    synced: String,
    source: String,
    #[serde(rename = "cachedAt")]
    cached_at: String,
}

fn try_read_disk_cache(artist: &str, title: &str) -> Option<LyricsResult> {
    let path = disk_cache_dir().ok()?.join(format!("{}.json", disk_cache_key(artist, title)));
    if !path.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(&path).ok()?;
    let rec: DiskCacheFile = serde_json::from_str(&raw).ok()?;

    let cached_at = DateTime::parse_from_rfc3339(&rec.cached_at)
        .ok()?
        .with_timezone(&Utc);
    if rec.source != "user_edit" {
        let age = Utc::now().signed_duration_since(cached_at);
        if age.num_days() > DISK_CACHE_MAX_AGE_DAYS {
            tracing::info!("LyricsService: disk cache expired for {artist} - {title}");
            return None;
        }
    }

    if rec.plain.trim().is_empty() && rec.synced.trim().is_empty() {
        return None;
    }

    tracing::info!("LyricsService: disk cache hit for {artist} - {title}");
    Some(LyricsResult {
        found: true,
        plain: rec.plain,
        synced: rec.synced,
        source: rec.source,
    })
}

fn write_disk_cache(artist: &str, title: &str, result: &LyricsResult) {
    if !DISK_CACHE_ENABLED.load(Ordering::Relaxed) {
        return;
    }
    let dir = match disk_cache_dir() {
        Ok(d) => d,
        Err(_) => return,
    };
    if let Err(e) = std::fs::create_dir_all(&dir) {
        tracing::warn!("LyricsService.write_disk_cache mkdir: {e}");
        return;
    }
    let path = dir.join(format!("{}.json", disk_cache_key(artist, title)));
    let rec = DiskCacheFile {
        plain: result.plain.clone(),
        synced: result.synced.clone(),
        source: result.source.clone(),
        cached_at: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&rec) {
        let _ = std::fs::write(path, json);
    }
}
