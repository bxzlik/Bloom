//! Кастомный протокол bloom-file:// для локальных аудиофайлов.
//! Замена WebView2 virtual host "bloom-file.local".
//! Критично поддерживает HTTP Range (206 Partial Content) — без этого нет перемотки.
//! Whitelist — канонические корни из folders.json (`folder_watcher::is_path_allowed`).
//!
//! `?cover=1` на том же пути отдаёт встроенную обложку файла: гонять картинки
//! через IPC вместе со списком треков слишком дорого.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

use percent_encoding::percent_decode_str;
use tauri::http::{header, HeaderValue, Request, Response, StatusCode};
use tauri::{UriSchemeContext, UriSchemeResponder};

use crate::folder_watcher;

pub const SCHEME: &str = "bloom-file";

/// Потолок одного ответа. WebView2 открывает медиа запросом `Range: bytes=0-`,
/// и без клампа мы прочли бы в память весь файл целиком (400 МБ DSF — 400 МБ).
/// Остальное браузер до-запросит следующими range'ами.
const MAX_CHUNK: u64 = 4 * 1024 * 1024;

/// Регистрируется в `tauri::Builder` как `.register_asynchronous_uri_scheme_protocol(...)`.
/// Работа уходит в блокирующий пул: синхронный обработчик крутился бы на
/// UI-потоке WebView2 и подвешивал окно на каждом чтении с диска.
pub fn handle<R: tauri::Runtime>(
    _ctx: UriSchemeContext<'_, R>,
    req: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    tauri::async_runtime::spawn_blocking(move || {
        let resp = serve(&req).unwrap_or_else(|e| {
            tracing::warn!("bloom-file error: {e}");
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Vec::new())
                .unwrap()
        });
        responder.respond(resp);
    });
}

/// `bloom-file://localhost/<url-encoded-path>` → путь на диске.
fn decode_path(raw_path: &str) -> PathBuf {
    let decoded = percent_decode_str(raw_path.trim_start_matches('/'))
        .decode_utf8_lossy()
        .to_string();
    PathBuf::from(decoded.replace('/', std::path::MAIN_SEPARATOR_STR))
}

fn wants_cover(query: Option<&str>) -> bool {
    query.map(|q| q.split('&').any(|kv| kv == "cover=1")).unwrap_or(false)
}

/// Обратное преобразование URL обложки в путь на диске. Нужно Rust-стороне
/// (Discord RPC / SMTC / трей): хост `bloom-file.localhost` существует только
/// внутри WebView2, сходить за ним по сети нельзя.
pub fn local_cover_path(url: &str) -> Option<PathBuf> {
    let rest = url
        .strip_prefix("http://bloom-file.localhost/")
        .or_else(|| url.strip_prefix("bloom-file://localhost/"))?;
    let (path, query) = match rest.split_once('?') {
        Some((p, q)) => (p, Some(q)),
        None => (rest, None),
    };
    if !wants_cover(query) {
        return None;
    }
    Some(decode_path(path))
}

fn serve(req: &Request<Vec<u8>>) -> anyhow::Result<Response<Vec<u8>>> {
    let uri = req.uri();
    let file_path = decode_path(uri.path());

    if !file_path.is_file() || !folder_watcher::is_path_allowed(&file_path) {
        return Ok(Response::builder()
            .status(StatusCode::FORBIDDEN)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(b"Forbidden".to_vec())
            .unwrap());
    }

    if wants_cover(uri.query()) {
        return serve_cover(&file_path);
    }

    let mime = mime_for(&file_path);
    let file_len = std::fs::metadata(&file_path)?.len();

    let range_header = req
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    match range_header.as_deref().map(|rh| parse_range(rh, file_len)) {
        Some(RangeReq::Bytes(start, end)) => {
            let length = end - start + 1;
            let mut f = File::open(&file_path)?;
            f.seek(SeekFrom::Start(start))?;
            let mut buf = vec![0u8; length as usize];
            f.read_exact(&mut buf)?;

            Ok(Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, mime)
                .header(
                    header::CONTENT_RANGE,
                    HeaderValue::from_str(&format!("bytes {start}-{end}/{file_len}"))?,
                )
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_LENGTH, length.to_string())
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(buf)?)
        }
        Some(RangeReq::Unsatisfiable) => Ok(Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, HeaderValue::from_str(&format!("bytes */{file_len}"))?)
            .body(Vec::new())?),
        // Нет Range-заголовка либо он не про байты — отдаём файл целиком.
        None | Some(RangeReq::Ignored) => {
            let bytes = std::fs::read(&file_path)?;
            let len = bytes.len();
            Ok(Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CONTENT_LENGTH, len.to_string())
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(bytes)?)
        }
    }
}

fn serve_cover(file_path: &std::path::Path) -> anyhow::Result<Response<Vec<u8>>> {
    let Some((bytes, mime)) = folder_watcher::read_cover(file_path) else {
        return Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Vec::new())?);
    };
    let len = bytes.len();
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, HeaderValue::from_str(&mime)?)
        .header(header::CONTENT_LENGTH, len.to_string())
        // Список треков виртуализирован: одна и та же обложка переспрашивается
        // при каждом прокруте. Но теги могут поменяться — вечно не кешируем.
        .header(header::CACHE_CONTROL, "max-age=300")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(bytes)?)
}

enum RangeReq {
    /// Заголовок не про байтовые диапазоны — вести себя как при его отсутствии.
    Ignored,
    /// Начало за концом файла → 416.
    Unsatisfiable,
    Bytes(u64, u64),
}

/// Парсинг "bytes=START-END" (END опционально), с клампом длины в `MAX_CHUNK`.
fn parse_range(header: &str, file_len: u64) -> RangeReq {
    let Some(rest) = header.strip_prefix("bytes=") else {
        return RangeReq::Ignored;
    };
    let mut parts = rest.splitn(2, '-');
    let Some(start) = parts.next().and_then(|s| s.trim().parse::<u64>().ok()) else {
        return RangeReq::Ignored;
    };
    if start >= file_len {
        return RangeReq::Unsatisfiable;
    }
    let end = parts
        .next()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(u64::MAX)
        .min(file_len - 1)
        // Открытый `bytes=0-` иначе означает «весь файл в память».
        .min(start.saturating_add(MAX_CHUNK - 1));
    if start > end {
        return RangeReq::Unsatisfiable;
    }
    RangeReq::Bytes(start, end)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bytes(header: &str, len: u64) -> (u64, u64) {
        match parse_range(header, len) {
            RangeReq::Bytes(s, e) => (s, e),
            RangeReq::Ignored => panic!("{header} → Ignored"),
            RangeReq::Unsatisfiable => panic!("{header} → Unsatisfiable"),
        }
    }

    #[test]
    fn open_ended_range_is_clamped_to_one_chunk() {
        // WebView2 открывает медиа именно так. Без клампа читали бы 400 МБ в память.
        let huge = 400 * 1024 * 1024;
        assert_eq!(bytes("bytes=0-", huge), (0, MAX_CHUNK - 1));
        assert_eq!(bytes("bytes=1000-", huge), (1000, 1000 + MAX_CHUNK - 1));
    }

    #[test]
    fn explicit_range_is_honoured_and_clamped_to_file_end() {
        assert_eq!(bytes("bytes=10-99", 1000), (10, 99));
        assert_eq!(bytes("bytes=900-5000", 1000), (900, 999));
        // Маленький файл целиком помещается в чанк.
        assert_eq!(bytes("bytes=0-", 1000), (0, 999));
    }

    #[test]
    fn bad_and_unsatisfiable_ranges() {
        assert!(matches!(parse_range("items=0-1", 100), RangeReq::Ignored));
        assert!(matches!(parse_range("bytes=abc-", 100), RangeReq::Ignored));
        assert!(matches!(parse_range("bytes=100-", 100), RangeReq::Unsatisfiable));
        assert!(matches!(parse_range("bytes=0-", 0), RangeReq::Unsatisfiable));
    }

    #[test]
    fn cover_url_round_trips_to_a_windows_path() {
        let url = "http://bloom-file.localhost/C:/Music/My%20Song.mp3?cover=1";
        assert_eq!(
            local_cover_path(url),
            Some(PathBuf::from(format!("C:{0}Music{0}My Song.mp3", std::path::MAIN_SEPARATOR)))
        );
        // Аудио-URL (без ?cover=1) обложкой не является.
        assert_eq!(local_cover_path("http://bloom-file.localhost/C:/Music/a.mp3"), None);
        // Чужие URL не трогаем — их качает cover_server по сети.
        assert_eq!(local_cover_path("https://i1.sndcdn.com/artwork.jpg"), None);
    }
}

fn mime_for(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("mp3") => "audio/mpeg",
        Some("flac") => "audio/flac",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("opus") => "audio/ogg; codecs=opus",
        Some("aac") => "audio/aac",
        Some("m4a") => "audio/mp4",
        Some("wma") => "audio/x-ms-wma",
        Some("aiff") | Some("aif") => "audio/aiff",
        Some("webm") => "audio/webm",
        _ => "application/octet-stream",
    }
}
