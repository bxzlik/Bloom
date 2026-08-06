//! YouTube Music — неофициальный InnerTube API (`music.youtube.com/youtubei`).
//!
//! Как и `yandex.rs`, вся сеть живёт в Rust: у `music.youtube.com` нет CORS, а
//! аудио с `googlevideo.com` — range-based и не отдаётся в WebView2 напрямую
//! (идёт через локальный `audio_proxy`).
//!
//! Без авторизации (публичный поиск/стрим). Поиск — клиент `WEB_REMIX`, разбор
//! `musicResponsiveListItemRenderer`. Стрим — клиент `ANDROID_VR` к
//! `player`-эндпоинту: он отдаёт `streamingData.adaptiveFormats[]` с ПРЯМЫМИ url
//! (без расшифровки signatureCipher / n-throttling) и, в отличие от web/ios/
//! android, **не требует PoToken** (см. гайд yt-dlp «PO Token»). Эти константы
//! клиентов время от времени приходится обновлять — все собраны вверху файла.
//!
//! КРИТИЧНО: во все запросы идёт `visitorData` (см. `visitor_data`). Без него
//! `player` отвечает `LOGIN_REQUIRED` («Sign in to confirm you're not a bot») —
//! именно из-за его отсутствия YTM раньше играл через бридж на SoundCloud.

use anyhow::{anyhow, bail, Context, Result};
use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::RwLock;

const SEARCH_URL: &str = "https://music.youtube.com/youtubei/v1/search?prettyPrint=false";
const PLAYER_URL: &str = "https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false";
const VISITOR_URL: &str = "https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false";

/// Веб-клиент YouTube Music — для поиска/браузинга (ключ публичный, общеизвестен).
const WEB_KEY: &str = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const WEB_CLIENT_NAME: &str = "WEB_REMIX";
const WEB_CLIENT_VERSION: &str = "1.20260707.12.00";
const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                      (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

/// Клиент обычного youtube.com — только чтобы выпросить `visitorData`.
const YT_CLIENT_VERSION: &str = "2.20260708.00.00";

/// ANDROID_VR (гарнитура Oculus) — основной клиент для `player`. Не требует
/// PoToken и отдаёт прямые url. Версию/UA обновлять по yt-dlp, если стрим
/// начнёт ломаться (`yt_dlp/extractor/youtube/_base.py`, INNERTUBE_CLIENTS).
const VR_CLIENT_VERSION: &str = "1.65.10";
const VR_UA: &str = "com.google.android.apps.youtube.vr.oculus/1.65.10 \
                     (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";

/// VISIONOS (Apple Vision Pro) — запасной клиент с теми же свойствами: если
/// ANDROID_VR упрётся в ограничение (например «made for kids»), пробуем его.
const VISION_CLIENT_VERSION: &str = "1.02";
const VISION_UA: &str =
    "com.google.ios.youtube/1.02 (Apple Vision Pro; U; CPU visionOS 1_0 like Mac OS X)";

fn http() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .build()
        .context("reqwest client build")
}

// ============================ visitorData ============================

/// Кеш `visitorData` на процесс. Это идентификатор анонимной сессии: без него
/// каждый запрос выглядит как новый холодный клиент, и YouTube помечает его
/// ботом. Сбрасывается в `reset_visitor_data` при отказе, чтобы взять свежий.
static VISITOR: Lazy<RwLock<Option<String>>> = Lazy::new(|| RwLock::new(None));

/// Достать `visitorData` (из кеша либо запросить у `visitor_id`-эндпоинта).
/// Ошибку не поднимаем: пустая строка означает «шлём без него» — поиск/браузинг
/// работают и так, страдает только `player`.
async fn visitor_data() -> String {
    if let Some(v) = VISITOR.read().await.clone() {
        return v;
    }
    let fresh = fetch_visitor_data().await.unwrap_or_default();
    *VISITOR.write().await = Some(fresh.clone());
    fresh
}

async fn fetch_visitor_data() -> Result<String> {
    let body = json!({
        "context": { "client": {
            "clientName": "WEB",
            "clientVersion": YT_CLIENT_VERSION,
            "hl": "en",
            "gl": "US",
        }}
    });
    let v: Value = http()?
        .post(VISITOR_URL)
        .header("User-Agent", WEB_UA)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("ytm visitor_id request")?
        .json()
        .await
        .context("ytm visitor_id json")?;
    v.pointer("/responseContext/visitorData")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| anyhow!("visitorData отсутствует в ответе"))
}

/// Забыть текущий `visitorData` — следующий вызов возьмёт свежий.
async fn reset_visitor_data() {
    *VISITOR.write().await = None;
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
    /// Число треков, если YTM его дал (см. `row_track_count`).
    #[serde(rename = "trackCount", skip_serializing_if = "Option::is_none")]
    pub track_count: Option<u32>,
}

#[derive(Serialize)]
pub struct YtmSearch {
    pub tracks: Vec<YtmTrack>,
    pub artists: Vec<YtmArtist>,
    pub albums: Vec<YtmAlbum>,
    pub playlists: Vec<YtmPlaylist>,
}

/// Порция догрузки поиска (см. `search_more`).
#[derive(Serialize)]
pub struct YtmSearchMore {
    pub tracks: Vec<YtmTrack>,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
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
    /// Только для артиста: похожие исполнители («Fans might also like»).
    #[serde(rename = "similarArtists", default)]
    pub similar_artists: Vec<YtmArtist>,
    /// Год выпуска (4-значный run в subtitle шапки). У артиста пусто.
    #[serde(default)]
    pub year: String,
    /// Аватар артиста/владельца из шапки (`straplineThumbnail`).
    #[serde(rename = "ownerAvatar", default)]
    pub owner_avatar: String,
    /// Только для артиста: биография из шапки. Пусто, если YTM её не даёт.
    #[serde(default)]
    pub description: String,
    /// Только для артиста: число подписчиков канала (из «39.9M» → 39_900_000).
    #[serde(default)]
    pub subscribers: u64,
}

// ============================ Поиск ============================

/// Тело запроса InnerTube с веб-контекстом (+ `visitorData` — см. модуль-док).
async fn web_body(extra: Value) -> Value {
    let mut body = json!({
        "context": {
            "client": {
                "clientName": WEB_CLIENT_NAME,
                "clientVersion": WEB_CLIENT_VERSION,
                "hl": "en",
                "gl": "US",
                "visitorData": visitor_data().await,
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

/// Фильтр выдачи «только песни» — тот же `params`, что шлёт веб-клиент при
/// выборе вкладки «Songs». Без него YTM подмешивает в треки любые ролики
/// (каверы, хореографию, реакции) и они всплывают выше оригинала.
const PARAMS_SONGS: &str = "EgWKAQIIAWoKEAkQBRAKEAMQBA==";

/// Фильтр «только артисты» (вкладка «Artists»). В общей выдаче искомый артист
/// лежит в карточке топ-результата (`musicCardShelfRenderer`), которую мы не
/// разбираем, а строками идут «похожие» — из-за этого по запросу «the weeknd»
/// в артистах оказывались Gesaffelstein и Metro Boomin, а самого The Weeknd не
/// было. Вкладка отдаёт нужного артиста первым.
const PARAMS_ARTISTS: &str = "EgWKAQIgAWoKEAkQChAFEAMQBA==";

/// Фильтры «только альбомы» / «только плейлисты» (вкладки «Albums»/«Playlists»).
/// Нужны по той же причине, что и вкладка артистов: в общей выдаче альбомы и
/// плейлисты идут вперемешку с «похожим», а искомый релиз может вообще не
/// попасть в первые строки.
const PARAMS_ALBUMS: &str = "EgWKAQIYAWoKEAkQChAFEAMQBA==";
const PARAMS_PLAYLISTS: &str = "EgWKAQIoAWoKEAkQChAFEAMQBA==";

/// Состояние листания поиска. Держим только последний запрос — пользователь
/// листает одну выдачу за раз, а привязка к строке запроса не даёт отдать
/// чужую страницу, если поиск успели сменить.
struct SearchPaging {
    query: String,
    /// Токен следующей страницы; None — страницы кончились.
    token: Option<String>,
    /// Уже отданные videoId: YTM повторяет треки между страницами, и без этого
    /// в выдаче появляются дубли (проверено — «Ashura-chan» на 1-й и 3-й).
    seen: std::collections::HashSet<String>,
}

static SEARCH_CONT: Lazy<RwLock<Option<SearchPaging>>> = Lazy::new(|| RwLock::new(None));

/// Первый токен продолжения в ответе. InnerTube кладёт его то в
/// `nextContinuationData.continuation`, то в `continuationCommand.token` —
/// ищем оба, не привязываясь к пути (структура секций плавает).
fn find_continuation(v: &Value) -> Option<String> {
    match v {
        Value::Object(map) => {
            for (k, val) in map {
                if (k == "continuation" || k == "token") && val.is_string() {
                    let s = val.as_str().unwrap_or("");
                    // Короткие строки с таким ключом встречаются в трекинге.
                    if s.len() > 20 {
                        return Some(s.to_string());
                    }
                }
                if let Some(found) = find_continuation(val) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(arr) => arr.iter().find_map(find_continuation),
        _ => None,
    }
}

/// Сколько раз подряд тянуть следующую страницу, если предыдущая целиком
/// оказалась дублями: иначе кнопка «Загрузить ещё» молча ничего не добавляет.
const PAGING_MAX_FETCHES: usize = 3;

/// Следующая страница треков поиска (по 20). Пустой результат + `false`, если
/// продолжения нет либо запрос сменился с момента прошлой выдачи.
pub async fn search_more(query: &str) -> Result<(Vec<YtmTrack>, bool)> {
    let mut fresh = Vec::new();

    for _ in 0..PAGING_MAX_FETCHES {
        // Токен берём под коротким чтением, чтобы не держать лок на время сети.
        let token = match SEARCH_CONT.read().await.as_ref() {
            Some(p) if p.query == query => match &p.token {
                Some(t) => t.clone(),
                None => break, // страницы кончились
            },
            _ => return Ok((Vec::new(), false)), // запрос сменился
        };

        let v = search_continuation(&token).await?;
        let page = filtered_rows(&v, |it| page_type(it).is_none(), parse_track, 20, |t| {
            t.id.clone()
        });
        let next = find_continuation(&v);

        {
            let mut guard = SEARCH_CONT.write().await;
            let Some(state) = guard.as_mut().filter(|p| p.query == query) else {
                return Ok((Vec::new(), false)); // запрос сменили, пока ходили в сеть
            };
            state.token = next;
            for t in page {
                if state.seen.insert(t.id.clone()) {
                    fresh.push(t);
                }
            }
        }

        if !fresh.is_empty() {
            break;
        }
    }

    let has_more = SEARCH_CONT
        .read()
        .await
        .as_ref()
        .is_some_and(|p| p.query == query && p.token.is_some());
    Ok((fresh, has_more))
}

async fn search_continuation(token: &str) -> Result<Value> {
    let body = web_body(json!({})).await;
    let resp = http()?
        .post(format!("{SEARCH_URL}&key={WEB_KEY}&continuation={token}"))
        .header("User-Agent", WEB_UA)
        .header("Origin", "https://music.youtube.com")
        .header("Referer", "https://music.youtube.com/")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("ytm search continuation request")?;
    if !resp.status().is_success() {
        bail!("YouTube Music: догрузка вернула {}", resp.status().as_u16());
    }
    resp.json().await.context("ytm search continuation json")
}

/// Разобрать строки ответа отфильтрованной вкладки: отобрать по `keep`,
/// распарсить, снять дубли по `key`, обрезать до `limit`.
fn filtered_rows<T, K: std::hash::Hash + Eq>(
    v: &Value,
    keep: impl Fn(&Value) -> bool,
    parse: impl Fn(&Value) -> Option<T>,
    limit: usize,
    key: impl Fn(&T) -> K,
) -> Vec<T> {
    let mut items: Vec<&Value> = Vec::new();
    collect_mrlir(v, &mut items);
    let mut seen = std::collections::HashSet::new();
    items
        .into_iter()
        .filter(|it| keep(it))
        .filter_map(|it| parse(it))
        .filter(|x| seen.insert(key(x)))
        .take(limit)
        .collect()
}

/// Один запрос к `search`. `params` — фильтр вкладки (None = общая выдача).
async fn search_raw(query: &str, params: Option<&str>) -> Result<Value> {
    let extra = match params {
        Some(p) => json!({ "query": query, "params": p }),
        None => json!({ "query": query }),
    };
    let resp = http()?
        .post(format!("{SEARCH_URL}&key={WEB_KEY}"))
        .header("User-Agent", WEB_UA)
        .header("Origin", "https://music.youtube.com")
        .header("Referer", "https://music.youtube.com/")
        .header("Content-Type", "application/json")
        .json(&web_body(extra).await)
        .send()
        .await
        .context("ytm search request")?;
    if !resp.status().is_success() {
        bail!("YouTube Music: поиск вернул {}", resp.status().as_u16());
    }
    resp.json().await.context("ytm search json")
}

pub async fn search(query: &str) -> Result<YtmSearch> {
    // Пять запросов параллельно: общая выдача + по вкладке на каждый раздел.
    // Вкладки дают чистые и правильно отсортированные списки, общая выдача
    // остаётся источником по умолчанию и даёт карточку топ-результата. Если
    // фильтр перестанет работать (YouTube меняет `params`), берём раздел из
    // общей выдачи — поломка фильтра деградирует, а не роняет поиск.
    let (v, songs, artists_only, albums_only, playlists_only) = tokio::join!(
        search_raw(query, None),
        search_raw(query, Some(PARAMS_SONGS)),
        search_raw(query, Some(PARAMS_ARTISTS)),
        search_raw(query, Some(PARAMS_ALBUMS)),
        search_raw(query, Some(PARAMS_PLAYLISTS)),
    );
    let v = v?;

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

    // Результаты вкладок вытесняют соответствующие разделы общей выдачи.
    if let Ok(sv) = songs {
        let found = filtered_rows(&sv, |it| page_type(it).is_none(), parse_track, 20, |t| {
            t.id.clone()
        });
        if !found.is_empty() {
            // Листаем именно вкладку «Songs» — так догрузка даёт чистые песни.
            *SEARCH_CONT.write().await = Some(SearchPaging {
                query: query.to_string(),
                token: find_continuation(&sv),
                seen: found.iter().map(|t| t.id.clone()).collect(),
            });
            tracks = found;
        }
    }
    if let Ok(av) = artists_only {
        let found = filtered_rows(
            &av,
            |it| page_type(it) == Some("MUSIC_PAGE_TYPE_ARTIST"),
            parse_artist,
            8,
            |a| a.id.clone(),
        );
        if !found.is_empty() {
            artists = found;
        }
    }
    // Альбомы и плейлисты вкладки не ЗАМЕЩАЮТ общую выдачу, а дополняют её.
    // Здесь, в отличие от артистов, общая выдача не врёт, зато содержит то,
    // чего во вкладке нет: официальные плейлисты YouTube Music («Presenting
    // Ado») — единственные, у кого известно число треков. Вкладка добавляет
    // хвост на запросах, где общая выдача отдала пару строк.
    if let Ok(alv) = albums_only {
        let found = filtered_rows(
            &alv,
            |it| page_type(it) == Some("MUSIC_PAGE_TYPE_ALBUM"),
            parse_album,
            12,
            |a| a.id.clone(),
        );
        albums = merge_by_id(albums, found, 12, |a| a.id.clone());
    }
    if let Ok(plv) = playlists_only {
        let found = filtered_rows(
            &plv,
            |it| {
                matches!(
                    page_type(it),
                    Some("MUSIC_PAGE_TYPE_PLAYLIST") | Some("MUSIC_PAGE_TYPE_AUDIOBOOK")
                )
            },
            parse_playlist,
            8,
            |p| p.id.clone(),
        );
        playlists = merge_by_id(playlists, found, 8, |p| p.id.clone());
    }

    // Топ-результат — самая релевантная сущность по запросу; поднимаем её на
    // первое место своего раздела (вкладки сортируют внутри типа, но не знают,
    // что именно искал пользователь).
    match parse_top_card(&v) {
        Some(TopCard::Artist(a)) => {
            artists.retain(|x| x.id != a.id);
            artists.insert(0, a);
        }
        Some(TopCard::Album(a)) => {
            albums.retain(|x| x.id != a.id);
            albums.insert(0, a);
        }
        Some(TopCard::Playlist(p)) => {
            playlists.retain(|x| x.id != p.id);
            playlists.insert(0, p);
        }
        None => {}
    }

    Ok(YtmSearch {
        tracks,
        artists,
        albums,
        playlists,
    })
}

/// Дописать в конец раздела то, чего в нём ещё нет (порядок базового списка
/// сохраняется — он же и есть порядок релевантности).
fn merge_by_id<T>(mut base: Vec<T>, extra: Vec<T>, cap: usize, id: impl Fn(&T) -> String) -> Vec<T> {
    let mut seen: std::collections::HashSet<String> = base.iter().map(&id).collect();
    for x in extra {
        if seen.insert(id(&x)) {
            base.push(x);
        }
    }
    base.truncate(cap);
    base
}

/// Сущность из карточки топ-результата (`musicCardShelfRenderer`).
enum TopCard {
    Artist(YtmArtist),
    Album(YtmAlbum),
    Playlist(YtmPlaylist),
}

/// Разобрать карточку топ-результата общей выдачи. Она лежит НЕ в строках
/// (`musicResponsiveListItemRenderer`), поэтому обычный сбор её не видит, и
/// самый релевантный результат раньше терялся целиком.
///
/// Тип определяем по `navigationEndpoint` первого run'а заголовка (у карточки
/// трека там `watchEndpoint` без pageType — такие пропускаем: чистый список
/// песен даёт вкладка «Songs», а длительности в карточке нет).
fn parse_top_card(v: &Value) -> Option<TopCard> {
    let card = find_renderer(v, "musicCardShelfRenderer")?;
    let run = card.pointer("/title/runs/0")?;
    let title = run.get("text").and_then(Value::as_str).unwrap_or("");
    if title.is_empty() {
        return None;
    }
    // `run` несёт navigationEndpoint — те же хелперы, что для строк выдачи.
    let id = item_browse_id(run)?;
    let cover = biggest_thumb(&card["thumbnail"]);
    let parts = meaningful_runs(&card["subtitle"]);
    match page_type(run)? {
        "MUSIC_PAGE_TYPE_ARTIST" => Some(TopCard::Artist(YtmArtist {
            id,
            name: title.to_string(),
            cover,
        })),
        "MUSIC_PAGE_TYPE_ALBUM" => {
            let year = parts
                .iter()
                .rev()
                .find(|s| s.len() == 4 && s.chars().all(|c| c.is_ascii_digit()))
                .cloned()
                .unwrap_or_default();
            let artist = parts
                .iter()
                .filter(|s| **s != year)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ");
            Some(TopCard::Album(YtmAlbum {
                id,
                title: title.to_string(),
                artist,
                cover,
                year,
            }))
        }
        "MUSIC_PAGE_TYPE_PLAYLIST" | "MUSIC_PAGE_TYPE_AUDIOBOOK" => Some(TopCard::Playlist(YtmPlaylist {
            id,
            title: title.to_string(),
            cover,
            owner_name: parts.first().cloned().unwrap_or_default(),
            track_count: None,
        })),
        _ => None,
    }
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

/// Метки типа сущности, с которых YTM начинает подпись строки или карточки
/// («Song • Artist • Album», «Single • BahaVibe»). Это не имя артиста и не
/// владелец — из подписей их выкидываем, иначе они утекают в UI. Запросы уходят
/// с `hl=en`, поэтому список английский; русские — на случай, если YTM всё же
/// ответит на языке региона.
const TYPE_LABELS: &[&str] = &[
    "song", "video", "album", "single", "ep", "playlist", "artist", "podcast", "episode",
    "песня", "видео", "альбом", "сингл", "плейлист", "исполнитель", "подкаст", "эпизод",
];

fn is_type_label(s: &str) -> bool {
    let s = s.trim().to_lowercase();
    TYPE_LABELS.contains(&s.as_str())
}

/// Смысловые куски подписи (`{runs:[…]}`): без сепараторов и без метки типа.
fn meaningful_runs(node: &Value) -> Vec<String> {
    node.get("runs")
        .and_then(Value::as_array)
        .map(|runs| {
            runs.iter()
                .filter_map(|r| r.get("text").and_then(Value::as_str))
                .map(str::trim)
                .filter(|s| !s.is_empty() && *s != "•" && *s != "&" && !is_type_label(s))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
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
/// артиста (pageType ARTIST); если их нет — первый смысловой run (метка типа,
/// сепараторы и длительность отброшены).
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
    // Фолбэк — первый смысловой кусок подписи. Раньше здесь безусловно
    // пропускался нулевой run (в поиске это метка типа), но в строках плейлиста
    // артист как раз в нулевом: у чарт-плейлистов подпись = один run с каналом,
    // и все треки чарта выходили без исполнителя.
    col1.map(meaningful_runs)
        .unwrap_or_default()
        .into_iter()
        .find(|s| parse_clock(s).is_none())
        .unwrap_or_default()
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
        track_count: row_track_count(it),
    })
}

/// Число треков из подписи строки. Официальные плейлисты YTM пишут его в
/// подзаголовке («Playlist • YouTube Music • 48 songs»), пользовательские —
/// нет (у них «автор • 4.3M views»), а у альбомов его нет вовсе. Поэтому
/// `Option`: «неизвестно» и «ноль треков» — разные вещи, и UI не должен
/// показывать «0 тр.» там, где счётчика просто не дали.
fn row_track_count(it: &Value) -> Option<u32> {
    let mut found = None;
    collect_text(it, &mut |s| {
        if found.is_some() {
            return;
        }
        // «48 songs» / «104 треков» — число, за ним слово про треки.
        let mut parts = s.split_whitespace();
        let (Some(num), Some(word)) = (parts.next(), parts.next()) else {
            return;
        };
        if !matches!(word, "songs" | "song" | "треков" | "трека" | "трек") {
            return;
        }
        found = num.replace([',', ' ', '\u{a0}'], "").parse().ok();
    });
    found
}

// ============================ Страницы (browse) ============================

const BROWSE_URL: &str = "https://music.youtube.com/youtubei/v1/browse?prettyPrint=false";

/// POST browse с веб-контекстом → сырой JSON ответа.
async fn browse(browse_id: &str) -> Result<Value> {
    browse_with(browse_id, None).await
}

/// Browse с `params` — им YTM кодирует «какую вкладку раздела показать»
/// (например «Singles & EPs» у артиста). Значение берём из кнопки «ещё».
async fn browse_with(browse_id: &str, params: Option<&str>) -> Result<Value> {
    let extra = match params {
        Some(p) => json!({ "browseId": browse_id, "params": p }),
        None => json!({ "browseId": browse_id }),
    };
    browse_extra(extra).await
}

/// Browse с произвольным телом запроса (кроме `browseId` бывает нужен
/// `formData` — им, например, выбирается страна чарта).
async fn browse_extra(extra: Value) -> Result<Value> {
    let body = web_body(extra).await;
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
    let subtitle = h.map(header_subtitle).unwrap_or_default();
    let mut items = Vec::new();
    collect_mrlir(&v, &mut items);
    let tracks: Vec<YtmTrack> = items
        .iter()
        .filter_map(|it| parse_track(it))
        .map(|mut t| {
            // У треков альбома часто нет своей обложки — подставляем обложку альбома.
            if t.cover.is_empty() {
                t.cover = cover.clone();
            }
            // Артист в строках альбома не повторяется (он один на всю страницу и
            // указан в шапке) — иначе в списке у каждого трека «Неизвестен».
            if t.artist.is_empty() {
                t.artist = subtitle.clone();
            }
            t
        })
        .collect();
    Ok(YtmEntity {
        title: h.map(header_title).unwrap_or_default(),
        subtitle,
        cover,
        tracks,
        popular_tracks: Vec::new(),
        albums: Vec::new(),
        similar_artists: Vec::new(),
        year: h.map(header_year).unwrap_or_default(),
        owner_avatar: h.map(header_strapline_avatar).unwrap_or_default(),
        description: String::new(),
        subscribers: 0,
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
        similar_artists: Vec::new(),
        year: h.map(header_year).unwrap_or_default(),
        owner_avatar: h.map(header_strapline_avatar).unwrap_or_default(),
        description: String::new(),
        subscribers: 0,
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
    // Карточки каруселей (musicTwoRowItemRenderer) — это и релизы, и похожие
    // исполнители сразу. Разбираем по префиксу browseId, а не по заголовку
    // секции: заголовки локализованы и YTM тасует состав каруселей.
    let mut rows = Vec::new();
    collect_two_row(&v, &mut rows);
    let mut albums = Vec::new();
    let mut similar_artists = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for r in rows {
        if let Some(a) = parse_two_row_album(r) {
            if seen.insert(a.id.clone()) {
                albums.push(a);
            }
        } else if let Some(a) = parse_two_row_artist(r) {
            if seen.insert(a.id.clone()) {
                similar_artists.push(a);
            }
        }
    }
    // Шапка отдаёт только 5–10 песен и 10 релизов. За полными списками идём по
    // кнопкам «ещё»: у шелфа песен это плейлист VL… (≈100 треков), у карусели
    // синглов — MPAD… с `params`. Оба запроса независимы → параллельно.
    let songs_more = shelf_more(&v, &["Top songs", "Songs", "Популярные треки", "Песни"]);
    let singles_more = shelf_more(&v, &["Singles & EPs", "Синглы и EP", "Синглы"]);
    let (full_songs, singles) = tokio::join!(more_tracks(songs_more), more_albums(singles_more));

    for a in singles {
        if seen.insert(a.id.clone()) {
            albums.push(a);
        }
    }

    Ok(YtmEntity {
        title: h.map(header_title).unwrap_or_default(),
        subtitle: String::new(),
        cover: h.map(biggest_thumb).unwrap_or_default(),
        tracks: full_songs,
        popular_tracks,
        albums,
        similar_artists,
        year: String::new(),
        owner_avatar: String::new(),
        description: h.map(header_description).unwrap_or_default(),
        subscribers: h.map(header_subscribers).unwrap_or(0),
    })
}

/// Ссылка кнопки «ещё» у секции: (browseId, params).
type MoreLink = Option<(String, Option<String>)>;

/// Найти кнопку «ещё» у секции с одним из указанных заголовков.
///
/// Секции ищем рекурсивно, а не по фиксированному пути: YTM тасует их порядок и
/// состав от артиста к артисту (у кого-то нет синглов, у кого-то нет видео).
fn shelf_more(v: &Value, titles: &[&str]) -> MoreLink {
    fn walk(v: &Value, titles: &[&str], out: &mut MoreLink) {
        if out.is_some() {
            return;
        }
        match v {
            Value::Object(map) => {
                for key in ["musicShelfRenderer", "musicCarouselShelfRenderer"] {
                    if let Some(shelf) = map.get(key) {
                        let head = shelf.get("header").unwrap_or(shelf);
                        if shelf_title_matches(head, titles) {
                            if let Some(link) = browse_link(head) {
                                *out = Some(link);
                                return;
                            }
                        }
                    }
                }
                for x in map.values() {
                    walk(x, titles, out);
                }
            }
            Value::Array(arr) => {
                for x in arr {
                    walk(x, titles, out);
                }
            }
            _ => {}
        }
    }
    let mut out = None;
    walk(v, titles, &mut out);
    out
}

/// Есть ли среди текстов заголовка секции один из ожидаемых (без учёта регистра).
fn shelf_title_matches(head: &Value, titles: &[&str]) -> bool {
    let mut found = false;
    collect_text(head, &mut |s| {
        if !found && titles.iter().any(|t| t.eq_ignore_ascii_case(s)) {
            found = true;
        }
    });
    found
}

/// Первый `browseEndpoint` внутри узла → (browseId, params).
fn browse_link(v: &Value) -> Option<(String, Option<String>)> {
    let ep = find_renderer(v, "browseEndpoint")?;
    let id = ep.get("browseId").and_then(Value::as_str)?.to_string();
    let params = ep.get("params").and_then(Value::as_str).map(str::to_string);
    Some((id, params))
}

/// Обойти все строковые поля `text`/`simpleText` узла.
fn collect_text(v: &Value, f: &mut impl FnMut(&str)) {
    match v {
        Value::Object(map) => {
            for (k, val) in map {
                if (k == "text" || k == "simpleText") && val.is_string() {
                    f(val.as_str().unwrap_or(""));
                } else {
                    collect_text(val, f);
                }
            }
        }
        Value::Array(arr) => arr.iter().for_each(|x| collect_text(x, f)),
        _ => {}
    }
}

/// Полный список треков по ссылке «ещё». Ошибку глушим: страница артиста должна
/// открыться даже без этого списка.
async fn more_tracks(link: MoreLink) -> Vec<YtmTrack> {
    let Some((id, params)) = link else {
        return Vec::new();
    };
    let Ok(v) = browse_with(&id, params.as_deref()).await else {
        return Vec::new();
    };
    let mut items = Vec::new();
    collect_mrlir(&v, &mut items);
    let mut seen = std::collections::HashSet::new();
    items
        .iter()
        .filter_map(|it| parse_track(it))
        .filter(|t| seen.insert(t.id.clone()))
        .collect()
}

/// Полный список релизов по ссылке «ещё» (синглы/EP). Ошибку глушим, см. выше.
async fn more_albums(link: MoreLink) -> Vec<YtmAlbum> {
    let Some((id, params)) = link else {
        return Vec::new();
    };
    let Ok(v) = browse_with(&id, params.as_deref()).await else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    collect_two_row(&v, &mut rows);
    rows.into_iter().filter_map(parse_two_row_album).collect()
}

/// Биография артиста из шапки (`musicImmersiveHeaderRenderer.description`).
fn header_description(h: &Value) -> String {
    let d = &h["description"];
    if let Some(s) = d.get("simpleText").and_then(Value::as_str) {
        return s.to_string();
    }
    d["runs"]
        .as_array()
        .map(|runs| {
            runs.iter()
                .filter_map(|r| r.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// Число подписчиков из шапки. YTM отдаёт его текстом («39.9M subscribers»),
/// поэтому разбираем суффикс вручную.
fn header_subscribers(h: &Value) -> u64 {
    let mut found = 0;
    collect_text(&h["subscriptionButton"], &mut |s| {
        if found == 0 {
            found = parse_count(s);
        }
    });
    found
}

/// «39.9M» → 39_900_000, «1.2K» → 1200, «532» → 532. 0, если не число.
fn parse_count(s: &str) -> u64 {
    let s = s.trim();
    let digits: String = s
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.' || *c == ',')
        .collect();
    let num: f64 = match digits.replace(',', ".").parse() {
        Ok(n) => n,
        Err(_) => return 0,
    };
    let mult = match s[digits.len()..].trim_start().chars().next() {
        Some('K') | Some('k') | Some('т') => 1_000.0,
        Some('M') | Some('m') | Some('м') => 1_000_000.0,
        Some('B') | Some('b') | Some('G') => 1_000_000_000.0,
        _ => 1.0,
    };
    (num * mult) as u64
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
/// Год из шапки: 4-значный run в `subtitle` («Альбом • Артист • 2023»).
fn header_year(h: &Value) -> String {
    h["subtitle"]["runs"]
        .as_array()
        .and_then(|runs| {
            runs.iter().find_map(|r| {
                r.get("text")
                    .and_then(Value::as_str)
                    .filter(|s| s.len() == 4 && s.chars().all(|c| c.is_ascii_digit()))
            })
        })
        .unwrap_or("")
        .to_string()
}

/// Аватар артиста/владельца из шапки: `straplineThumbnail` (новый
/// musicResponsiveHeaderRenderer) — единственное место, где он есть без
/// отдельного browse-запроса на страницу артиста.
fn header_strapline_avatar(h: &Value) -> String {
    let t = &h["straplineThumbnail"];
    if t.is_null() {
        return String::new();
    }
    biggest_thumb(t)
}

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
    // straplineTextOne — ровно имя артиста/владельца (рядом с ним лежит его
    // аватар, см. header_strapline_avatar), поэтому он в приоритете: subtitle у
    // нового рендерера — метаданные вида «Альбом • 2023», а не имя. Фолбэк на
    // subtitle нужен старому musicDetailHeaderRenderer, где strapline нет.
    let strapline = from(&h["straplineTextOne"]);
    if !strapline.is_empty() {
        return strapline;
    }
    from(&h["subtitle"])
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
    // Подпись карточки — «Single • Артист» или «Album • 2023»: метку типа
    // отбрасываем (иначе она уезжает в имя исполнителя на главной), год
    // забираем в своё поле, остальное и есть артист.
    let parts = meaningful_runs(&it["subtitle"]);
    let year = parts
        .iter()
        .rev()
        .find(|s| s.len() == 4 && s.chars().all(|c| c.is_ascii_digit()))
        .cloned()
        .unwrap_or_default();
    let artist = parts
        .iter()
        .filter(|s| **s != year)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    Some(YtmAlbum {
        id: id.to_string(),
        title: title.to_string(),
        artist,
        cover: biggest_thumb(it),
        year,
    })
}

/// musicTwoRowItemRenderer → артист (карточки «Fans might also like»: browseId UC…).
fn parse_two_row_artist(it: &Value) -> Option<YtmArtist> {
    let id = two_row_browse_id(it, "UC")?;
    let name = it
        .pointer("/title/runs/0/text")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())?;
    Some(YtmArtist {
        id,
        name: name.to_string(),
        cover: biggest_thumb(it),
    })
}

/// browseId карточки карусели, если он начинается с `prefix` (иначе None —
/// карточка другого типа).
fn two_row_browse_id(it: &Value, prefix: &str) -> Option<String> {
    it.pointer("/navigationEndpoint/browseEndpoint/browseId")
        .and_then(Value::as_str)
        .filter(|id| id.starts_with(prefix))
        .map(str::to_string)
}

// ============================ Разбор ссылок ============================

/// Что открывает вставленная ссылка: `kind` — track/album/playlist/artist,
/// `id` — videoId либо browseId соответствующей страницы.
#[derive(Serialize)]
pub struct YtmResolved {
    pub kind: String,
    pub id: String,
}

fn resolved(kind: &str, id: impl Into<String>) -> YtmResolved {
    YtmResolved {
        kind: kind.to_string(),
        id: id.into(),
    }
}

/// Ссылка YouTube/YouTube Music → сущность.
///
/// Почти всё выводится из самого URL, но два случая требуют сети:
///   * `list=OLAK5uy_…` — это «плейлист-версия» альбома, а страницу альбома
///     открывает только `MPRE…`; соответствие лежит в HTML страницы плейлиста;
///   * `/@handle`, `/c/<name>`, `/user/<name>` — человекочитаемое имя канала,
///     browseId (`UC…`) тоже есть только в HTML.
///
/// Оба сетевых шага мягкие: не получилось — деградируем (альбом открывается как
/// плейлист, хэндл не резолвится), а не роняем весь импорт.
pub async fn resolve(url: &str) -> Result<YtmResolved> {
    let u = url.trim();
    if !u.contains("youtube.com") && !u.contains("youtu.be") {
        bail!("не ссылка YouTube");
    }

    // Трек: watch?v=…, youtu.be/<id>, /shorts/<id>. Приоритет выше плейлиста —
    // у ссылки «трек из плейлиста» есть оба параметра, а открыть надо трек.
    if let Some(v) = query_param(u, "v") {
        return Ok(resolved("track", v));
    }
    if let Some(id) = path_after(u, "youtu.be/").or_else(|| path_after(u, "/shorts/")) {
        return Ok(resolved("track", id));
    }

    // Плейлист/альбом: ?list=…
    if let Some(list) = query_param(u, "list") {
        if list.starts_with("OLAK5uy_") {
            if let Some(mpre) = album_browse_id(&list).await {
                return Ok(resolved("album", mpre));
            }
        }
        return Ok(resolved("playlist", list));
    }

    // Прямые browse-ссылки: /browse/<MPRE…|VL…|UC…>.
    if let Some(id) = path_after(u, "/browse/") {
        if id.starts_with("MPRE") {
            return Ok(resolved("album", id));
        }
        if id.starts_with("VL") {
            return Ok(resolved("playlist", id));
        }
        if id.starts_with("UC") {
            return Ok(resolved("artist", id));
        }
    }

    // Канал: /channel/UC… — browseId прямо в ссылке; остальные виды имени
    // (/@handle, /c/…, /user/…) достаём из HTML страницы.
    if let Some(id) = path_after(u, "/channel/") {
        return Ok(resolved("artist", id));
    }
    if u.contains("/@") || u.contains("/c/") || u.contains("/user/") {
        if let Some(id) = channel_browse_id(u).await {
            return Ok(resolved("artist", id));
        }
    }

    bail!("YouTube Music: не удалось разобрать ссылку")
}

/// Значение query-параметра (`?v=…&list=…`) без разбора всего URL.
fn query_param(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key && !v.is_empty()).then(|| v.split('#').next().unwrap_or(v).to_string())
    })
}

/// Кусок пути сразу после маркера, до следующего `/`, `?` или `#`.
fn path_after(url: &str, marker: &str) -> Option<String> {
    let rest = url.split_once(marker)?.1;
    let id: String = rest
        .chars()
        .take_while(|c| !matches!(c, '/' | '?' | '#' | '&'))
        .collect();
    (!id.is_empty()).then_some(id)
}

/// browseId альбома (`MPRE…`) по id его плейлиста (`OLAK5uy_…`). InnerTube
/// такого перехода не даёт — соответствие есть только в HTML страницы.
async fn album_browse_id(list_id: &str) -> Option<String> {
    let html = get_text(&format!(
        "https://music.youtube.com/playlist?list={list_id}"
    ))
    .await
    .ok()?;
    find_id(&html, "MPRE")
}

/// browseId канала (`UC…`) со страницы `/@handle` и подобных.
async fn channel_browse_id(url: &str) -> Option<String> {
    let html = get_text(url).await.ok()?;
    // Отдельный ключ, а не поиск «UC…» по всему тексту: две эти буквы слишком
    // часто встречаются в разметке и дают ложные срабатывания.
    for key in ["\"channelId\":\"", "\"browseId\":\"", "\"externalId\":\""] {
        if let Some(rest) = html.split_once(key).map(|x| x.1) {
            if rest.starts_with("UC") {
                return find_id(rest, "UC");
            }
        }
    }
    None
}

/// Первый идентификатор с указанным префиксом в тексте.
fn find_id(text: &str, prefix: &str) -> Option<String> {
    let i = text.find(prefix)?;
    let id: String = text[i..]
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    (id.len() > prefix.len()).then_some(id)
}

async fn get_text(url: &str) -> Result<String> {
    let resp = http()?
        .get(url)
        .header("User-Agent", WEB_UA)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .context("ytm html request")?;
    if !resp.status().is_success() {
        bail!("YouTube: страница вернула {}", resp.status().as_u16());
    }
    resp.text().await.context("ytm html body")
}

// ============================ Стрим ============================

/// Один запрос к `player` конкретным клиентом.
async fn player_with(client: Value, ua: &str, video_id: &str) -> Result<Value> {
    let mut client = client;
    if let Some(obj) = client.as_object_mut() {
        obj.insert("hl".into(), json!("en"));
        obj.insert("gl".into(), json!("US"));
        obj.insert("visitorData".into(), json!(visitor_data().await));
    }
    let body = json!({
        "context": { "client": client },
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
    });
    let resp = http()?
        .post(PLAYER_URL)
        .header("User-Agent", ua)
        .header("X-Goog-Api-Format-Version", "2")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("ytm player request")?;
    resp.json().await.context("ytm player json")
}

fn vr_client() -> Value {
    json!({
        "clientName": "ANDROID_VR",
        "clientVersion": VR_CLIENT_VERSION,
        "deviceMake": "Oculus",
        "deviceModel": "Quest 3",
        "osName": "Android",
        "osVersion": "12L",
        "androidSdkVersion": 32,
    })
}

fn vision_client() -> Value {
    json!({
        "clientName": "VISIONOS",
        "clientVersion": VISION_CLIENT_VERSION,
        "deviceMake": "Apple",
        "deviceModel": "RealityDevice14,1",
        "osName": "visionOS",
        "osVersion": "1.0.22N301",
    })
}

/// `true`, если ответ пригоден: статус OK и есть аудио с прямым url.
fn playable(v: &Value) -> bool {
    v.pointer("/playabilityStatus/status")
        .and_then(Value::as_str)
        == Some("OK")
        && audio_formats(v).next().is_some()
}

/// Аудио-форматы с готовым url (без signatureCipher).
fn audio_formats(v: &Value) -> impl Iterator<Item = &Value> {
    v.pointer("/streamingData/adaptiveFormats")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
        .iter()
        .filter(|f| {
            f.get("mimeType")
                .and_then(Value::as_str)
                .is_some_and(|m| m.starts_with("audio/"))
                && f.get("url").and_then(Value::as_str).is_some()
        })
}

/// Запрос к player-эндпоинту (даёт прямые url + videoDetails).
///
/// Порядок: ANDROID_VR → (при отказе) свежий `visitorData` и повтор → VISIONOS.
/// Протухший `visitorData` выглядит как `LOGIN_REQUIRED`, поэтому одна ретрай-
/// попытка со сбросом сессии закрывает самый частый сбой.
async fn player(video_id: &str) -> Result<Value> {
    let first = player_with(vr_client(), VR_UA, video_id).await?;
    if playable(&first) {
        return Ok(first);
    }

    reset_visitor_data().await;
    let retry = player_with(vr_client(), VR_UA, video_id).await?;
    if playable(&retry) {
        return Ok(retry);
    }

    let vision = player_with(vision_client(), VISION_UA, video_id).await?;
    if playable(&vision) {
        return Ok(vision);
    }

    // Ничего не сыграло — возвращаем первый ответ ради его playabilityStatus,
    // из него вызывающий соберёт человекочитаемую причину.
    Ok(first)
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

    // Предпочтение: m4a/aac (itag 140 — максимально совместим с WebView2),
    // затем всё остальное по битрейту.
    let best = audio_formats(&v).max_by_key(|f| {
        let itag = f.get("itag").and_then(Value::as_i64).unwrap_or(0);
        let bitrate = f.get("bitrate").and_then(Value::as_i64).unwrap_or(0);
        if itag == 140 {
            10_000_000
        } else {
            bitrate
        }
    });

    let url = best
        .and_then(|f| f.get("url").and_then(Value::as_str))
        .ok_or_else(|| anyhow!("Нет доступного аудио-потока"))?;
    Ok(url.to_string())
}

// ============================ Канарейка ============================

#[cfg(test)]
mod tests {
    use super::*;

    /// Живой тест: поиск → нативный стрим → байты с googlevideo.
    ///
    /// Ходит в сеть, поэтому `#[ignore]` — запускать вручную, когда YTM перестал
    /// играть, чтобы понять, протухли ли константы клиентов (см. модуль-док):
    /// `cargo test --package bloom ytm::tests::live_stream -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "ходит в сеть"]
    async fn live_stream() {
        for q in [
            "weeknd blinding lights",
            "земфира искала",
            "король и шут лесник",
        ] {
            let found = search(q).await.expect("поиск упал");
            println!("\n=== {q}");
            for t in found.tracks.iter().take(3) {
                println!("    {} — {} ({})", t.artist, t.title, t.id);
            }
            let track = found.tracks.first().expect("поиск не вернул треков");

            let url = stream_url(&track.id).await.expect("стрим не резолвится");
            assert!(url.starts_with("https://"), "не url: {url}");

            let resp = http()
                .unwrap()
                .get(&url)
                .header("Range", "bytes=0-1023")
                .send()
                .await
                .expect("googlevideo не ответил");
            println!("    поток: HTTP {}", resp.status());
            assert!(resp.status().is_success(), "поток не отдаёт байты");
        }
    }

    /// Живой тест страницы артиста: полный список треков, релизы, био.
    /// `cargo test --package bloom ytm::tests::live_artist -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "ходит в сеть"]
    async fn live_artist() {
        // browseId берём из поиска, а не хардкодим: каналы меняются, а тест
        // должен ломаться только когда действительно сломался разбор.
        let mut ids = Vec::new();
        for q in ["the weeknd", "земфира"] {
            let found = search(q).await.expect("поиск упал");
            println!(
                "\nартисты по «{q}»: {:?}",
                found
                    .artists
                    .iter()
                    .map(|a| format!("{} ({})", a.name, a.id))
                    .collect::<Vec<_>>()
            );
            let a = found.artists.first().expect("поиск не вернул артистов");
            ids.push(a.id.clone());
        }

        let mut with_similar = 0;
        for id in ids {
            let a = artist(&id).await.expect("страница артиста упала");
            println!(
                "\n{} — {} треков, {} релизов, {} похожих, {} подписчиков",
                a.title,
                a.tracks.len(),
                a.albums.len(),
                a.similar_artists.len(),
                a.subscribers
            );
            println!(
                "  похожие: {:?}",
                a.similar_artists.iter().map(|x| &x.name).collect::<Vec<_>>()
            );
            if !a.similar_artists.is_empty() {
                with_similar += 1;
            }
            println!("  био: {}", a.description.chars().take(70).collect::<String>());
            assert!(!a.title.is_empty(), "нет имени артиста");
            assert!(
                a.tracks.len() > a.popular_tracks.len(),
                "полный список треков не подтянулся ({} против {} популярных)",
                a.tracks.len(),
                a.popular_tracks.len()
            );
        }
        assert!(with_similar > 0, "ни у одного артиста не разобрались похожие");
    }

    /// Живой тест: пагинация поиска + треки альбома (артист не «Неизвестен»).
    /// `cargo test --package bloom ytm::tests::live_paging -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "ходит в сеть"]
    async fn live_paging() {
        let first = search("ado").await.expect("поиск упал");
        println!("стр.1: {} треков", first.tracks.len());
        let mut ids: std::collections::HashSet<_> =
            first.tracks.iter().map(|t| t.id.clone()).collect();

        for page in 2..=3 {
            let (more, has_more) = search_more("ado").await.expect("догрузка упала");
            println!("стр.{page}: +{} треков, есть ещё: {has_more}", more.len());
            assert!(!more.is_empty(), "страница {page} пустая");
            for t in &more {
                assert!(ids.insert(t.id.clone()), "дубль на странице {page}: {}", t.title);
            }
        }

        // Чужой запрос не должен отдавать страницу предыдущего.
        let (stale, has_more) = search_more("совсем другой запрос").await.unwrap();
        assert!(stale.is_empty() && !has_more, "отдали страницу от чужого запроса");

        // Альбом: у треков должен стоять артист из шапки, а не пустая строка.
        let album_id = first.albums.first().expect("нет альбомов").id.clone();
        let a = album(&album_id).await.expect("альбом упал");
        println!("\nальбом «{}» — {} треков", a.title, a.tracks.len());
        for t in a.tracks.iter().take(3) {
            println!("    {} — {}", t.artist, t.title);
        }
        assert!(
            a.tracks.iter().all(|t| !t.artist.is_empty()),
            "у треков альбома пустой артист"
        );
    }

    /// Живой тест разделов поиска: искомое должно попадать в СВОЙ раздел.
    /// Именно здесь ловится «контаминация» — когда вместо запрошенного альбома/
    /// артиста в выдаче лежат посторонние «похожие».
    /// `cargo test --package bloom ytm::tests::live_search_sections -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "ходит в сеть"]
    async fn live_search_sections() {
        let d = search("ok computer").await.expect("поиск упал");
        println!(
            "\nальбомы по «ok computer»: {:?}",
            d.albums.iter().map(|a| &a.title).collect::<Vec<_>>()
        );
        assert!(
            d.albums
                .iter()
                .any(|a| a.title.to_lowercase().contains("ok computer")),
            "искомого альбома нет в разделе альбомов"
        );

        let d = search("the weeknd").await.expect("поиск упал");
        println!(
            "артисты по «the weeknd»: {:?}",
            d.artists.iter().map(|a| &a.name).collect::<Vec<_>>()
        );
        assert!(
            d.artists
                .first()
                .is_some_and(|a| a.name.to_lowercase().contains("weeknd")),
            "топ-результат не поднялся в начало раздела артистов"
        );

        let d = search("rap caviar").await.expect("поиск упал");
        println!(
            "плейлисты по «rap caviar»: {:?}",
            d.playlists.iter().map(|p| &p.title).collect::<Vec<_>>()
        );
        assert!(!d.playlists.is_empty(), "раздел плейлистов пуст");
    }

    /// Живой тест разбора ссылок. Идентификаторы берём из поиска, а не
    /// хардкодим: тест должен ломаться, когда сломался разбор, а не когда
    /// удалили конкретный альбом.
    /// `cargo test --package bloom ytm::tests::live_resolve -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "ходит в сеть"]
    async fn live_resolve() {
        let d = search("radiohead ok computer").await.expect("поиск упал");
        let video_id = d.tracks.first().expect("нет треков").id.clone();
        let album_id = d.albums.first().expect("нет альбомов").id.clone();

        let r = resolve(&format!("https://music.youtube.com/watch?v={video_id}&list=RDAMVM123"))
            .await
            .expect("трек не разобрался");
        assert_eq!((r.kind.as_str(), r.id.as_str()), ("track", video_id.as_str()));

        let r = resolve(&format!("https://youtu.be/{video_id}?si=xyz"))
            .await
            .expect("короткая ссылка не разобралась");
        assert_eq!(r.id, video_id);

        let r = resolve(&format!("https://music.youtube.com/browse/{album_id}"))
            .await
            .expect("browse-ссылка не разобралась");
        assert_eq!((r.kind.as_str(), r.id.as_str()), ("album", album_id.as_str()));

        // Плейлист-версия альбома (OLAK5uy_…) должна доехать до страницы
        // альбома. Сам id берём из кнопки «играть» на странице альбома.
        let raw = browse(&album_id).await.expect("альбом не открылся");
        let list_id = find_id(&raw.to_string(), "OLAK5uy_").expect("на странице нет OLAK5uy_");
        let r = resolve(&format!("https://music.youtube.com/playlist?list={list_id}"))
            .await
            .expect("ссылка на плейлист-альбом не разобралась");
        println!("\nOLAK5uy_ → {} {}", r.kind, r.id);
        assert_eq!(r.kind, "album", "альбом открылся как плейлист");

        let r = resolve("https://www.youtube.com/@theweeknd")
            .await
            .expect("хэндл канала не разобрался");
        println!("@theweeknd → {} {}", r.kind, r.id);
        assert!(r.kind == "artist" && r.id.starts_with("UC"), "не канал: {:?}", r.id);
    }

    #[test]
    fn url_parts() {
        assert_eq!(query_param("https://x/watch?v=abc&list=PL1", "v").as_deref(), Some("abc"));
        assert_eq!(query_param("https://x/watch?v=abc&list=PL1", "list").as_deref(), Some("PL1"));
        assert_eq!(query_param("https://x/watch", "v"), None);
        assert_eq!(path_after("https://youtu.be/abc?si=1", "youtu.be/").as_deref(), Some("abc"));
        assert_eq!(path_after("https://x/browse/MPREb_1?x=2", "/browse/").as_deref(), Some("MPREb_1"));
        assert_eq!(find_id("...\"MPREb_a-b_1\",...", "MPRE").as_deref(), Some("MPREb_a-b_1"));
    }

    #[test]
    fn counts_parse() {
        assert_eq!(parse_count("39.9M subscribers"), 39_900_000);
        assert_eq!(parse_count("1.2K"), 1_200);
        assert_eq!(parse_count("532"), 532);
        assert_eq!(parse_count("нет числа"), 0);
    }

    /// Счётчик треков есть у официальных плейлистов YTM и отсутствует у
    /// альбомов — важно, чтобы «нет счётчика» приезжало как None, а не 0.
    #[tokio::test]
    #[ignore = "ходит в сеть"]
    async fn live_track_counts() {
        let d = search("ado").await.expect("поиск упал");
        for p in d.playlists.iter().take(6) {
            println!("плейлист «{}»: {:?}", p.title, p.track_count);
        }
        assert!(
            d.playlists.iter().any(|p| p.track_count.is_some()),
            "ни у одного плейлиста не разобрался счётчик"
        );
        assert!(
            d.playlists.iter().all(|p| p.track_count != Some(0)),
            "счётчик разобрался в 0 — значит распарсили не то"
        );
    }
}

