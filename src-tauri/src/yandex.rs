//! Яндекс.Музыка — неофициальный API (`api.music.yandex.net`).
//!
//! Все сетевые вызовы живут здесь, а не в JS: `api.music.yandex.net` не отдаёт
//! CORS-заголовки, поэтому из WebView2 напрямую не сходить, а гонять OAuth-токен
//! пользователя через публичные CORS-прокси недопустимо. reqwest из Rust ходит
//! без CORS, токен не покидает машину.
//!
//! Авторизация — OAuth Device Flow. Алгоритм подписи прямой ссылки и эндпоинты
//! воспроизведены по поведению неофициального API (референс — yandex-music-api
//! MarshalX), без копирования исходного кода.

use anyhow::{anyhow, bail, Context, Result};
use md5::{Digest, Md5};
use serde::Serialize;

const API: &str = "https://api.music.yandex.net";
const OAUTH: &str = "https://oauth.yandex.ru";
/// Публичные константы клиента приложения Яндекс.Музыка (общеизвестны, не секрет).
const CLIENT_ID: &str = "23cabbbdc6cd418abb4b39c32c41195d";
const CLIENT_SECRET: &str = "53bc75238f0c4d08a118e51fe9203300";
/// Соль для подписи прямой mp3-ссылки. Стабильна годами во всех клиентах.
const SIGN_SALT: &str = "XGRlBW9FXlekgbPrRHuSiA";
const UA: &str = "Yandex-Music-API";
const YM_CLIENT: &str = "YandexMusicAndroid/24023621";

fn http() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .context("reqwest client build")
}

/// Стабильный device_id на машину (без новых зависимостей): первые 16 hex
/// от md5 пути LocalAppData. Яндекс не валидирует его строго, важна лишь
/// стабильность между запусками.
fn device_id() -> String {
    let seed = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "bloom".into());
    let mut h = Md5::new();
    h.update(format!("{seed}|bloom-ym").as_bytes());
    hex_lower(&h.finalize())[..16].to_string()
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

// ============================ Device Flow ============================

#[derive(Serialize, Clone)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_url: String,
    pub interval: u64,
    pub expires_in: u64,
}

/// Шаг 1: получить код устройства и ссылку для подтверждения.
pub async fn auth_start() -> Result<DeviceCode> {
    let did = device_id();
    let params = [
        ("client_id", CLIENT_ID),
        ("device_id", did.as_str()),
        ("device_name", "Bloom"),
    ];
    let resp = http()?
        .post(format!("{OAUTH}/device/code"))
        .form(&params)
        .send()
        .await
        .context("device/code request")?;

    let status = resp.status();
    let v: serde_json::Value = resp.json().await.context("device/code json")?;
    if !status.is_success() {
        bail!(
            "Яндекс OAuth: {}",
            v.get("error_description")
                .and_then(|x| x.as_str())
                .unwrap_or("device/code failed")
        );
    }
    Ok(DeviceCode {
        device_code: v["device_code"].as_str().unwrap_or_default().to_string(),
        user_code: v["user_code"].as_str().unwrap_or_default().to_string(),
        verification_url: v["verification_url"]
            .as_str()
            .unwrap_or("https://ya.ru/device")
            .to_string(),
        interval: v["interval"].as_u64().unwrap_or(5),
        expires_in: v["expires_in"].as_u64().unwrap_or(300),
    })
}

/// Результат одного опроса токена.
pub enum PollOutcome {
    /// Пользователь ещё не подтвердил — опросить позже.
    Pending,
    /// Готово — access-токен.
    Token(String),
}

/// Шаг 2: один опрос — обменять device_code на токен.
/// `Pending` — продолжать поллинг; `Err` — фатально (истёк/отклонён).
pub async fn auth_poll(device_code: &str) -> Result<PollOutcome> {
    let params = [
        ("grant_type", "device_code"),
        ("code", device_code),
        ("client_id", CLIENT_ID),
        ("client_secret", CLIENT_SECRET),
    ];
    let resp = http()?
        .post(format!("{OAUTH}/token"))
        .form(&params)
        .send()
        .await
        .context("oauth/token request")?;

    let v: serde_json::Value = resp.json().await.context("oauth/token json")?;
    if let Some(token) = v.get("access_token").and_then(|x| x.as_str()) {
        return Ok(PollOutcome::Token(token.to_string()));
    }
    match v.get("error").and_then(|x| x.as_str()) {
        Some("authorization_pending") | Some("slow_down") => Ok(PollOutcome::Pending),
        Some(e) => bail!("Авторизация не завершена: {e}"),
        None => bail!("Неожиданный ответ OAuth"),
    }
}

// ============================ Search ============================

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct YmTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    /// id первого артиста (для перехода на страницу артиста).
    pub artist_id: String,
    /// Полный https-URL обложки 400x400 (или пусто).
    pub cover: String,
    /// Длительность в секундах.
    pub duration: f64,
    /// Год релиза (из первого альбома трека) или пусто. Для фильтра по году.
    pub year: String,
    pub available: bool,
}

fn cover_url(cover_uri: Option<&str>) -> String {
    match cover_uri {
        Some(u) if !u.is_empty() => format!("https://{}", u.replace("%%", "400x400")),
        _ => String::new(),
    }
}

fn parse_track(t: &serde_json::Value) -> Option<YmTrack> {
    let id = match &t["id"] {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        _ => return None,
    };
    let artist = t["artists"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x["name"].as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Неизвестен".into());
    let artist_id = t["artists"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|x| id_str(&x["id"]))
        .unwrap_or_default();
    Some(YmTrack {
        id,
        title: t["title"].as_str().unwrap_or("Без названия").to_string(),
        artist,
        artist_id,
        cover: cover_url(t["coverUri"].as_str()),
        duration: t["durationMs"].as_f64().unwrap_or(0.0) / 1000.0,
        // Год из первого альбома трека — в ответе /search он уже есть,
        // доп. запросов не нужно. Нет года → пусто (фильтр пропустит).
        year: t["albums"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|al| al["year"].as_i64())
            .map(|y| y.to_string())
            .unwrap_or_default(),
        available: t["available"].as_bool().unwrap_or(true),
    })
}

// ---- Сущности: артист / альбом / плейлист / страница-деталь ----

fn id_str(v: &serde_json::Value) -> Option<String> {
    match v {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Обложка из разных мест JSON (coverUri | cover.uri | ogImage).
fn cover_from(v: &serde_json::Value) -> String {
    if let Some(u) = v["coverUri"].as_str() {
        return cover_url(Some(u));
    }
    if let Some(u) = v["cover"]["uri"].as_str() {
        return cover_url(Some(u));
    }
    if let Some(u) = v["ogImage"].as_str() {
        return cover_url(Some(u));
    }
    String::new()
}

fn artists_join(v: &serde_json::Value) -> String {
    v["artists"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x["name"].as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "—".into())
}

#[derive(Serialize, Clone)]
pub struct YmArtist {
    pub id: String,
    pub name: String,
    pub cover: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct YmAlbum {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub cover: String,
    pub year: String,
    pub track_count: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct YmPlaylist {
    pub kind: String,
    pub owner: String,
    pub title: String,
    pub cover: String,
    pub track_count: i64,
}

fn parse_artist(a: &serde_json::Value) -> Option<YmArtist> {
    Some(YmArtist {
        id: id_str(&a["id"])?,
        name: a["name"].as_str().unwrap_or("—").to_string(),
        cover: cover_from(a),
    })
}

fn parse_album(a: &serde_json::Value) -> Option<YmAlbum> {
    Some(YmAlbum {
        id: id_str(&a["id"])?,
        title: a["title"].as_str().unwrap_or("—").to_string(),
        artist: artists_join(a),
        cover: cover_from(a),
        year: a["year"].as_i64().map(|y| y.to_string()).unwrap_or_default(),
        track_count: a["trackCount"].as_i64().unwrap_or(0),
    })
}

fn parse_playlist(p: &serde_json::Value) -> Option<YmPlaylist> {
    let kind = id_str(&p["kind"])?;
    let owner = p["owner"]["login"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| id_str(&p["owner"]["uid"]))
        .or_else(|| id_str(&p["uid"]))
        .unwrap_or_default();
    Some(YmPlaylist {
        kind,
        owner,
        title: p["title"].as_str().unwrap_or("—").to_string(),
        cover: cover_from(p),
        track_count: p["trackCount"].as_i64().unwrap_or(0),
    })
}

/// Страница сущности (альбом/артист/плейлист): шапка + треки + (для
/// артиста) его альбомы.
#[derive(Serialize)]
pub struct YmEntity {
    pub title: String,
    pub subtitle: String,
    pub cover: String,
    /// Основной список треков (для альбома/плейлиста — все; для артиста — вся
    /// дискография из `/artists/{id}/tracks`, секция «Треки»).
    pub tracks: Vec<YmTrack>,
    /// Только для артиста: «Популярные» из brief-info (секция «Популярные»).
    #[serde(rename = "popularTracks", default)]
    pub popular_tracks: Vec<YmTrack>,
    #[serde(default)]
    pub albums: Vec<YmAlbum>,
}

/// Результат поиска по всем категориям.
#[derive(Serialize)]
pub struct YmSearch {
    pub tracks: Vec<YmTrack>,
    pub artists: Vec<YmArtist>,
    pub albums: Vec<YmAlbum>,
    pub playlists: Vec<YmPlaylist>,
}

/// Результат резолва ссылки. tag = "kind" → JSON {"kind":"album", ...}.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum YmResolved {
    Track { track: YmTrack },
    Album { entity: YmEntity },
    Artist { entity: YmEntity },
    Playlist { entity: YmEntity },
}

/// GET к API с авторизацией + единая обработка 401/JSON.
async fn api_get(token: &str, url: &str, query: &[(&str, &str)]) -> Result<serde_json::Value> {
    // Лёгкий ретрай на транзиентные сбои (сеть/5xx/429), как у SC apiFetch:
    // 3 попытки, бэкофф 600мс. 401 — фатально (не ретраим). Без этого
    // одиночный сетевой блип ронял весь поиск (allSettled тоже нет).
    // landing3 (чарты/новинки) особенно любит отдавать 5xx/битое тело —
    // ретраим и провал разбора JSON (200 с оборванным телом).
    const MAX_ATTEMPTS: u8 = 3;
    let mut attempt = 0u8;
    loop {
        attempt += 1;
        let sent = http()?
            .get(url)
            .query(query)
            .header("Authorization", format!("OAuth {token}"))
            .header("X-Yandex-Music-Client", YM_CLIENT)
            .send()
            .await;
        let transient = match &sent {
            Ok(r) => {
                let s = r.status().as_u16();
                s == 429 || (500..=599).contains(&s)
            }
            Err(_) => true, // сетевая ошибка — транзиентна
        };
        if transient && attempt < MAX_ATTEMPTS {
            tokio::time::sleep(std::time::Duration::from_millis(600)).await;
            continue;
        }
        let resp = sent.context("api request")?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            bail!("Токен Яндекс.Музыки недействителен — авторизуйся заново");
        }
        match resp.json().await.context("api json") {
            Ok(v) => return Ok(v),
            Err(e) if attempt < MAX_ATTEMPTS => {
                tokio::time::sleep(std::time::Duration::from_millis(600)).await;
                let _ = e;
                continue;
            }
            Err(e) => return Err(e),
        }
    }
}

pub async fn search(token: &str, query: &str, page: u32) -> Result<YmSearch> {
    let page_s = page.to_string();
    let v = api_get(
        token,
        &format!("{API}/search"),
        &[
            ("text", query),
            ("type", "all"),
            ("page", &page_s),
            ("nocorrect", "false"),
        ],
    )
    .await?;
    let r = &v["result"];
    let list = |node: &serde_json::Value| -> Vec<serde_json::Value> {
        node["results"].as_array().cloned().unwrap_or_default()
    };
    Ok(YmSearch {
        tracks: list(&r["tracks"])
            .iter()
            .filter_map(parse_track)
            .take(24)
            .collect(),
        artists: list(&r["artists"])
            .iter()
            .filter_map(parse_artist)
            .take(12)
            .collect(),
        albums: list(&r["albums"])
            .iter()
            .filter_map(parse_album)
            .take(18)
            .collect(),
        playlists: list(&r["playlists"])
            .iter()
            .filter_map(parse_playlist)
            .take(12)
            .collect(),
    })
}

/// Один трек по id (для резолва ссылок вида .../track/{id}).
async fn track_one(token: &str, id: &str) -> Result<YmTrack> {
    let v = api_get(token, &format!("{API}/tracks/{id}"), &[]).await?;
    v["result"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(parse_track)
        .ok_or_else(|| anyhow!("Трек не найден"))
}

/// id трека из элемента popularTracks/коллекции: либо полный объект-трек, либо
/// `{id, albumId}`, либо bare id (строка/число).
fn track_id_of(v: &serde_json::Value) -> Option<String> {
    if v.is_object() {
        id_str(&v["id"])
    } else {
        id_str(v)
    }
}

/// Пачка полных треков по id одним запросом `/tracks/{id1,id2,...}`.
async fn tracks_by_ids(token: &str, ids: &[String]) -> Result<Vec<YmTrack>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let joined = ids.join(",");
    let v = api_get(token, &format!("{API}/tracks/{joined}"), &[]).await?;
    Ok(v["result"]
        .as_array()
        .map(|a| a.iter().filter_map(parse_track).collect())
        .unwrap_or_default())
}

pub async fn album(token: &str, id: &str) -> Result<YmEntity> {
    let v = api_get(token, &format!("{API}/albums/{id}/with-tracks"), &[]).await?;
    let r = &v["result"];
    let mut tracks = Vec::new();
    if let Some(vols) = r["volumes"].as_array() {
        for vol in vols {
            if let Some(arr) = vol.as_array() {
                tracks.extend(arr.iter().filter_map(parse_track));
            }
        }
    }
    Ok(YmEntity {
        title: r["title"].as_str().unwrap_or("Альбом").to_string(),
        subtitle: artists_join(r),
        cover: cover_from(r),
        tracks,
        popular_tracks: Vec::new(),
        albums: Vec::new(),
    })
}

/// Вся дискография артиста (секция «Треки») — `/artists/{id}/tracks`, первая
/// страница (page-size=50). Полные объекты-треки, parse_track работает.
async fn artist_tracks(token: &str, id: &str) -> Result<Vec<YmTrack>> {
    let v = api_get(
        token,
        &format!("{API}/artists/{id}/tracks"),
        &[("page", "0"), ("page-size", "50")],
    )
    .await?;
    Ok(v["result"]["tracks"]
        .as_array()
        .map(|arr| arr.iter().filter_map(parse_track).collect())
        .unwrap_or_default())
}

pub async fn artist(token: &str, id: &str) -> Result<YmEntity> {
    let v = api_get(token, &format!("{API}/artists/{id}/brief-info"), &[]).await?;
    let r = &v["result"];
    let a = &r["artist"];
    let pop = r["popularTracks"].as_array();
    // brief-info часто отдаёт popularTracks как id / {id, albumId} БЕЗ метаданных →
    // parse_track даёт пусто или «Без названия». В этом случае дотягиваем полные
    // треки одним запросом /tracks (иначе «Популярные» пусты).
    let mut popular_tracks: Vec<YmTrack> = pop
        .map(|arr| arr.iter().filter_map(parse_track).collect())
        .unwrap_or_default();
    let needs_fetch =
        popular_tracks.is_empty() || popular_tracks.iter().all(|t| t.title == "Без названия");
    if needs_fetch {
        if let Some(arr) = pop {
            let ids: Vec<String> = arr.iter().filter_map(track_id_of).collect();
            let full = tracks_by_ids(token, &ids).await.unwrap_or_default();
            if !full.is_empty() {
                popular_tracks = full;
            }
        }
    }
    // Полная дискография (секция «Треки», как на SoundCloud). Best-effort —
    // если эндпоинт не отдал, остаются хотя бы «Популярные».
    let tracks = artist_tracks(token, id).await.unwrap_or_default();
    let albums = r["albums"]
        .as_array()
        .map(|arr| arr.iter().filter_map(parse_album).take(18).collect())
        .unwrap_or_default();
    Ok(YmEntity {
        title: a["name"].as_str().unwrap_or("Артист").to_string(),
        subtitle: "Артист".into(),
        cover: cover_from(a),
        tracks,
        popular_tracks,
        albums,
    })
}

/// Разобрать `result`-объект плейлиста (общий для обоих форматов URL) в YmEntity.
fn playlist_entity(r: &serde_json::Value) -> YmEntity {
    let tracks = r["tracks"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|w| {
                    if w["track"].is_object() {
                        parse_track(&w["track"])
                    } else {
                        parse_track(w)
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    // Владелец: плоский ownerName (старый формат) ИЛИ вложенный owner.name/login (новый).
    let owner = r["ownerName"]
        .as_str()
        .or_else(|| r["owner"]["name"].as_str())
        .or_else(|| r["owner"]["login"].as_str())
        .unwrap_or("Плейлист");
    YmEntity {
        title: r["title"].as_str().unwrap_or("Плейлист").to_string(),
        subtitle: owner.to_string(),
        cover: cover_from(r),
        tracks,
        popular_tracks: Vec::new(),
        albums: Vec::new(),
    }
}

/// Старый формат плейлиста: /users/<owner>/playlists/<kind>.
pub async fn playlist(token: &str, owner: &str, kind: &str) -> Result<YmEntity> {
    let v = api_get(
        token,
        &format!("{API}/users/{owner}/playlists/{kind}"),
        &[],
    )
    .await?;
    Ok(playlist_entity(&v["result"]))
}

/// Новый формат публичного плейлиста: /playlists/<uuid> → API /playlist/<uuid>.
pub async fn playlist_by_uuid(token: &str, uuid: &str) -> Result<YmEntity> {
    let v = api_get(
        token,
        &format!("{API}/playlist/{uuid}"),
        &[("rich-tracks", "true")],
    )
    .await?;
    Ok(playlist_entity(&v["result"]))
}

/// Резолв ссылки music.yandex.ru (.com): трек/альбом/артист/плейлист.
pub async fn resolve(token: &str, url: &str) -> Result<YmResolved> {
    let u = url.trim();
    let cap = |re: &str| regex::Regex::new(re).ok().and_then(|r| r.captures(u).map(|c| {
        (1..c.len()).map(|i| c.get(i).map(|m| m.as_str().to_string()).unwrap_or_default()).collect::<Vec<_>>()
    }));
    if let Some(c) = cap(r"/album/\d+/track/(\d+)") {
        return Ok(YmResolved::Track { track: track_one(token, &c[0]).await? });
    }
    if let Some(c) = cap(r"/track/(\d+)") {
        return Ok(YmResolved::Track { track: track_one(token, &c[0]).await? });
    }
    if let Some(c) = cap(r"/album/(\d+)") {
        return Ok(YmResolved::Album { entity: album(token, &c[0]).await? });
    }
    if let Some(c) = cap(r"/artist/(\d+)") {
        return Ok(YmResolved::Artist { entity: artist(token, &c[0]).await? });
    }
    if let Some(c) = cap(r"/users/([^/?#]+)/playlists/(\d+)") {
        return Ok(YmResolved::Playlist { entity: playlist(token, &c[0], &c[1]).await? });
    }
    // Новый публичный формат: /playlists/<id>, где id = uuid (8-4-4-4-12 hex) ИЛИ
    // префиксный (напр. `lk.<uuid>` — «Мне нравится»). Идентификатор передаём в
    // /playlist/<id> как есть, целиком (как LavaSrc) — без срезания префикса.
    if let Some(c) = cap(r"/playlists/([0-9A-Za-z.-]+)") {
        return Ok(YmResolved::Playlist { entity: playlist_by_uuid(token, &c[0]).await? });
    }
    bail!("Не удалось разобрать ссылку Яндекс.Музыки")
}

// ======================= Чарты и новинки (главная) =======================

/// Общий чарт Яндекс.Музыки (топ треков) для витрины на главной.
/// `/landing3/chart` → `result.chart.tracks[]`, где каждый элемент несёт `.track`
/// (иногда сам элемент уже трек — обрабатываем оба случая).
pub async fn chart(token: &str) -> Result<Vec<YmTrack>> {
    let v = api_get(token, &format!("{API}/landing3/chart"), &[]).await?;
    let arr = v["result"]["chart"]["tracks"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let tracks = arr
        .iter()
        .map(|it| if it.get("track").is_some() { &it["track"] } else { it })
        .filter_map(parse_track)
        .take(30)
        .collect();
    Ok(tracks)
}

/// Новинки (свежие альбомы) для витрины на главной. Основной путь —
/// `landing3?blocks=new-releases` (полные альбомы в `entities[].data`). Фолбэк —
/// `/landing3/new-releases` (id-шники) с добором через `/albums`.
pub async fn new_releases(token: &str) -> Result<Vec<YmAlbum>> {
    let v = api_get(token, &format!("{API}/landing3"), &[("blocks", "new-releases")]).await?;
    let mut out: Vec<YmAlbum> = Vec::new();
    if let Some(blocks) = v["result"]["blocks"].as_array() {
        for b in blocks {
            if let Some(ents) = b["entities"].as_array() {
                for e in ents {
                    // entity.data — полный альбом; иногда сам entity уже альбом.
                    let data = if e["data"].is_object() { &e["data"] } else { e };
                    if let Some(al) = parse_album(data) {
                        out.push(al);
                        if out.len() >= 24 {
                            return Ok(out);
                        }
                    }
                }
            }
        }
    }
    if out.is_empty() {
        out = new_releases_by_ids(token).await.unwrap_or_default();
    }
    Ok(out)
}

/// Фолбэк новинок: `/landing3/new-releases` отдаёт `newReleases[]` = id альбомов,
/// добираем полные объекты одним запросом `/albums?album-ids=...`.
async fn new_releases_by_ids(token: &str) -> Result<Vec<YmAlbum>> {
    let v = api_get(token, &format!("{API}/landing3/new-releases"), &[]).await?;
    let ids: Vec<String> = v["result"]["newReleases"]
        .as_array()
        .map(|a| a.iter().filter_map(id_str).take(24).collect())
        .unwrap_or_default();
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let joined = ids.join(",");
    let av = api_get(token, &format!("{API}/albums"), &[("album-ids", joined.as_str())]).await?;
    Ok(av["result"]
        .as_array()
        .map(|a| a.iter().filter_map(parse_album).collect())
        .unwrap_or_default())
}

// ============================ Моя волна (rotor) ============================

#[derive(Serialize)]
pub struct YmWave {
    pub tracks: Vec<YmTrack>,
    pub batch_id: String,
}

/// Станция «Моей волны» по умолчанию. Rotor принимает и другие сиды в том же
/// формате: `track:<id>` (волна по треку), `artist:<id>`, `genre:<tag>` и т.д.
pub const WAVE_STATION: &str = "user:onyourwave";

/// Очередной батч rotor-станции. `station` — сид (`user:onyourwave`,
/// `track:<id>`, …); `last_id` — id последнего сыгранного трека (для продолжения
/// цепочки), пусто = старт станции.
pub async fn wave_tracks(token: &str, station: &str, last_id: &str) -> Result<YmWave> {
    let station = if station.is_empty() { WAVE_STATION } else { station };
    let mut q: Vec<(&str, &str)> = vec![("settings2", "true")];
    if !last_id.is_empty() {
        q.push(("queue", last_id));
    }
    let v = api_get(
        token,
        &format!("{API}/rotor/station/{station}/tracks"),
        &q,
    )
    .await?;
    let r = &v["result"];
    let tracks = r["sequence"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|x| {
                    if x["track"].is_object() {
                        parse_track(&x["track"])
                    } else {
                        parse_track(x)
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(YmWave {
        tracks,
        batch_id: r["batchId"].as_str().unwrap_or("").to_string(),
    })
}

/// Фидбек станции (radioStarted/trackStarted/trackFinished/skip) — обучает
/// «Мою волну» в аккаунте. Best-effort: ошибки не критичны.
pub async fn wave_feedback(
    token: &str,
    station: &str,
    event: &str,
    track_id: &str,
    batch_id: &str,
    played: f64,
) -> Result<()> {
    let station = if station.is_empty() { WAVE_STATION } else { station };
    let now = chrono::Utc::now().to_rfc3339();
    let mut body = serde_json::json!({
        "type": event,
        "timestamp": now,
        "from": "desktop",
    });
    if !track_id.is_empty() {
        body["trackId"] = serde_json::Value::String(track_id.to_string());
    }
    if event == "trackFinished" || event == "skip" {
        body["totalPlayedSeconds"] =
            serde_json::Value::from((played * 10.0).round() / 10.0);
    }
    let mut url = format!("{API}/rotor/station/{station}/feedback");
    if !batch_id.is_empty() {
        url.push_str(&format!("?batch-id={batch_id}"));
    }
    let _ = http()?
        .post(&url)
        .header("Authorization", format!("OAuth {token}"))
        .header("X-Yandex-Music-Client", YM_CLIENT)
        .json(&body)
        .send()
        .await;
    Ok(())
}

// ============================ Account ============================

/// Есть ли у аккаунта активный Яндекс Плюс. Используется фронтом, чтобы
/// заранее выбрать источник (Яндекс vs SoundCloud). Воспроизведение всё
/// равно делает per-track fallback, это только для UX-бейджа.
pub async fn has_plus(token: &str) -> Result<bool> {
    let resp = http()?
        .get(format!("{API}/account/status"))
        .header("Authorization", format!("OAuth {token}"))
        .header("X-Yandex-Music-Client", YM_CLIENT)
        .send()
        .await
        .context("account/status request")?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        bail!("Токен Яндекс.Музыки недействителен — авторизуйся заново");
    }
    let v: serde_json::Value = resp.json().await.context("account/status json")?;
    Ok(v["result"]["plus"]["hasPlus"].as_bool().unwrap_or(false))
}

// ============================ Stream URL ============================

/// Грубое извлечение содержимого первого тега `<tag>...</tag>`.
fn xml_tag<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let s = xml.find(&open)? + open.len();
    let e = xml[s..].find(&close)? + s;
    Some(&xml[s..e])
}

/// Возвращает прямой mp3-URL для воспроизведения в плеере.
pub async fn stream_url(token: &str, track_id: &str) -> Result<String> {
    let client = http()?;
    let auth = format!("OAuth {token}");

    // 1. Список вариантов загрузки.
    let resp = client
        .get(format!("{API}/tracks/{track_id}/download-info"))
        .header("Authorization", &auth)
        .header("X-Yandex-Music-Client", YM_CLIENT)
        .send()
        .await
        .context("download-info request")?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        bail!("Токен Яндекс.Музыки недействителен — авторизуйся заново");
    }
    let v: serde_json::Value = resp.json().await.context("download-info json")?;
    let variants = v["result"]
        .as_array()
        .ok_or_else(|| anyhow!("Трек недоступен (нужна подписка Яндекс Плюс)"))?;

    // Лучший mp3 по битрейту.
    let best = variants
        .iter()
        .filter(|x| x["codec"].as_str() == Some("mp3"))
        .max_by_key(|x| x["bitrateInKbps"].as_u64().unwrap_or(0))
        .or_else(|| variants.first())
        .ok_or_else(|| anyhow!("Нет доступных форматов для трека"))?;
    let info_url = best["downloadInfoUrl"]
        .as_str()
        .ok_or_else(|| anyhow!("Нет downloadInfoUrl"))?;

    // 2. XML с host/path/ts/s.
    let xml = client
        .get(info_url)
        .header("Authorization", &auth)
        .header("X-Yandex-Music-Client", YM_CLIENT)
        .send()
        .await
        .context("download-info xml request")?
        .text()
        .await
        .context("download-info xml body")?;

    let host = xml_tag(&xml, "host").ok_or_else(|| anyhow!("XML без <host>"))?;
    let path = xml_tag(&xml, "path").ok_or_else(|| anyhow!("XML без <path>"))?;
    let ts = xml_tag(&xml, "ts").ok_or_else(|| anyhow!("XML без <ts>"))?;
    let s = xml_tag(&xml, "s").ok_or_else(|| anyhow!("XML без <s>"))?;

    // 3. Подпись: md5(SALT + path[1:] + s).
    let mut h = Md5::new();
    h.update(format!("{SIGN_SALT}{}{s}", &path[1..]).as_bytes());
    let sign = hex_lower(&h.finalize());

    // 4. Финальная прямая ссылка.
    let url = format!("https://{host}/get-mp3/{sign}/{ts}{path}");

    // 5. Проверяем, что ссылка реально отдаёт аудио. Без Плюса/в регионе
    //    download-info всё равно отдаёт URL, но он возвращает 403 — без
    //    этой проверки stream_url не бросал ошибку, и фронт не уходил в
    //    SoundCloud-фолбэк. Range bytes=0-1 — не качаем весь файл.
    let probe = client
        .get(&url)
        .header("Range", "bytes=0-1")
        .header("X-Yandex-Music-Client", YM_CLIENT)
        .send()
        .await
        .context("stream probe")?;
    let st = probe.status();
    if !(st.is_success() || st.as_u16() == 206) {
        bail!(
            "Трек недоступен ({}) — нужна подписка Яндекс Плюс",
            st.as_u16()
        );
    }

    Ok(url)
}
