//! Получение текстов песен: local tag → LRCLIB → Genius, с L1 in-memory и
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
    pub source: String, // "lrclib" | "genius" | "local_tag" | "none" | "user_edit"
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

static RX_EMBED_TAIL: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)\d*Embed$").unwrap());
static RX_YOU_MIGHT_ALSO: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)You might also like").unwrap());
static RX_TRIPLE_NL: Lazy<Regex> = Lazy::new(|| Regex::new(r"\n{3,}").unwrap());
static RX_BR: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<br\s*/?>").unwrap());
static RX_HTML_TAG: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").unwrap());

// ---------------- HTTP-клиенты ----------------
fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Bloom/1.0 (github.com/bloom)")
        .build()
        .expect("build http client")
}

fn genius_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("Bloom/1.0 (github.com/bloom)")
        .build()
        .expect("build genius http client")
}

// ---------------- Основной метод ----------------
pub async fn fetch(
    artist: &str,
    title: &str,
    duration_sec: Option<u32>,
    local_path: Option<&str>,
    genius_token: Option<&str>,
) -> LyricsResult {
    if title.trim().is_empty() {
        return LyricsResult::not_found();
    }

    let has_token = genius_token.map(|t| !t.is_empty()).unwrap_or(false);
    let key = format!(
        "{}::{}::{}",
        artist.to_lowercase(),
        title.to_lowercase(),
        if has_token { "g" } else { "0" }
    );

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

    // 3. Genius
    if has_token {
        let r = fetch_genius(artist, title, genius_token.unwrap()).await;
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

    // 4. Split "Artist - Title"
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
            if has_token {
                let r = fetch_genius(alt_artist, alt_title, genius_token.unwrap()).await;
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
    genius_token: Option<String>,
) {
    tauri::async_runtime::spawn(async move {
        let duration_sec = if duration > 0.0 {
            Some(duration.round() as u32)
        } else {
            None
        };
        let result = fetch(
            &artist,
            &title,
            duration_sec,
            local_path.as_deref(),
            genius_token.as_deref(),
        )
        .await;

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
fn try_read_local_tag(path: &str) -> LyricsResult {
    let tagged = match lofty::read_from_path(path) {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("LyricsService.try_read_local_tag: {e}");
            return LyricsResult::not_found();
        }
    };

    let tag = match tagged.primary_tag().or_else(|| tagged.first_tag()) {
        Some(t) => t,
        None => return LyricsResult::not_found(),
    };

    let lyrics = tag
        .get_string(&ItemKey::Lyrics)
        .map(|s| s.to_string())
        .unwrap_or_default();

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

// ---------------- 3. Genius ----------------
async fn fetch_genius(artist: &str, title: &str, token: &str) -> LyricsResult {
    let clean_title = normalize_for_search(title);
    let clean_artist = normalize_for_search(artist);
    let primary_art = primary_artist(&clean_artist);

    let r = search_genius_and_score(&clean_artist, &clean_title, title, artist, token).await;
    if r.found {
        return r;
    }

    if !primary_art.is_empty() && !primary_art.eq_ignore_ascii_case(&clean_artist) {
        let r = search_genius_and_score(&primary_art, &clean_title, title, artist, token).await;
        if r.found {
            return r;
        }
    }

    if !clean_artist.is_empty() {
        let r = search_genius_and_score("", &clean_title, title, artist, token).await;
        if r.found {
            return r;
        }
    }

    LyricsResult::not_found()
}

async fn search_genius_and_score(
    query_artist: &str,
    query_title: &str,
    orig_title: &str,
    orig_artist: &str,
    token: &str,
) -> LyricsResult {
    let client = genius_client();
    let q_raw = if query_artist.is_empty() {
        query_title.to_string()
    } else {
        format!("{query_artist} {query_title}")
    };
    let url = format!(
        "https://api.genius.com/search?q={}&per_page=10",
        urlencoding::encode(&q_raw)
    );

    let resp = match client
        .get(&url)
        .bearer_auth(token)
        .header("User-Agent", "Bloom/1.0")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("LyricsService.Genius: request failed: {e}");
            return LyricsResult::not_found();
        }
    };

    tracing::info!(
        "LyricsService.Genius: search status {} q='{query_artist} {query_title}'",
        resp.status()
    );
    if !resp.status().is_success() {
        return LyricsResult::not_found();
    }

    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => return LyricsResult::not_found(),
    };

    let hits = match json.pointer("/response/hits").and_then(|v| v.as_array()) {
        Some(h) if !h.is_empty() => h,
        _ => return LyricsResult::not_found(),
    };

    let mut best_url: Option<String> = None;
    let mut best_score = 0i32;

    for hit in hits {
        if hit.get("type").and_then(|v| v.as_str()) != Some("song") {
            continue;
        }
        let result = match hit.get("result") {
            Some(r) => r,
            None => continue,
        };
        let hit_title = result.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let url = result.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let hit_artist = result
            .pointer("/primary_artist/name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if url.is_empty() {
            continue;
        }
        let s1 = score_hit(hit_title, hit_artist, orig_title, orig_artist);
        let s2 = score_hit(hit_title, hit_artist, query_title, query_artist);
        let s = s1.max(s2);
        tracing::info!("LyricsService.Genius: hit '{hit_artist} - {hit_title}' score={s}");
        if s > best_score {
            best_score = s;
            best_url = Some(url.to_string());
        }
    }

    if best_score < 30 {
        return LyricsResult::not_found();
    }
    match best_url {
        Some(u) => {
            tracing::info!("LyricsService.Genius: best score={best_score}");
            scrape_genius_page(&u).await
        }
        None => LyricsResult::not_found(),
    }
}

async fn scrape_genius_page(page_url: &str) -> LyricsResult {
    let client = genius_client();
    let resp = match client
        .get(page_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        )
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("LyricsService.Genius: page request failed: {e}");
            return LyricsResult::not_found();
        }
    };
    tracing::info!("LyricsService.Genius: page status {}", resp.status());
    if !resp.status().is_success() {
        return LyricsResult::not_found();
    }

    let html = match resp.text().await {
        Ok(h) => h,
        Err(_) => return LyricsResult::not_found(),
    };

    let raw = extract_genius_lyrics(&html);
    let lyrics = clean_genius_lyrics(&raw);
    if lyrics.trim().is_empty() {
        return LyricsResult::not_found();
    }

    LyricsResult {
        found: true,
        plain: lyrics,
        synced: String::new(),
        source: "genius".into(),
    }
}

fn clean_genius_lyrics(raw: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }
    let s = RX_EMBED_TAIL.replace_all(raw, "");
    let s = RX_YOU_MIGHT_ALSO.replace_all(&s, "");
    let s = RX_TRIPLE_NL.replace_all(&s, "\n\n");
    s.trim().to_string()
}

fn extract_genius_lyrics(html: &str) -> String {
    let markers = [
        "data-lyrics-container=\"true\"",
        "data-lyrics-container='true'",
        "class=\"Lyrics__Container",
        "class=\"Lyrics-sc-",
        "class=\"lyrics\"",
    ];

    let lower = html.to_ascii_lowercase();

    for marker in markers {
        let mlower = marker.to_ascii_lowercase();
        let mut out = String::new();
        let mut search_from = 0;

        while let Some(start) = find_substring(&lower, &mlower, search_from) {
            let tag_end = match html[start..].find('>') {
                Some(i) => start + i + 1,
                None => break,
            };

            let mut depth = 1i32;
            let mut pos = tag_end;
            let mut block_end: Option<usize> = None;
            let mut consumed = false;

            while pos < html.len() && depth > 0 {
                let open_next = find_substring(&lower, "<div", pos);
                let close_next = find_substring(&lower, "</div", pos);
                let close_next = match close_next {
                    Some(c) => c,
                    None => break,
                };
                if let Some(o) = open_next {
                    if o < close_next {
                        depth += 1;
                        pos = o + 4;
                        continue;
                    }
                }
                depth -= 1;
                if depth == 0 {
                    block_end = Some(close_next);
                    search_from = close_next + 6;
                    consumed = true;
                    break;
                } else {
                    pos = close_next + 5;
                }
            }

            match block_end {
                Some(end) => {
                    let block = &html[tag_end..end];
                    let s = RX_BR.replace_all(block, "\n");
                    let s = RX_HTML_TAG.replace_all(&s, "");
                    let s = html_escape::decode_html_entities(&s).trim().to_string();
                    if !s.is_empty() {
                        out.push_str(&s);
                        out.push('\n');
                    }
                }
                None => break,
            }

            if !consumed {
                break;
            }
        }

        let result = out.trim().to_string();
        if !result.is_empty() {
            tracing::info!("LyricsService.Genius: extracted via marker '{marker}'");
            return result;
        }
    }

    tracing::info!("LyricsService.Genius: no HTML containers, trying JSON extraction");
    extract_genius_from_json(html)
}

fn find_substring(hay_lower: &str, needle_lower: &str, from: usize) -> Option<usize> {
    if from >= hay_lower.len() {
        return None;
    }
    hay_lower[from..].find(needle_lower).map(|i| i + from)
}

fn extract_genius_from_json(html: &str) -> String {
    // Паттерн 1: "body":{"plain":"..."}
    if let Some(m) = Regex::new(r#"(?s)"body"\s*:\s*\{[^}]*"plain"\s*:\s*"((?:[^"\\]|\\.)*)""#)
        .ok()
        .and_then(|r| r.captures(html))
    {
        let raw = clean_genius_lyrics(&unescape_json(&m[1]));
        if !raw.trim().is_empty() {
            return raw;
        }
    }
    if let Some(m) = Regex::new(r#"(?s)"lyrics_text"\s*:\s*"((?:[^"\\]|\\.)*)""#)
        .ok()
        .and_then(|r| r.captures(html))
    {
        let raw = clean_genius_lyrics(&unescape_json(&m[1]));
        if !raw.trim().is_empty() {
            return raw;
        }
    }
    if let Some(m) = Regex::new(r#"(?s)"html"\s*:\s*"((?:[^"\\]|\\.)*)""#)
        .ok()
        .and_then(|r| r.captures(html))
    {
        if m[1].len() > 50 {
            let raw = unescape_json(&m[1]);
            let raw = RX_BR.replace_all(&raw, "\n");
            let raw = RX_HTML_TAG.replace_all(&raw, "");
            let raw = html_escape::decode_html_entities(&raw).trim().to_string();
            let raw = clean_genius_lyrics(&raw);
            if !raw.trim().is_empty() {
                return raw;
            }
        }
    }
    if let Some(m) = Regex::new(
        r#"(?s)"lyricsData"[^{]*\{[^}]*"body"[^{]*\{[^}]*"plain"\s*:\s*"((?:[^"\\]|\\.)*)""#,
    )
    .ok()
    .and_then(|r| r.captures(html))
    {
        let raw = clean_genius_lyrics(&unescape_json(&m[1]));
        if !raw.trim().is_empty() {
            return raw;
        }
    }
    String::new()
}

fn unescape_json(s: &str) -> String {
    s.replace("\\n", "\n")
        .replace("\\\"", "\"")
        .replace("\\\\", "\\")
        .replace("\\/", "/")
        .trim()
        .to_string()
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
