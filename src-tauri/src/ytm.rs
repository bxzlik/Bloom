//! YouTube Music — неофициальный InnerTube API (`music.youtube.com/youtubei`).
//!
//! Как и `yandex.rs`, вся сеть живёт в Rust: у `music.youtube.com` нет CORS, а
//! аудио с `googlevideo.com` — range-based и не отдаётся в WebView2 напрямую
//! (идёт через локальный `audio_proxy`).
//!
//! Без авторизации (публичный поиск/стрим). Поиск — клиент `WEB_REMIX`, разбор
//! `musicResponsiveListItemRenderer`. Стрим — клиент `IOS` к `player`-эндпоинту:
//! он отдаёт `streamingData.adaptiveFormats[]` с ПРЯМЫМИ url (без расшифровки
//! signatureCipher / n-throttling), подход yt-dlp. Эти константы клиентов время
//! от времени приходится обновлять — все собраны вверху файла.

use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;
use serde_json::{json, Value};

const SEARCH_URL: &str = "https://music.youtube.com/youtubei/v1/search?prettyPrint=false";
const PLAYER_URL: &str = "https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false";

/// Веб-клиент YouTube Music — для поиска/браузинга (ключ публичный, общеизвестен).
const WEB_KEY: &str = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const WEB_CLIENT_NAME: &str = "WEB_REMIX";
const WEB_CLIENT_VERSION: &str = "1.20241127.01.00";
const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                      (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// iOS-клиент — для `player` (прямые аудио-url без дешифровки). Версию/UA
/// периодически обновлять под актуальный yt-dlp, если стрим начнёт ломаться.
const IOS_CLIENT_VERSION: &str = "19.45.4";
const IOS_UA: &str =
    "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)";

fn http() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .build()
        .context("reqwest client build")
}

// ============================ Типы выдачи ============================

/// Сырой трек для фронта (serde camelCase зеркалит TS YtmRawTrack).
#[derive(Serialize)]
pub struct YtmTrack {
    /// videoId YouTube.
    pub id: String,
    pub title: String,
    pub artist: String,
    /// browseId артиста (UC…) для перехода на страницу артиста; пусто если нет.
    #[serde(rename = "artistId")]
    pub artist_id: String,
    pub cover: String,
    /// Длительность в секундах.
    pub duration: u32,
}

#[derive(Serialize)]
pub struct YtmArtist {
    /// browseId (UC…).
    pub id: String,
    pub name: String,
    pub cover: String,
}

#[derive(Serialize)]
pub struct YtmAlbum {
    /// browseId (MPREb…).
    pub id: String,
    pub title: String,
    pub artist: String,
    pub cover: String,
    pub year: String,
}

#[derive(Serialize)]
pub struct YtmPlaylist {
    /// browseId (VL…/playlistId).
    pub id: String,
    pub title: String,
    pub cover: String,
    #[serde(rename = "ownerName")]
    pub owner_name: String,
}

#[derive(Serialize)]
pub struct YtmSearch {
    pub tracks: Vec<YtmTrack>,
    pub artists: Vec<YtmArtist>,
    pub albums: Vec<YtmAlbum>,
    pub playlists: Vec<YtmPlaylist>,
}

/// Страница сущности (альбом/артист/плейлист): шапка + треки + (артист) альбомы.
/// Зеркало `yandex::YmEntity`.
#[derive(Serialize)]
pub struct YtmEntity {
    pub title: String,
    pub subtitle: String,
    pub cover: String,
    pub tracks: Vec<YtmTrack>,
    /// Только для артиста: «Популярные» (top songs shelf).
    #[serde(rename = "popularTracks")]
    pub popular_tracks: Vec<YtmTrack>,
    pub albums: Vec<YtmAlbum>,
}

// ============================ Поиск ============================

/// Тело запроса InnerTube с веб-контекстом.
fn web_body(extra: Value) -> Value {
    let mut body = json!({
        "context": {
            "client": {
                "clientName": WEB_CLIENT_NAME,
                "clientVersion": WEB_CLIENT_VERSION,
                "hl": "en",
                "gl": "US",
            }
        }
    });
    if let (Some(obj), Some(ex)) = (body.as_object_mut(), extra.as_object()) {
        for (k, v) in ex {
            obj.insert(k.clone(), v.clone());
        }
    }
    body
}

pub async fn search(query: &str) -> Result<YtmSearch> {
    let body = web_body(json!({ "query": query }));
    let resp = http()?
        .post(format!("{SEARCH_URL}&key={WEB_KEY}"))
        .header("User-Agent", WEB_UA)
        .header("Origin", "https://music.youtube.com")
        .header("Referer", "https://music.youtube.com/")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("ytm search request")?;
    if !resp.status().is_success() {
        bail!("YouTube Music: поиск вернул {}", resp.status().as_u16());
    }
    let v: Value = resp.json().await.context("ytm search json")?;

    // Рекурсивно собираем все элементы строк (надёжнее навигации по точному пути —
    // структура секций меняется). Классифицируем по основному navigationEndpoint.
    let mut items: Vec<&Value> = Vec::new();
    collect_mrlir(&v, &mut items);

    let mut tracks = Vec::new();
    let mut artists = Vec::new();
    let mut albums = Vec::new();
    let mut playlists = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for it in items {
        match page_type(it) {
            Some("MUSIC_PAGE_TYPE_ARTIST") => {
                if artists.len() < 8 {
                    if let Some(a) = parse_artist(it) {
                        if seen.insert(a.id.clone()) {
                            artists.push(a);
                        }
                    }
                }
            }
            Some("MUSIC_PAGE_TYPE_ALBUM") => {
                if albums.len() < 12 {
                    if let Some(a) = parse_album(it) {
                        if seen.insert(a.id.clone()) {
                            albums.push(a);
                        }
                    }
                }
            }
            Some("MUSIC_PAGE_TYPE_PLAYLIST") | Some("MUSIC_PAGE_TYPE_AUDIOBOOK") => {
                if playlists.len() < 8 {
                    if let Some(p) = parse_playlist(it) {
                        if seen.insert(p.id.clone()) {
                            playlists.push(p);
                        }
                    }
                }
            }
            // Нет browse-страницы → это трек/видео (играбельный videoId).
            _ => {
                if tracks.len() < 20 {
                    if let Some(t) = parse_track(it) {
                        if seen.insert(t.id.clone()) {
                            tracks.push(t);
                        }
                    }
                }
            }
        }
    }

    Ok(YtmSearch {
        tracks,
        artists,
        albums,
        playlists,
    })
}

/// Рекурсивно собрать все `musicResponsiveListItemRenderer` из ответа.
fn collect_mrlir<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
    match v {
        Value::Object(map) => {
            for (k, val) in map {
                if k == "musicResponsiveListItemRenderer" {
                    out.push(val);
                }
                collect_mrlir(val, out);
            }
        }
        Value::Array(arr) => {
            for x in arr {
                collect_mrlir(x, out);
            }
        }
        _ => {}
    }
}

/// pageType основного перехода строки (ARTIST/ALBUM/PLAYLIST) либо None (трек).
fn page_type(it: &Value) -> Option<&str> {
    it.pointer(
        "/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/\
         browseEndpointContextMusicConfig/pageType",
    )
    .and_then(Value::as_str)
}

/// browseId основного перехода строки.
fn item_browse_id(it: &Value) -> Option<String> {
    it.pointer("/navigationEndpoint/browseEndpoint/browseId")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// flexColumn[i] → его узел `text` (с runs).
fn flex_text(it: &Value, i: usize) -> Option<&Value> {
    it.pointer(&format!(
        "/flexColumns/{i}/musicResponsiveListItemFlexColumnRenderer/text"
    ))
}

/// text.runs[0].text.
fn first_run(text: Option<&Value>) -> String {
    text.and_then(|t| t.pointer("/runs/0/text"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// Самая крупная обложка из `thumbnail.musicThumbnailRenderer...thumbnails`,
/// апскейл `=wNN-hNN` → 544.
fn thumb(it: &Value) -> String {
    let arr = it.pointer(
        "/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails",
    );
    let url = arr
        .and_then(Value::as_array)
        .and_then(|a| a.last())
        .and_then(|t| t.get("url"))
        .and_then(Value::as_str)
        .unwrap_or("");
    upscale_thumb(url)
}

fn upscale_thumb(url: &str) -> String {
    // YTM-обложки масштабируются параметрами в URL: =w120-h120 → =w544-h544.
    if let Some(i) = url.find("=w") {
        if let Some(rest) = url[i..].find('-').map(|d| i + d) {
            // ...=wNN-hNN[-...] — режем по второму токену.
            let tail = &url[rest + 1..];
            if let Some(h) = tail.strip_prefix('h') {
                let after = h.trim_start_matches(|c: char| c.is_ascii_digit());
                return format!("{}=w544-h544{}", &url[..i], after);
            }
        }
    }
    url.to_string()
}

fn parse_track(it: &Value) -> Option<YtmTrack> {
    let id = video_id(it)?;
    let title = first_run(flex_text(it, 0));
    if title.is_empty() {
        return None;
    }
    let col1 = flex_text(it, 1);
    let artist = col1_artist(col1);
    // browseId артиста: первый run в col1 с переходом на страницу артиста.
    let artist_id = col1
        .and_then(|t| t.get("runs"))
        .and_then(Value::as_array)
        .and_then(|runs| {
            runs.iter().find_map(|r| {
                let pt = r
                    .pointer(
                        "/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/\
                         browseEndpointContextMusicConfig/pageType",
                    )
                    .and_then(Value::as_str);
                if pt == Some("MUSIC_PAGE_TYPE_ARTIST") {
                    r.pointer("/navigationEndpoint/browseEndpoint/browseId")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                } else {
                    None
                }
            })
        })
        .unwrap_or_default();
    // Длительность: в строках поиска — в col1; в строках альбома — в fixedColumns.
    let duration = {
        let d = col1_duration(col1);
        if d > 0 {
            d
        } else {
            fixed_duration(it)
        }
    };
    Some(YtmTrack {
        id,
        title,
        artist,
        artist_id,
        cover: thumb(it),
        duration,
    })
}

/// Длительность из fixedColumns (строки альбома: "m:ss" в отдельной колонке).
fn fixed_duration(it: &Value) -> u32 {
    let s = it
        .pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/runs/0/text")
        .and_then(Value::as_str)
        .unwrap_or("");
    parse_clock(s).unwrap_or(0)
}

/// videoId трека: playlistItemData либо play-button overlay.
fn video_id(it: &Value) -> Option<String> {
    it.pointer("/playlistItemData/videoId")
        .and_then(Value::as_str)
        .or_else(|| {
            it.pointer(
                "/overlay/musicItemThumbnailOverlayRenderer/content/\
                 musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId",
            )
            .and_then(Value::as_str)
        })
        .map(str::to_string)
}

/// Имя артиста из col1. В неотфильтрованном поиске первый run — это ТИП
/// ("Song"/"Video"), поэтому `first_run` бесполезен. Берём runs со ссылкой на
/// артиста (pageType ARTIST); если их нет — первый смысловой run после типа
/// (пропустив тип и сепараторы " • ").
fn col1_artist(col1: Option<&Value>) -> String {
    let runs = match col1.and_then(|t| t.get("runs")).and_then(Value::as_array) {
        Some(r) => r,
        None => return String::new(),
    };
    let is_artist = |r: &Value| -> bool {
        r.pointer(
            "/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/\
             browseEndpointContextMusicConfig/pageType",
        )
        .and_then(Value::as_str)
            == Some("MUSIC_PAGE_TYPE_ARTIST")
    };
    // Артисты-ссылки (может быть несколько — джойним).
    let names: Vec<&str> = runs
        .iter()
        .filter(|r| is_artist(r))
        .filter_map(|r| r.get("text").and_then(Value::as_str))
        .collect();
    if !names.is_empty() {
        return names.join(", ");
    }
    // Фолбэк: первый текст после типа, не являющийся сепаратором.
    runs.iter()
        .skip(1)
        .filter_map(|r| r.get("text").and_then(Value::as_str))
        .find(|s| {
            let t = s.trim();
            !t.is_empty() && t != "•" && t != "&"
        })
        .unwrap_or("")
        .to_string()
}

/// Длительность из последнего run col1 формата "m:ss"/"h:mm:ss" → секунды.
fn col1_duration(col1: Option<&Value>) -> u32 {
    let runs = match col1.and_then(|t| t.get("runs")).and_then(Value::as_array) {
        Some(r) => r,
        None => return 0,
    };
    for r in runs.iter().rev() {
        if let Some(s) = r.get("text").and_then(Value::as_str) {
            if let Some(sec) = parse_clock(s) {
                return sec;
            }
        }
    }
    0
}

fn parse_clock(s: &str) -> Option<u32> {
    let parts: Vec<&str> = s.trim().split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return None;
    }
    let mut secs = 0u32;
    for p in &parts {
        let n: u32 = p.parse().ok()?;
        secs = secs * 60 + n;
    }
    Some(secs)
}

fn parse_artist(it: &Value) -> Option<YtmArtist> {
    let id = item_browse_id(it)?;
    let name = first_run(flex_text(it, 0));
    if name.is_empty() {
        return None;
    }
    Some(YtmArtist {
        id,
        name,
        cover: thumb(it),
    })
}

fn parse_album(it: &Value) -> Option<YtmAlbum> {
    let id = item_browse_id(it)?;
    let title = first_run(flex_text(it, 0));
    if title.is_empty() {
        return None;
    }
    let col1 = flex_text(it, 1);
    let artist = first_run(col1);
    // Год — 4-значный run в col1.
    let year = col1
        .and_then(|t| t.get("runs"))
        .and_then(Value::as_array)
        .and_then(|runs| {
            runs.iter().find_map(|r| {
                r.get("text").and_then(Value::as_str).filter(|s| {
                    s.len() == 4 && s.chars().all(|c| c.is_ascii_digit())
                })
            })
        })
        .unwrap_or("")
        .to_string();
    Some(YtmAlbum {
        id,
        title,
        artist,
        cover: thumb(it),
        year,
    })
}

fn parse_playlist(it: &Value) -> Option<YtmPlaylist> {
    let id = item_browse_id(it)?;
    let title = first_run(flex_text(it, 0));
    if title.is_empty() {
        return None;
    }
    Some(YtmPlaylist {
        id,
        title,
        cover: thumb(it),
        owner_name: first_run(flex_text(it, 1)),
    })
}

// ============================ Страницы (browse) ============================

const BROWSE_URL: &str = "https://music.youtube.com/youtubei/v1/browse?prettyPrint=false";

/// POST browse с веб-контекстом → сырой JSON ответа.
async fn browse(browse_id: &str) -> Result<Value> {
    let body = web_body(json!({ "browseId": browse_id }));
    let resp = http()?
        .post(format!("{BROWSE_URL}&key={WEB_KEY}"))
        .header("User-Agent", WEB_UA)
        .header("Origin", "https://music.youtube.com")
        .header("Referer", "https://music.youtube.com/")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("ytm browse request")?;
    if !resp.status().is_success() {
        bail!("YouTube Music: browse вернул {}", resp.status().as_u16());
    }
    resp.json().await.context("ytm browse json")
}

/// Альбом: шапка + треки (видео-id в строках, длительность в fixedColumns).
pub async fn album(browse_id: &str) -> Result<YtmEntity> {
    let v = browse(browse_id).await?;
    let h = header(&v);
    let cover = h.map(biggest_thumb).unwrap_or_default();
    let mut items = Vec::new();
    collect_mrlir(&v, &mut items);
    let tracks: Vec<YtmTrack> = items
        .iter()
        .filter_map(|it| parse_track(it))
        // У треков альбома часто нет своей обложки — подставляем обложку альбома.
        .map(|mut t| {
            if t.cover.is_empty() {
                t.cover = cover.clone();
            }
            t
        })
        .collect();
    Ok(YtmEntity {
        title: h.map(header_title).unwrap_or_default(),
        subtitle: h.map(header_subtitle).unwrap_or_default(),
        cover,
        tracks,
        popular_tracks: Vec::new(),
        albums: Vec::new(),
    })
}

/// Плейлист: шапка + треки. browseId плейлиста требует префикс `VL`.
pub async fn playlist(browse_id: &str) -> Result<YtmEntity> {
    let id = if browse_id.starts_with("VL") {
        browse_id.to_string()
    } else {
        format!("VL{browse_id}")
    };
    let v = browse(&id).await?;
    let h = header(&v);
    let cover = h.map(biggest_thumb).unwrap_or_default();
    let mut items = Vec::new();
    collect_mrlir(&v, &mut items);
    let tracks: Vec<YtmTrack> = items.iter().filter_map(|it| parse_track(it)).collect();
    Ok(YtmEntity {
        title: h.map(header_title).unwrap_or_default(),
        subtitle: h.map(header_subtitle).unwrap_or_default(),
        cover,
        tracks,
        popular_tracks: Vec::new(),
        albums: Vec::new(),
    })
}

/// Артист: «Популярные» (top songs shelf) + альбомы из каруселей.
pub async fn artist(browse_id: &str) -> Result<YtmEntity> {
    let v = browse(browse_id).await?;
    let h = header(&v);
    // popular: строки (mrlir) на странице артиста — это шелф «Песни».
    let mut items = Vec::new();
    collect_mrlir(&v, &mut items);
    let popular_tracks: Vec<YtmTrack> =
        items.iter().filter_map(|it| parse_track(it)).take(10).collect();
    // albums: musicTwoRowItemRenderer с browseId MPRE… из каруселей.
    let mut rows = Vec::new();
    collect_two_row(&v, &mut rows);
    let mut albums = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for r in rows {
        if let Some(a) = parse_two_row_album(r) {
            if seen.insert(a.id.clone()) {
                albums.push(a);
            }
        }
    }
    Ok(YtmEntity {
        title: h.map(header_title).unwrap_or_default(),
        subtitle: String::new(),
        cover: h.map(biggest_thumb).unwrap_or_default(),
        tracks: Vec::new(),
        popular_tracks,
        albums,
    })
}

/// Первый известный header-рендерер страницы.
fn header(v: &Value) -> Option<&Value> {
    for key in [
        "musicDetailHeaderRenderer",
        "musicResponsiveHeaderRenderer",
        "musicImmersiveHeaderRenderer",
        "musicVisualHeaderRenderer",
    ] {
        if let Some(h) = find_renderer(v, key) {
            return Some(h);
        }
    }
    None
}

fn header_title(h: &Value) -> String {
    h.pointer("/title/runs/0/text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// Подзаголовок шапки (артист/владелец) — джойн runs subtitle либо straplineTextOne.
fn header_subtitle(h: &Value) -> String {
    let from = |node: &Value| -> String {
        node.get("runs")
            .and_then(Value::as_array)
            .map(|runs| {
                runs.iter()
                    .filter_map(|r| r.get("text").and_then(Value::as_str))
                    .collect::<String>()
            })
            .unwrap_or_default()
    };
    let sub = from(&h["subtitle"]);
    if !sub.is_empty() {
        return sub;
    }
    from(&h["straplineTextOne"])
}

/// Первый рендерер по ключу (рекурсивно).
fn find_renderer<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    match v {
        Value::Object(map) => {
            if let Some(found) = map.get(key) {
                return Some(found);
            }
            for val in map.values() {
                if let Some(f) = find_renderer(val, key) {
                    return Some(f);
                }
            }
            None
        }
        Value::Array(arr) => arr.iter().find_map(|x| find_renderer(x, key)),
        _ => None,
    }
}

/// Самая крупная обложка из первого `thumbnails`-массива в поддереве (апскейл).
fn biggest_thumb(v: &Value) -> String {
    fn find_thumbs(v: &Value) -> Option<&Vec<Value>> {
        match v {
            Value::Object(map) => {
                if let Some(arr) = map.get("thumbnails").and_then(Value::as_array) {
                    return Some(arr);
                }
                map.values().find_map(find_thumbs)
            }
            Value::Array(arr) => arr.iter().find_map(find_thumbs),
            _ => None,
        }
    }
    let url = find_thumbs(v)
        .and_then(|a| a.last())
        .and_then(|t| t.get("url"))
        .and_then(Value::as_str)
        .unwrap_or("");
    upscale_thumb(url)
}

/// Рекурсивно собрать все `musicTwoRowItemRenderer` (карточки каруселей).
fn collect_two_row<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
    match v {
        Value::Object(map) => {
            for (k, val) in map {
                if k == "musicTwoRowItemRenderer" {
                    out.push(val);
                }
                collect_two_row(val, out);
            }
        }
        Value::Array(arr) => {
            for x in arr {
                collect_two_row(x, out);
            }
        }
        _ => {}
    }
}

/// musicTwoRowItemRenderer → альбом (только карточки с browseId MPRE…).
fn parse_two_row_album(it: &Value) -> Option<YtmAlbum> {
    let id = it
        .pointer("/navigationEndpoint/browseEndpoint/browseId")
        .and_then(Value::as_str)?;
    if !id.starts_with("MPRE") {
        return None; // не альбом (плейлист/видео карусель)
    }
    let title = it
        .pointer("/title/runs/0/text")
        .and_then(Value::as_str)
        .unwrap_or("");
    if title.is_empty() {
        return None;
    }
    let subtitle = it["subtitle"]
        .get("runs")
        .and_then(Value::as_array)
        .map(|runs| {
            runs.iter()
                .filter_map(|r| r.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default();
    // Год — последний 4-значный кусок subtitle.
    let year = subtitle
        .split(|c: char| !c.is_ascii_digit())
        .filter(|s| s.len() == 4)
        .last()
        .unwrap_or("")
        .to_string();
    Some(YtmAlbum {
        id: id.to_string(),
        title: title.to_string(),
        artist: subtitle,
        cover: biggest_thumb(it),
        year,
    })
}

// ============================ Стрим ============================

/// Запрос к player-эндпоинту iOS-клиентом (даёт прямые url + videoDetails).
async fn player(video_id: &str) -> Result<Value> {
    let body = json!({
        "context": {
            "client": {
                "clientName": "IOS",
                "clientVersion": IOS_CLIENT_VERSION,
                "deviceMake": "Apple",
                "deviceModel": "iPhone16,2",
                "osName": "iPhone",
                "osVersion": "18.1.0.22B83",
                "hl": "en",
                "gl": "US",
            }
        },
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
    });
    let resp = http()?
        .post(PLAYER_URL)
        .header("User-Agent", IOS_UA)
        .header("X-Goog-Api-Format-Version", "2")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("ytm player request")?;
    resp.json().await.context("ytm player json")
}

/// Метаданные одного трека по videoId (для ре-резолва из «недавних»).
pub async fn track(video_id: &str) -> Result<YtmTrack> {
    let v = player(video_id).await?;
    let d = &v["videoDetails"];
    let title = d["title"].as_str().unwrap_or("").to_string();
    if title.is_empty() {
        bail!("YouTube Music: трек не найден");
    }
    let duration = d["lengthSeconds"]
        .as_str()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    Ok(YtmTrack {
        id: video_id.to_string(),
        title,
        artist: d["author"].as_str().unwrap_or("").to_string(),
        artist_id: String::new(),
        cover: biggest_thumb(&d["thumbnail"]),
        duration,
    })
}

/// Прямой аудио-URL для videoId через iOS-клиент player-эндпоинта.
pub async fn stream_url(video_id: &str) -> Result<String> {
    let v = player(video_id).await?;

    let status = v
        .pointer("/playabilityStatus/status")
        .and_then(Value::as_str)
        .unwrap_or("");
    if status != "OK" {
        let reason = v
            .pointer("/playabilityStatus/reason")
            .and_then(Value::as_str)
            .unwrap_or("трек недоступен");
        bail!("YouTube Music: {reason}");
    }

    let formats = v
        .pointer("/streamingData/adaptiveFormats")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("Нет потоков для трека"))?;

    // Только audio-only форматы с прямым url. Предпочтение: m4a/aac (itag 140 —
    // максимально совместим с WebView2), затем opus, затем по битрейту.
    let mut best: Option<(&Value, i64)> = None;
    for f in formats {
        let mime = f.get("mimeType").and_then(Value::as_str).unwrap_or("");
        if !mime.starts_with("audio/") {
            continue;
        }
        if f.get("url").and_then(Value::as_str).is_none() {
            continue; // signatureCipher — пропускаем (iOS обычно отдаёт url)
        }
        let itag = f.get("itag").and_then(Value::as_i64).unwrap_or(0);
        let bitrate = f.get("bitrate").and_then(Value::as_i64).unwrap_or(0);
        // Приоритет: itag 140 выше всего, иначе ранжируем по битрейту.
        let score = if itag == 140 { 10_000_000 } else { bitrate };
        if best.map(|(_, s)| score > s).unwrap_or(true) {
            best = Some((f, score));
        }
    }

    let url = best
        .and_then(|(f, _)| f.get("url").and_then(Value::as_str))
        .ok_or_else(|| anyhow!("Нет доступного аудио-потока"))?;
    Ok(url.to_string())
}
