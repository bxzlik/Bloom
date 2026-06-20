//! Spotify Web API (официальный) — поиск/метаданные/страницы.
//!
//! Авторизация — **Client Credentials flow** (без логина пользователя, только
//! публичный каталог): `client_id`+`client_secret` приложения вводит пользователь
//! в настройках (config::SpotifyCreds), Rust обменивает их на bearer-токен
//! (кешируется до истечения). Секрет не покидает Rust.
//!
//! Воспроизведение/скачивание Spotify-треков идёт **бриджем на SoundCloud**
//! (Spotify не отдаёт прямой стрим) — это уже на фронте (см. spProvider).

use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};

use crate::config;

const API: &str = "https://api.spotify.com/v1";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const MARKET: &str = "US";

/// Кеш bearer-токена: (token, когда истекает). Обновляется лениво.
static TOKEN: Lazy<Mutex<Option<(String, Instant)>>> = Lazy::new(|| Mutex::new(None));

fn http() -> Result<reqwest::Client> {
    reqwest::Client::builder().build().context("reqwest client build")
}

// ============================ Авторизация ============================

/// Bearer-токен (из кеша либо свежий по Client Credentials). Бросает, если creds
/// не заданы или невалидны.
async fn get_token() -> Result<String> {
    if let Some((tok, exp)) = TOKEN.lock().as_ref() {
        if *exp > Instant::now() {
            return Ok(tok.clone());
        }
    }
    let creds = config::load_spotify()?;
    if creds.client_id.is_empty() || creds.client_secret.is_empty() {
        bail!("Spotify не настроен — укажите client_id и client_secret в настройках");
    }
    let basic = base64::engine::general_purpose::STANDARD
        .encode(format!("{}:{}", creds.client_id, creds.client_secret));
    let resp = http()?
        .post(TOKEN_URL)
        .header("Authorization", format!("Basic {basic}"))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .await
        .context("spotify token request")?;
    let status = resp.status();
    let v: Value = resp.json().await.context("spotify token json")?;
    if !status.is_success() {
        bail!(
            "Spotify авторизация: {}",
            v.get("error_description")
                .or_else(|| v.get("error"))
                .and_then(Value::as_str)
                .unwrap_or("неверные client_id/secret")
        );
    }
    let tok = v["access_token"]
        .as_str()
        .ok_or_else(|| anyhow!("Spotify: нет access_token"))?
        .to_string();
    let secs = v["expires_in"].as_u64().unwrap_or(3600);
    let exp = Instant::now() + Duration::from_secs(secs.saturating_sub(60));
    *TOKEN.lock() = Some((tok.clone(), exp));
    tracing::info!("spotify: token obtained (expires in {secs}s)");
    Ok(tok)
}

/// Проверка креденшелов (кнопка «Проверить» в настройках). Токен получить мало —
/// он выдаётся даже когда API заблокирован политикой Spotify (403 «Active premium
/// subscription required for the owner of the app»). Поэтому делаем реальный
/// лёгкий запрос к API — так 403 виден сразу в настройках, а не пустым поиском.
pub async fn check() -> Result<()> {
    *TOKEN.lock() = None; // принудительно свежий обмен
    get_token().await?;
    api_get("/search", &[("q", "test"), ("type", "track"), ("limit", "1")])
        .await
        .map(|_| ())
}

/// GET к API с bearer + одним ретраем на 401 (протухший токен).
async fn api_get(path: &str, query: &[(&str, &str)]) -> Result<Value> {
    for attempt in 0..2u8 {
        let token = get_token().await?;
        let resp = http()?
            .get(format!("{API}{path}"))
            .query(query)
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .context("spotify api request")?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
            *TOKEN.lock() = None; // протух — сбрасываем и пробуем ещё раз
            continue;
        }
        if !resp.status().is_success() {
            let st = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            let snippet: String = body.chars().take(300).collect();
            tracing::warn!("spotify api {path} -> {st}: {snippet}");
            bail!("Spotify API {st}: {snippet}");
        }
        return resp.json().await.context("spotify api json");
    }
    unreachable!()
}

// ============================ Типы выдачи ============================

#[derive(Serialize)]
pub struct SpTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(rename = "artistId")]
    pub artist_id: String,
    pub cover: String,
    /// Длительность в секундах.
    pub duration: u32,
}

#[derive(Serialize)]
pub struct SpArtist {
    pub id: String,
    pub name: String,
    pub cover: String,
}

#[derive(Serialize)]
pub struct SpAlbum {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub cover: String,
    pub year: String,
}

#[derive(Serialize)]
pub struct SpPlaylist {
    pub id: String,
    pub title: String,
    pub cover: String,
    #[serde(rename = "ownerName")]
    pub owner_name: String,
}

#[derive(Serialize)]
pub struct SpSearch {
    pub tracks: Vec<SpTrack>,
    pub artists: Vec<SpArtist>,
    pub albums: Vec<SpAlbum>,
    pub playlists: Vec<SpPlaylist>,
}

/// Страница сущности (альбом/артист/плейлист). Зеркало `ytm::YtmEntity`.
#[derive(Serialize)]
pub struct SpEntity {
    pub title: String,
    pub subtitle: String,
    pub cover: String,
    pub tracks: Vec<SpTrack>,
    #[serde(rename = "popularTracks")]
    pub popular_tracks: Vec<SpTrack>,
    pub albums: Vec<SpAlbum>,
}

// ============================ Парсинг ============================

/// Первая (самая крупная) обложка из `images[0].url`.
fn images_url(v: &Value) -> String {
    v["images"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|i| i.get("url"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// Имена артистов (джойн) + id первого.
fn artists_of(v: &Value) -> (String, String) {
    let arr = match v["artists"].as_array() {
        Some(a) => a,
        None => return (String::new(), String::new()),
    };
    let names: Vec<&str> = arr
        .iter()
        .filter_map(|a| a.get("name").and_then(Value::as_str))
        .collect();
    let id = arr
        .first()
        .and_then(|a| a.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    (names.join(", "), id)
}

/// Год из `release_date` ("YYYY" или "YYYY-MM-DD").
fn year_of(v: &Value) -> String {
    v["release_date"]
        .as_str()
        .map(|s| s.split('-').next().unwrap_or("").to_string())
        .unwrap_or_default()
}

/// Полный track-объект → SpTrack. `cover_fallback` — обложка альбома/плейлиста
/// для упрощённых треков (у них нет своего `album.images`).
fn parse_track(v: &Value, cover_fallback: &str) -> Option<SpTrack> {
    let id = v.get("id").and_then(Value::as_str)?;
    if id.is_empty() {
        return None;
    }
    let (artist, artist_id) = artists_of(v);
    let cover = {
        let c = images_url(&v["album"]);
        if c.is_empty() {
            cover_fallback.to_string()
        } else {
            c
        }
    };
    Some(SpTrack {
        id: id.to_string(),
        title: v["name"].as_str().unwrap_or("").to_string(),
        artist,
        artist_id,
        cover,
        duration: (v["duration_ms"].as_u64().unwrap_or(0) / 1000) as u32,
    })
}

fn parse_artist(v: &Value) -> Option<SpArtist> {
    let id = v.get("id").and_then(Value::as_str)?;
    Some(SpArtist {
        id: id.to_string(),
        name: v["name"].as_str().unwrap_or("").to_string(),
        cover: images_url(v),
    })
}

fn parse_album(v: &Value) -> Option<SpAlbum> {
    let id = v.get("id").and_then(Value::as_str)?;
    let (artist, _) = artists_of(v);
    Some(SpAlbum {
        id: id.to_string(),
        title: v["name"].as_str().unwrap_or("").to_string(),
        artist,
        cover: images_url(v),
        year: year_of(v),
    })
}

fn parse_playlist(v: &Value) -> Option<SpPlaylist> {
    let id = v.get("id").and_then(Value::as_str)?;
    Some(SpPlaylist {
        id: id.to_string(),
        title: v["name"].as_str().unwrap_or("").to_string(),
        cover: images_url(v),
        owner_name: v["owner"]["display_name"].as_str().unwrap_or("").to_string(),
    })
}

// ============================ Запросы ============================

pub async fn search(query: &str) -> Result<SpSearch> {
    let v = api_get(
        "/search",
        &[
            ("q", query),
            ("type", "track,artist,album,playlist"),
            ("market", MARKET),
            ("limit", "20"),
        ],
    )
    .await?;
    let items = |node: &Value| -> Vec<Value> {
        node["items"].as_array().cloned().unwrap_or_default()
    };
    let out = SpSearch {
        tracks: items(&v["tracks"])
            .iter()
            .filter_map(|t| parse_track(t, ""))
            .collect(),
        artists: items(&v["artists"]).iter().filter_map(parse_artist).collect(),
        albums: items(&v["albums"]).iter().filter_map(parse_album).collect(),
        // Элементы плейлистов в поиске иногда приходят как null — отфильтровываем.
        playlists: items(&v["playlists"])
            .iter()
            .filter(|p| p.is_object())
            .filter_map(parse_playlist)
            .collect(),
    };
    tracing::info!(
        "spotify search '{query}': tracks={} artists={} albums={} playlists={}",
        out.tracks.len(),
        out.artists.len(),
        out.albums.len(),
        out.playlists.len()
    );
    Ok(out)
}

pub async fn album(id: &str) -> Result<SpEntity> {
    let v = api_get(&format!("/albums/{id}"), &[("market", MARKET)]).await?;
    let cover = images_url(&v);
    let (artist, _) = artists_of(&v);
    let tracks = v["tracks"]["items"]
        .as_array()
        .map(|a| a.iter().filter_map(|t| parse_track(t, &cover)).collect())
        .unwrap_or_default();
    Ok(SpEntity {
        title: v["name"].as_str().unwrap_or("").to_string(),
        subtitle: artist,
        cover,
        tracks,
        popular_tracks: Vec::new(),
        albums: Vec::new(),
    })
}

pub async fn playlist(id: &str) -> Result<SpEntity> {
    let v = api_get(&format!("/playlists/{id}"), &[("market", MARKET)]).await?;
    let cover = images_url(&v);
    // Элементы плейлиста: { track: {...} } (track может быть null для удалённых).
    let tracks = v["tracks"]["items"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|it| parse_track(&it["track"], &cover))
                .collect()
        })
        .unwrap_or_default();
    Ok(SpEntity {
        title: v["name"].as_str().unwrap_or("").to_string(),
        subtitle: v["owner"]["display_name"].as_str().unwrap_or("").to_string(),
        cover,
        tracks,
        popular_tracks: Vec::new(),
        albums: Vec::new(),
    })
}

pub async fn artist(id: &str) -> Result<SpEntity> {
    let info = api_get(&format!("/artists/{id}"), &[]).await?;
    let top = api_get(&format!("/artists/{id}/top-tracks"), &[("market", MARKET)]).await?;
    let albums_r = api_get(
        &format!("/artists/{id}/albums"),
        &[("market", MARKET), ("include_groups", "album,single"), ("limit", "20")],
    )
    .await?;

    let popular_tracks = top["tracks"]
        .as_array()
        .map(|a| a.iter().filter_map(|t| parse_track(t, "")).collect())
        .unwrap_or_default();
    let albums = albums_r["items"]
        .as_array()
        .map(|a| a.iter().filter_map(parse_album).collect())
        .unwrap_or_default();

    Ok(SpEntity {
        title: info["name"].as_str().unwrap_or("").to_string(),
        subtitle: String::new(),
        cover: images_url(&info),
        tracks: Vec::new(),
        popular_tracks,
        albums,
    })
}

/// Один трек по id (для ре-резолва из «недавних»).
pub async fn track(id: &str) -> Result<SpTrack> {
    let v = api_get(&format!("/tracks/{id}"), &[("market", MARKET)]).await?;
    parse_track(&v, "").ok_or_else(|| anyhow!("Spotify: трек не найден"))
}
