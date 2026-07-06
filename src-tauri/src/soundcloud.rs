//! SoundCloud api-v2 — порт фронтового `scClient.ts` (вся сеть SC теперь в Rust,
//! как `yandex.rs`/`ytm.rs`; на фронте осталась тонкая invoke-обёртка).
//!
//! client_id: ручной (передаётся с фронта `sc_set_client_id`) → известные →
//! скрейп ассетов soundcloud.com. Каждый запрос — гонка «прямой + CORS-прокси»:
//! прокси не для CORS (его в Rust нет), а фолбэк на случай блокировки SC у
//! пользователя; первый успешный ответ побеждает (паритет с TS `proxyFetch`).
//!
//! Ошибки возвращаются кодами i18n-словаря (`sc.err.*` / `search.err.*`) —
//! фронтовая обёртка переводит их через `i18nT`.

use anyhow::{anyhow, bail, Result};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const KNOWN_CLIENT_IDS: [&str; 5] = [
    "O7atZypwLvuWSY9hWnnQ3vrLTHH7wqMe", // актуальный на 2026-07 (со скрейпа)
    "iZIs9mchVcX5lhVRyQGGAYlNPa2Rp1jf",
    "a3e059563d7fd3372b49b37f00a00bcf",
    "fDoItMDbsbZz8dY16ZzARCZmzgHBPotA",
    "YUKXoArFcqrlQn9tfNHvvyfnDISj04zk",
];

const CLIENT_ID_TTL: Duration = Duration::from_secs(6 * 60 * 60);

// ============================ client_id state ============================

struct ClientIdState {
    manual: Option<String>,
    auto: Option<String>,
    /// None — авто-кеш «протух»/не получен (в т.ч. после фолбэка на известный id).
    fetched_at: Option<Instant>,
}

static STATE: Lazy<Mutex<ClientIdState>> = Lazy::new(|| {
    Mutex::new(ClientIdState { manual: None, auto: None, fetched_at: None })
});

/// Ручной client_id из настроек (фронт хранит его в localStorage и прокидывает
/// сюда при старте и при изменении). `None`/пустая строка — сброс (вместе с
/// авто-кешем, как в TS `setManualClientId(null)`).
pub fn set_manual_client_id(id: Option<String>) {
    let id = id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let mut st = STATE.lock();
    if id.is_none() {
        st.auto = None;
        st.fetched_at = None;
    }
    st.manual = id;
}

fn active_client_id() -> Option<String> {
    let st = STATE.lock();
    st.manual.clone().or_else(|| st.auto.clone())
}

/// Сбросить авто-кеш (ручной не трогаем) — перед `check_connection` и при
/// невалидном ответе SC.
fn reset_auto_cache() {
    let mut st = STATE.lock();
    if st.manual.is_none() {
        st.auto = None;
        st.fetched_at = None;
    }
}

fn clear_auto() {
    let mut st = STATE.lock();
    st.auto = None;
    st.fetched_at = None;
}

// ============================ HTTP (гонка direct+прокси) ============================

static HTTP: Lazy<reqwest::Client> =
    Lazy::new(|| reqwest::Client::builder().build().expect("reqwest client build"));

fn proxy_urls(u: &str) -> Vec<String> {
    let enc = urlencoding::encode(u).into_owned();
    vec![
        format!("https://corsproxy.io/?{enc}"),
        format!("https://api.allorigins.win/raw?url={enc}"),
        format!("https://api.codetabs.com/v1/proxy?quest={enc}"),
    ]
}

/// Гонка «прямой запрос (8с) + прокси (12с)», побеждает первый успешный.
/// `accept_auth_err` — принять 401/403 от прямого запроса (нужно `api_fetch`
/// для ветки перебора известных client_id); от прокси — только 2xx.
async fn race_fetch(url: &str, accept_auth_err: bool) -> Result<(u16, String)> {
    let mut set = tokio::task::JoinSet::new();
    {
        let u = url.to_string();
        set.spawn(async move {
            let r = HTTP.get(&u).timeout(Duration::from_secs(8)).send().await?;
            let status = r.status().as_u16();
            if r.status().is_success() || (accept_auth_err && (status == 401 || status == 403)) {
                Ok((status, r.text().await?))
            } else {
                bail!("not ok")
            }
        });
    }
    for p in proxy_urls(url) {
        set.spawn(async move {
            let r = HTTP.get(&p).timeout(Duration::from_secs(12)).send().await?;
            if !r.status().is_success() {
                bail!("not ok");
            }
            Ok((r.status().as_u16(), r.text().await?))
        });
    }
    while let Some(res) = set.join_next().await {
        if let Ok(Ok(out)) = res {
            set.abort_all();
            return Ok(out);
        }
    }
    bail!("sc.err.unavailable")
}

// ============================ client_id ============================

/// Активный client_id: ручной → свежий авто → скрейп ассетов soundcloud.com →
/// первый известный (без отметки времени — перепроверится в следующий раз).
async fn get_client_id() -> Result<String> {
    {
        let st = STATE.lock();
        if let Some(m) = &st.manual {
            return Ok(m.clone());
        }
        if let (Some(id), Some(at)) = (&st.auto, st.fetched_at) {
            if at.elapsed() < CLIENT_ID_TTL {
                return Ok(id.clone());
            }
        }
    }

    static ASSET_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r#"src="(https://a-v2\.sndcdn\.com/assets/[^"]*\.js)""#).unwrap());
    static ID_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r#"client_id:"([a-zA-Z0-9]{20,})""#).unwrap());

    // Сканируем ВСЕ ассеты (раньше первые 6 — SC переложил client_id в хвост
    // списка, и старый TS-скрейп из-за этого молча ломался).
    if let Ok((_, html)) = race_fetch("https://soundcloud.com", false).await {
        for m in ASSET_RE.captures_iter(&html).take(16) {
            if let Ok((_, js)) = race_fetch(&m[1], false).await {
                if let Some(c) = ID_RE.captures(&js) {
                    let id = c[1].to_string();
                    let mut st = STATE.lock();
                    st.auto = Some(id.clone());
                    st.fetched_at = Some(Instant::now());
                    return Ok(id);
                }
            }
        }
    }

    let id = KNOWN_CLIENT_IDS[0].to_string();
    STATE.lock().auto = Some(id.clone());
    Ok(id)
}

/// JS-falsy для полей ответа SC (`!data.errors`, `!data.status`).
fn falsy(v: Option<&Value>) -> bool {
    match v {
        None => true,
        Some(Value::Null) => true,
        Some(Value::Bool(b)) => !b,
        Some(Value::String(s)) => s.is_empty(),
        Some(Value::Number(n)) => n.as_f64() == Some(0.0),
        _ => false,
    }
}

/// Перебор известных client_id; валидная выдача — кешируем id и возвращаем её.
async fn try_known_ids(url: &str) -> Option<Value> {
    for id in KNOWN_CLIENT_IDS {
        let sep = if url.contains('?') { '&' } else { '?' };
        let Ok((_, body)) = race_fetch(&format!("{url}{sep}client_id={id}"), false).await else {
            continue;
        };
        let Ok(data) = serde_json::from_str::<Value>(&body) else { continue };
        let has_payload = data.get("collection").is_some()
            || data.get("id").is_some()
            || !falsy(data.get("url"));
        if falsy(data.get("errors")) && falsy(data.get("status")) && has_payload {
            let mut st = STATE.lock();
            st.auto = Some(id.to_string());
            st.fetched_at = Some(Instant::now());
            return Some(data);
        }
    }
    None
}

/// Запрос к api-v2 с client_id и авто-восстановлением при невалидном ключе
/// (401/403, `errors[]`, `status: "4xx"` → сброс кеша + перебор известных id).
pub async fn api_fetch(url: &str, no_retry: bool) -> Result<Value> {
    let id = get_client_id().await?;
    let sep = if url.contains('?') { '&' } else { '?' };
    let (status, body) = race_fetch(&format!("{url}{sep}client_id={id}"), true).await?;

    if status == 401 || status == 403 {
        if no_retry {
            bail!("sc.err.forbidden");
        }
        clear_auto();
        if let Some(d) = try_known_ids(url).await {
            return Ok(d);
        }
        bail!("sc.err.clientIdInvalid");
    }

    let data: Value = serde_json::from_str(&body).map_err(|_| anyhow!("sc.err.unavailable"))?;

    let has_errors = data
        .get("errors")
        .and_then(Value::as_array)
        .is_some_and(|a| !a.is_empty());
    if has_errors {
        if no_retry {
            let msg = data["errors"][0]
                .get("error_message")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .unwrap_or("SC API error");
            bail!("{msg}");
        }
        clear_auto();
        if let Some(d) = try_known_ids(url).await {
            return Ok(d);
        }
        bail!("sc.err.clientIdExpired");
    }

    let status4 = data.get("status").and_then(Value::as_str).is_some_and(|s| {
        let b = s.as_bytes();
        b.len() >= 3 && b[0] == b'4' && b[1].is_ascii_digit() && b[2].is_ascii_digit()
    });
    if status4 {
        if no_retry {
            bail!("SC: {}", data["status"].as_str().unwrap_or(""));
        }
        clear_auto();
        if let Some(d) = try_known_ids(url).await {
            return Ok(d);
        }
        bail!("sc.err.clientIdInvalid");
    }

    Ok(data)
}

// ============================ JSON-хелперы ============================

/// Непустая строка поля (пустая = JS-falsy, проваливается в фолбэк как `||`).
fn vstr<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(Value::as_str).filter(|s| !s.is_empty())
}

fn vu64(v: &Value, k: &str) -> Option<u64> {
    v.get(k)
        .and_then(|x| x.as_u64().or_else(|| x.as_f64().map(|f| f as u64)))
}

/// JS-truthiness поля (`!!x`).
fn vbool(v: &Value, k: &str) -> bool {
    !falsy(v.get(k))
}

fn varr<'a>(v: &'a Value, k: &str) -> &'a [Value] {
    static EMPTY: &[Value] = &[];
    v.get(k).and_then(Value::as_array).map(|a| a.as_slice()).unwrap_or(EMPTY)
}

/// `-large` → `-t300x300` (обложка 300px), null при пустом значении.
fn t300(raw: Option<&str>) -> Option<String> {
    raw.filter(|s| !s.is_empty()).map(|s| s.replace("-large", "-t300x300"))
}

fn now_millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

// ============================ Типы выдачи (serde camelCase зеркалит TS) ============================

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScRawTrack {
    pub id: u64,
    pub title: String,
    pub artist: String,
    pub artist_sc_id: Option<u64>,
    pub artwork: Option<String>,
    pub duration: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permalink: Option<String>,
    /// Сырой `media` SC (transcodings) — нужен фронту для стрима/скачивания.
    pub media: Option<Value>,
    pub genre: Option<String>,
    pub tags: Vec<String>,
    pub album: String,
    pub publisher: String,
    pub description: String,
    pub explicit: bool,
    pub credited_artist: String,
    pub artist_avatar: Option<String>,
    pub artist_permalink: Option<String>,
    pub artist_verified: bool,
    pub year: String,
    pub playback_count: Option<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScRawArtist {
    pub id: u64,
    pub title: String,
    pub artist: String,
    pub artwork: Option<String>,
    pub followers: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permalink: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScRawPlaylist {
    pub id: u64,
    pub title: String,
    pub artist: String,
    pub artwork: Option<String>,
    pub track_count: u64,
    pub duration: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permalink: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScPage<T: Serialize> {
    pub items: Vec<T>,
    pub has_more: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScCheckResult {
    pub ok: bool,
    pub client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScRawUser {
    pub id: u64,
    pub username: String,
    pub full_name: String,
    pub avatar: Option<String>,
    pub banner: Option<String>,
    pub followers: u64,
    pub track_count: u64,
    pub description: String,
    pub website: Option<String>,
    pub permalink: Option<String>,
}

/// Элемент ленты репостов: репостнутый трек ИЛИ плейлист/альбом.
#[derive(Serialize)]
pub struct ScRepostItem {
    pub kind: String, // "track" | "playlist" | "album"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track: Option<ScRawTrack>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist: Option<ScRawPlaylist>,
}

#[derive(Serialize)]
pub struct ScRepostsPage {
    pub items: Vec<ScRepostItem>,
    pub next: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScTracksCursorPage {
    pub tracks: Vec<ScRawTrack>,
    pub next: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScArtistData {
    pub tracks: Vec<ScRawTrack>,
    pub tracks_next: Option<String>,
    pub albums: Vec<ScRawPlaylist>,
    pub user_id: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScPlaylistFull {
    pub tracks: Vec<ScRawTrack>,
    pub title: String,
    pub cover: Option<String>,
    pub owner_name: String,
    pub track_count: u64,
}

/// Результат резолва SC-ссылки (TS-union `ScResolved` — поля по `kind`).
#[derive(Serialize)]
pub struct ScResolved {
    pub kind: String, // "track" | "artist" | "playlist" | "album"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track: Option<ScRawTrack>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<ScRawArtist>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist: Option<ScRawPlaylist>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScStream {
    pub url: String,
    pub is_hls: bool,
}

// ============================ Маппинг ============================

fn map_raw_track(t: &Value) -> ScRawTrack {
    let user = t.get("user").filter(|u| u.is_object());
    let pm = t.get("publisher_metadata").filter(|p| p.is_object());
    ScRawTrack {
        id: vu64(t, "id").unwrap_or(0),
        title: vstr(t, "title").unwrap_or("").to_string(),
        artist: match user {
            Some(u) => vstr(u, "username").unwrap_or("").to_string(),
            None => "Unknown".to_string(),
        },
        artist_sc_id: user.and_then(|u| vu64(u, "id")),
        artwork: t300(vstr(t, "artwork_url")),
        duration: vu64(t, "duration").unwrap_or(0),
        permalink: vstr(t, "permalink_url").map(String::from),
        media: t.get("media").filter(|m| !m.is_null()).cloned(),
        genre: vstr(t, "genre").map(String::from),
        tags: vstr(t, "tag_list")
            .map(|s| s.split(' ').filter(|p| !p.is_empty()).map(String::from).collect())
            .unwrap_or_default(),
        album: pm.and_then(|p| vstr(p, "album_title")).unwrap_or("").to_string(),
        publisher: vstr(t, "label_name")
            .or_else(|| pm.and_then(|p| vstr(p, "publisher")))
            .unwrap_or("")
            .to_string(),
        description: vstr(t, "description").unwrap_or("").to_string(),
        explicit: pm.map(|p| vbool(p, "explicit")).unwrap_or(false),
        credited_artist: pm.and_then(|p| vstr(p, "artist")).unwrap_or("").to_string(),
        artist_avatar: user.and_then(|u| t300(vstr(u, "avatar_url"))),
        artist_permalink: user.and_then(|u| vstr(u, "permalink_url")).map(String::from),
        artist_verified: user.map(|u| vbool(u, "verified")).unwrap_or(false),
        year: vstr(t, "release_date")
            .or_else(|| vstr(t, "created_at"))
            .map(|d| d.chars().take(4).collect())
            .unwrap_or_default(),
        playback_count: vu64(t, "playback_count"),
    }
}

fn map_raw_artist(u: &Value) -> ScRawArtist {
    ScRawArtist {
        id: vu64(u, "id").unwrap_or(0),
        title: vstr(u, "username").unwrap_or("").to_string(),
        artist: vstr(u, "full_name").unwrap_or("").to_string(),
        artwork: t300(vstr(u, "avatar_url")),
        followers: vu64(u, "followers_count").unwrap_or(0),
        permalink: vstr(u, "permalink_url").map(String::from),
    }
}

fn map_raw_playlist(p: &Value) -> ScRawPlaylist {
    let user = p.get("user").filter(|u| u.is_object());
    ScRawPlaylist {
        id: vu64(p, "id").unwrap_or(0),
        title: vstr(p, "title").unwrap_or("").to_string(),
        artist: match user {
            Some(u) => vstr(u, "username").unwrap_or("").to_string(),
            None => "Unknown".to_string(),
        },
        artwork: t300(vstr(p, "artwork_url").or_else(|| vstr(p, "calculated_artwork_url"))),
        track_count: vu64(p, "track_count").unwrap_or(0),
        duration: vu64(p, "duration").unwrap_or(0),
        permalink: vstr(p, "permalink_url").map(String::from),
    }
}

fn has_id(v: &Value) -> bool {
    vu64(v, "id").is_some()
}

// ============================ Поиск ============================

pub async fn search_tracks(
    query: &str,
    limit: u32,
    offset: u32,
    sort: &str,
) -> Result<ScPage<ScRawTrack>> {
    let url = format!(
        "https://api-v2.soundcloud.com/search/tracks?q={}&limit={}&offset={}{}",
        urlencoding::encode(query),
        limit,
        offset,
        if sort == "new" { "&sort=created_at" } else { "" }
    );
    let data = api_fetch(&url, false).await?;
    if falsy(data.get("collection")) {
        return Ok(ScPage { items: vec![], has_more: false });
    }
    Ok(ScPage {
        items: varr(&data, "collection").iter().filter(|t| has_id(t)).map(map_raw_track).collect(),
        has_more: !falsy(data.get("next_href")),
    })
}

pub async fn search_artists(query: &str, limit: u32) -> Result<ScPage<ScRawArtist>> {
    let url = format!(
        "https://api-v2.soundcloud.com/search/users?q={}&limit={}",
        urlencoding::encode(query),
        limit
    );
    let data = api_fetch(&url, false).await?;
    if falsy(data.get("collection")) {
        return Ok(ScPage { items: vec![], has_more: false });
    }
    Ok(ScPage {
        items: varr(&data, "collection").iter().filter(|u| has_id(u)).map(map_raw_artist).collect(),
        has_more: !falsy(data.get("next_href")),
    })
}

async fn search_sets(url: String) -> Result<ScPage<ScRawPlaylist>> {
    let data = api_fetch(&url, false).await?;
    if falsy(data.get("collection")) {
        return Ok(ScPage { items: vec![], has_more: false });
    }
    Ok(ScPage {
        items: varr(&data, "collection").iter().filter(|p| has_id(p)).map(map_raw_playlist).collect(),
        has_more: !falsy(data.get("next_href")),
    })
}

pub async fn search_playlists(query: &str, limit: u32) -> Result<ScPage<ScRawPlaylist>> {
    search_sets(format!(
        "https://api-v2.soundcloud.com/search/playlists?q={}&limit={}",
        urlencoding::encode(query),
        limit
    ))
    .await
}

pub async fn search_albums(query: &str, limit: u32) -> Result<ScPage<ScRawPlaylist>> {
    search_sets(format!(
        "https://api-v2.soundcloud.com/search/albums?q={}&limit={}",
        urlencoding::encode(query),
        limit
    ))
    .await
}

/// Проверка соединения из настроек: сброс авто-кеша → тестовый поиск.
pub async fn check_connection() -> ScCheckResult {
    reset_auto_cache();
    match search_tracks("test", 1, 0, "relevance").await {
        Ok(_) => ScCheckResult { ok: true, client_id: active_client_id(), error: None },
        Err(e) => ScCheckResult {
            ok: false,
            client_id: active_client_id(),
            error: Some(e.to_string()),
        },
    }
}

// ============================ Артист / профиль ============================

/// Числовой userId из id-строки ("12345") или permalink-URL (через /resolve).
async fn resolve_user_id(id_or_url: &str) -> Result<u64> {
    if !id_or_url.is_empty() && id_or_url.bytes().all(|b| b.is_ascii_digit()) {
        return Ok(id_or_url.parse()?);
    }
    if id_or_url.contains("soundcloud.com") {
        let user = api_fetch(
            &format!("https://api-v2.soundcloud.com/resolve?url={}", urlencoding::encode(id_or_url)),
            false,
        )
        .await?;
        return vu64(&user, "id").ok_or_else(|| anyhow!("search.err.artistNotFound"));
    }
    bail!("search.err.artistUndetermined")
}

/// Плейлисты пользователя (профиль по ссылке); ошибки — пустой список.
pub async fn user_playlists(id_or_url: &str) -> Vec<ScRawPlaylist> {
    let inner = async {
        let id = resolve_user_id(id_or_url).await?;
        let d = api_fetch(&format!("https://api-v2.soundcloud.com/users/{id}/playlists?limit=50"), false)
            .await?;
        Ok::<_, anyhow::Error>(
            varr(&d, "collection").iter().filter(|p| has_id(p)).map(map_raw_playlist).collect(),
        )
    };
    inner.await.unwrap_or_default()
}

/// Лайкнутые треки пользователя (профиль по ссылке); ошибки — пустой список.
pub async fn user_likes(id_or_url: &str) -> Vec<ScRawTrack> {
    let inner = async {
        let id = resolve_user_id(id_or_url).await?;
        let d = api_fetch(&format!("https://api-v2.soundcloud.com/users/{id}/likes?limit=200"), false)
            .await?;
        Ok::<_, anyhow::Error>(
            varr(&d, "collection")
                .iter()
                .filter_map(|x| x.get("track"))
                .filter(|t| has_id(t))
                .map(map_raw_track)
                .collect(),
        )
    };
    inner.await.unwrap_or_default()
}

/// Разбор страницы ленты репостов + курсор следующей. `min_full` — размер
/// запрошенной страницы: пришло меньше → дальше пусто (SC отдаёт «висячий»
/// next_href на последней странице).
fn parse_reposts(d: &Value, min_full: usize) -> ScRepostsPage {
    let coll = varr(d, "collection");
    let raw_len = coll.len();
    let mut items = Vec::new();
    for x in coll {
        if !x.is_object() {
            continue;
        }
        let xtype = vstr(x, "type").unwrap_or("");
        // У некоторых ответов сущность лежит прямо в item, у других — в .track/.playlist.
        let tr = x
            .get("track")
            .filter(|v| v.is_object())
            .or(if xtype.contains("track") { Some(x) } else { None });
        let pl = x
            .get("playlist")
            .filter(|v| v.is_object())
            .or(if xtype.contains("playlist") { Some(x) } else { None });
        if let Some(t) = tr.filter(|t| has_id(t) && vstr(t, "title").is_some()) {
            items.push(ScRepostItem {
                kind: "track".into(),
                track: Some(map_raw_track(t)),
                playlist: None,
            });
        } else if let Some(p) = pl.filter(|p| has_id(p)) {
            let is_album = vbool(p, "is_album") || vstr(p, "set_type") == Some("album");
            items.push(ScRepostItem {
                kind: if is_album { "album" } else { "playlist" }.into(),
                track: None,
                playlist: Some(map_raw_playlist(p)),
            });
        }
    }
    let next = if raw_len >= min_full {
        vstr(d, "next_href").map(String::from)
    } else {
        None
    };
    ScRepostsPage { items, next }
}

/// Репосты артиста (первая страница); ошибки — пустая лента.
pub async fn artist_reposts(id_or_url: &str) -> ScRepostsPage {
    let inner = async {
        let id = resolve_user_id(id_or_url).await?;
        let d = api_fetch(
            &format!("https://api-v2.soundcloud.com/stream/users/{id}/reposts?limit=30&linked_partitioning=1"),
            false,
        )
        .await?;
        Ok::<_, anyhow::Error>(parse_reposts(&d, 30))
    };
    inner.await.unwrap_or(ScRepostsPage { items: vec![], next: None })
}

/// Следующая страница репостов по курсору (`next_href`).
pub async fn artist_reposts_page(cursor: &str) -> ScRepostsPage {
    static LIM_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[?&]limit=(\d+)").unwrap());
    let lim = LIM_RE
        .captures(cursor)
        .and_then(|c| c[1].parse::<usize>().ok())
        .unwrap_or(1);
    match api_fetch(cursor, false).await {
        Ok(d) => parse_reposts(&d, lim),
        Err(_) => ScRepostsPage { items: vec![], next: None },
    }
}

/// Данные пользователя (hero артиста); null при ошибке.
pub async fn get_user(id_or_url: &str) -> Option<ScRawUser> {
    let user_id = resolve_user_id(id_or_url).await.ok()?;
    let u = api_fetch(&format!("https://api-v2.soundcloud.com/users/{user_id}"), false)
        .await
        .ok()?;
    vu64(&u, "id")?;
    let banner = u
        .get("visuals")
        .and_then(|v| v.get("visuals"))
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .and_then(|v| v.get("visual_url"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(String::from);
    Some(ScRawUser {
        id: vu64(&u, "id").unwrap_or(0),
        username: vstr(&u, "username").unwrap_or("").to_string(),
        full_name: vstr(&u, "full_name").unwrap_or("").to_string(),
        avatar: t300(vstr(&u, "avatar_url")),
        banner,
        followers: vu64(&u, "followers_count").unwrap_or(0),
        track_count: vu64(&u, "track_count").unwrap_or(0),
        description: vstr(&u, "description").unwrap_or("").to_string(),
        website: vstr(&u, "website").map(String::from),
        permalink: vstr(&u, "permalink_url").map(String::from),
    })
}

/// Популярные треки артиста: /toptracks → /spotlight → /tracks → поиск по имени.
pub async fn artist_top_tracks(id_or_url: &str, artist_name: Option<&str>) -> Vec<ScRawTrack> {
    let user_id = resolve_user_id(id_or_url).await.unwrap_or(0);

    if user_id != 0 {
        // 1. /toptracks — настоящие «популярные».
        if let Ok(tt) = api_fetch(
            &format!("https://api-v2.soundcloud.com/users/{user_id}/toptracks?limit=20&linked_partitioning=1"),
            false,
        )
        .await
        {
            if !varr(&tt, "collection").is_empty() {
                return varr(&tt, "collection").iter().filter(|t| has_id(t)).map(map_raw_track).collect();
            }
        }
        // 2. /spotlight — закреплённые артистом.
        if let Ok(sp) = api_fetch(
            &format!("https://api-v2.soundcloud.com/users/{user_id}/spotlight?limit=10&linked_partitioning=1"),
            false,
        )
        .await
        {
            let trs: Vec<ScRawTrack> = varr(&sp, "collection")
                .iter()
                .filter(|x| vstr(x, "kind") == Some("track") && has_id(x))
                .map(map_raw_track)
                .collect();
            if !trs.is_empty() {
                return trs;
            }
        }
        // 3. /tracks (может требовать сессию).
        if let Ok(d) = api_fetch(
            &format!("https://api-v2.soundcloud.com/users/{user_id}/tracks?limit=50&linked_partitioning=1"),
            false,
        )
        .await
        {
            if !varr(&d, "collection").is_empty() {
                return varr(&d, "collection").iter().filter(|t| has_id(t)).map(map_raw_track).collect();
            }
        }
    }

    // 4. Фолбэк: поиск по имени артиста (точное совпадение → первые 20).
    if let Some(name) = artist_name.filter(|n| !n.is_empty()) {
        if let Ok(sr) = api_fetch(
            &format!(
                "https://api-v2.soundcloud.com/search/tracks?q={}&limit=30",
                urlencoding::encode(name)
            ),
            false,
        )
        .await
        {
            if sr.get("collection").is_some() {
                let nl = name.to_lowercase();
                let coll = varr(&sr, "collection");
                let matched: Vec<&Value> = coll
                    .iter()
                    .filter(|t| {
                        has_id(t)
                            && t.get("user")
                                .and_then(|u| vstr(u, "username"))
                                .map(|u| u.to_lowercase() == nl)
                                .unwrap_or(false)
                    })
                    .collect();
                if !matched.is_empty() {
                    return matched.into_iter().map(map_raw_track).collect();
                }
                return coll.iter().filter(|t| has_id(t)).take(20).map(map_raw_track).collect();
            }
        }
    }
    Vec::new()
}

/// Треки (первая страница + курсор) и альбомы артиста; фолбэк — поиск по имени.
pub async fn artist_data(id_or_url: &str, artist_name: Option<&str>) -> ScArtistData {
    let user_id = resolve_user_id(id_or_url).await.unwrap_or(0);

    let mut tracks = Vec::new();
    let mut tracks_next = None;
    if user_id != 0 {
        if let Ok(d) = api_fetch(
            &format!("https://api-v2.soundcloud.com/users/{user_id}/tracks?limit=50&linked_partitioning=1"),
            false,
        )
        .await
        {
            let coll = varr(&d, "collection");
            let raw_len = coll.len();
            tracks = coll.iter().filter(|t| has_id(t)).map(map_raw_track).collect();
            // SC отдаёт next_href даже на неполной/последней странице — считаем
            // последней, если пришло меньше лимита.
            tracks_next = if raw_len >= 50 { vstr(&d, "next_href").map(String::from) } else { None };
        }
    }

    let mut albums = Vec::new();
    if user_id != 0 {
        if let Ok(ad) = api_fetch(
            &format!("https://api-v2.soundcloud.com/users/{user_id}/albums?limit=20&linked_partitioning=1"),
            false,
        )
        .await
        {
            albums = varr(&ad, "collection").iter().filter(|p| has_id(p)).map(map_raw_playlist).collect();
        }
    }

    // Фолбэк: пусто — ищем по имени.
    if tracks.is_empty() && albums.is_empty() {
        if let Some(name) = artist_name.filter(|n| !n.is_empty()) {
            if let Ok(sr) = api_fetch(
                &format!(
                    "https://api-v2.soundcloud.com/search/tracks?q={}&limit=30",
                    urlencoding::encode(name)
                ),
                false,
            )
            .await
            {
                let nl = name.to_lowercase();
                let coll = varr(&sr, "collection");
                let matched: Vec<&Value> = coll
                    .iter()
                    .filter(|t| {
                        has_id(t)
                            && t.get("user")
                                .and_then(|u| vstr(u, "username"))
                                .map(|u| u.to_lowercase() == nl)
                                .unwrap_or(false)
                    })
                    .collect();
                tracks = if !matched.is_empty() {
                    matched.into_iter().map(map_raw_track).collect()
                } else {
                    coll.iter().filter(|t| has_id(t)).take(20).map(map_raw_track).collect()
                };
            }
        }
    }

    ScArtistData { tracks, tracks_next, albums, user_id }
}

/// Следующая страница треков артиста по курсору (`next_href`).
pub async fn artist_tracks_page(cursor: &str) -> ScTracksCursorPage {
    match api_fetch(cursor, false).await {
        Ok(d) => {
            let coll = varr(&d, "collection");
            let raw_len = coll.len();
            ScTracksCursorPage {
                tracks: coll.iter().filter(|t| has_id(t)).map(map_raw_track).collect(),
                // Пустая страница — конец (next_href может быть «висячим»).
                next: if raw_len > 0 { vstr(&d, "next_href").map(String::from) } else { None },
            }
        }
        Err(_) => ScTracksCursorPage { tracks: vec![], next: None },
    }
}

// ============================ Плейлисты / треки ============================

/// Треки из данных плейлиста: полные + дозагрузка stub'ов (только id) батчами по 50.
async fn load_tracks_from_playlist_data(data: &Value) -> Vec<ScRawTrack> {
    let all = varr(data, "tracks");
    let full: Vec<&Value> = all.iter().filter(|t| vstr(t, "title").is_some()).collect();
    let stubs: Vec<u64> = all
        .iter()
        .filter(|t| vstr(t, "title").is_none())
        .filter_map(|t| vu64(t, "id"))
        .collect();

    let mut fetched: Vec<Value> = Vec::new();
    for (i, chunk) in stubs.chunks(50).enumerate() {
        let ids = chunk.iter().map(|n| n.to_string()).collect::<Vec<_>>().join(",");
        if let Ok(batch) = api_fetch(&format!("https://api-v2.soundcloud.com/tracks?ids={ids}"), false).await
        {
            if let Some(arr) = batch.as_array() {
                fetched.extend(arr.iter().cloned());
            }
        }
        if (i + 1) * 50 < stubs.len() {
            tokio::time::sleep(Duration::from_millis(80)).await;
        }
    }

    full.into_iter()
        .cloned()
        .chain(fetched)
        .filter(|t| has_id(t))
        .map(|t| map_raw_track(&t))
        .collect()
}

/// Треки плейлиста/альбома по permalink-URL (ошибки пробрасываются — импорт
/// должен их показать).
pub async fn playlist_tracks(permalink_url: &str) -> Result<Vec<ScRawTrack>> {
    let data = api_fetch(
        &format!("https://api-v2.soundcloud.com/resolve?url={}", urlencoding::encode(permalink_url)),
        false,
    )
    .await?;
    Ok(load_tracks_from_playlist_data(&data).await)
}

/// Полные данные плейлиста по числовому SC-id (открытие из «недавних»).
pub async fn playlist_by_id(id: u64) -> Result<ScPlaylistFull> {
    let data = api_fetch(&format!("https://api-v2.soundcloud.com/playlists/{id}"), false).await?;
    let tracks = load_tracks_from_playlist_data(&data).await;
    let cover = t300(vstr(&data, "artwork_url").or_else(|| vstr(&data, "calculated_artwork_url")))
        .or_else(|| t300(data.get("user").and_then(|u| vstr(u, "avatar_url"))));
    Ok(ScPlaylistFull {
        title: vstr(&data, "title").unwrap_or("").to_string(),
        cover,
        owner_name: data.get("user").and_then(|u| vstr(u, "username")).unwrap_or("").to_string(),
        track_count: vu64(&data, "track_count").unwrap_or(tracks.len() as u64),
        tracks,
    })
}

/// Один трек по числовому SC-id; null при ошибке.
pub async fn track_by_id(id: u64) -> Option<ScRawTrack> {
    let data = api_fetch(&format!("https://api-v2.soundcloud.com/tracks/{id}"), false).await.ok()?;
    if !has_id(&data) {
        return None;
    }
    Some(map_raw_track(&data))
}

// ============================ Резолв ссылки ============================

/// SC-ссылка → сущность (трек / артист / плейлист / альбом); null если не распознали.
pub async fn resolve_url(url: &str) -> Result<Option<ScResolved>> {
    let mut u = url.trim().to_string();
    if !u.starts_with("http://") && !u.starts_with("https://") {
        u = format!("https://{u}");
    }
    let data = api_fetch(
        &format!("https://api-v2.soundcloud.com/resolve?url={}", urlencoding::encode(&u)),
        false,
    )
    .await?;
    let Some(kind) = vstr(&data, "kind") else { return Ok(None) };
    match kind {
        "track" => Ok(Some(ScResolved {
            kind: "track".into(),
            track: Some(map_raw_track(&data)),
            artist: None,
            playlist: None,
        })),
        "user" => Ok(Some(ScResolved {
            kind: "artist".into(),
            track: None,
            artist: Some(map_raw_artist(&data)),
            playlist: None,
        })),
        "playlist" => {
            let is_album = vbool(&data, "is_album") || vstr(&data, "set_type") == Some("album");
            Ok(Some(ScResolved {
                kind: if is_album { "album" } else { "playlist" }.into(),
                track: None,
                artist: None,
                playlist: Some(map_raw_playlist(&data)),
            }))
        }
        _ => Ok(None),
    }
}

// ============================ Стрим ============================

/// Играбельный signed CDN-URL из `media.transcodings`: progressive (mp3) → hls →
/// любой не-DRM; одна повторная попытка через 500мс (паритет с TS `getStreamUrl`).
pub async fn stream_url(media: Option<Value>) -> Result<ScStream> {
    let media = media.unwrap_or(Value::Null);
    let tcs = media.get("transcodings").and_then(Value::as_array).cloned().unwrap_or_default();
    if tcs.is_empty() {
        bail!("search.err.noStream");
    }

    let proto = |tc: &Value| {
        tc.get("format")
            .and_then(|f| f.get("protocol"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };
    let is_drm = |tc: &Value| proto(tc).to_lowercase().contains("encrypted");

    let prog = tcs.iter().find(|tc| proto(tc) == "progressive");
    let hls = tcs.iter().find(|tc| proto(tc) == "hls");
    let fallback = tcs.iter().find(|tc| {
        !is_drm(tc)
            && !prog.map(|p| std::ptr::eq(*tc, p)).unwrap_or(false)
            && !hls.map(|h| std::ptr::eq(*tc, h)).unwrap_or(false)
    });

    let mut order: Vec<&Value> = Vec::new();
    for tc in [prog, hls, fallback].into_iter().flatten() {
        if !is_drm(tc) && !order.iter().any(|o| std::ptr::eq(*o, tc)) {
            order.push(tc);
        }
    }
    let has_drm = tcs.iter().any(|tc| is_drm(tc));
    if order.is_empty() {
        bail!(if has_drm { "sc.err.drm" } else { "sc.err.noStream" });
    }

    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 0..2 {
        for tc in &order {
            let p = proto(tc);
            let is_hls = p == "hls" || p.contains("hls");
            let Some(tc_url) = vstr(tc, "url") else { continue };
            let sep = if tc_url.contains('?') { '&' } else { '?' };
            match api_fetch(&format!("{tc_url}{sep}_cb={}", now_millis()), false).await {
                Ok(data) => match vstr(&data, "url") {
                    Some(u) => return Ok(ScStream { url: u.to_string(), is_hls }),
                    None => last_err = Some(anyhow!("no url")),
                },
                Err(e) => last_err = Some(e),
            }
        }
        if has_drm {
            bail!("search.err.drm");
        }
        if attempt == 0 {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("sc.err.noStream")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Сетевой smoke против живого api-v2 (не для CI):
    /// `cargo test sc_smoke -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn sc_smoke() {
        // Поиск треков + маппинг.
        let page = search_tracks("daft punk", 5, 0, "relevance").await.expect("search_tracks");
        assert!(!page.items.is_empty(), "пустая выдача поиска");
        let t = &page.items[0];
        assert!(t.id > 0 && !t.title.is_empty());
        println!("track: {} — {} (id {}, media: {})", t.artist, t.title, t.id, t.media.is_some());

        // Резолв стрима из media.transcodings.
        let stream = stream_url(t.media.clone()).await.expect("stream_url");
        assert!(stream.url.starts_with("http"));
        println!("stream: hls={} url={}…", stream.is_hls, &stream.url[..60.min(stream.url.len())]);

        // Артист: поиск → профиль.
        let arts = search_artists("skrillex", 3).await.expect("search_artists");
        assert!(!arts.items.is_empty());
        let a = &arts.items[0];
        let user = get_user(&a.id.to_string()).await.expect("get_user");
        assert_eq!(user.id, a.id);
        println!("artist: {} (followers {})", user.username, user.followers);

        // Резолв permalink-ссылки трека.
        let resolved = resolve_url(t.permalink.as_deref().expect("permalink"))
            .await
            .expect("resolve_url");
        assert!(matches!(resolved, Some(ref r) if r.kind == "track"), "resolve не распознал трек");
        println!("resolve ok");
    }
}
