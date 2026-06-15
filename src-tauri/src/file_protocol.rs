//! Кастомный протокол bloom-file:// для локальных аудиофайлов.
//! Замена WebView2 virtual host "bloom-file.local".
//! Критично поддерживает HTTP Range (206 Partial Content) — без этого нет перемотки.
//! Whitelist берётся из folders.json.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use tauri::http::{header, HeaderValue, Request, Response, StatusCode};
use tauri::UriSchemeContext;

use crate::config;

pub const SCHEME: &str = "bloom-file";

/// Регистрируется в `tauri::Builder` как `.register_asynchronous_uri_scheme_protocol(...)`.
/// Полностью синхронная обработка через `std::fs` — простая и достаточно быстрая для аудио.
pub fn handle<R: tauri::Runtime>(
    _ctx: UriSchemeContext<'_, R>,
    req: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    match serve(&req) {
        Ok(resp) => resp,
        Err(e) => {
            tracing::warn!("bloom-file error: {e}");
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Vec::new())
                .unwrap()
        }
    }
}

fn serve(req: &Request<Vec<u8>>) -> anyhow::Result<Response<Vec<u8>>> {
    let uri = req.uri();
    // bloom-file://localhost/<url-encoded-path>
    let raw_path = uri.path().trim_start_matches('/');
    let decoded = percent_decode_str(raw_path).decode_utf8_lossy().to_string();
    let file_path = PathBuf::from(decoded.replace('/', std::path::MAIN_SEPARATOR_STR));

    if !is_path_allowed(&file_path) || !file_path.is_file() {
        return Ok(Response::builder()
            .status(StatusCode::FORBIDDEN)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(b"Forbidden".to_vec())
            .unwrap());
    }

    let mime = mime_for(&file_path);
    let file_len = std::fs::metadata(&file_path)?.len();

    let range_header = req
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    if let Some(rh) = range_header.as_deref() {
        if let Some((start, end)) = parse_range(rh, file_len) {
            let length = end - start + 1;
            let mut f = File::open(&file_path)?;
            f.seek(SeekFrom::Start(start))?;
            let mut buf = vec![0u8; length as usize];
            f.read_exact(&mut buf)?;

            let resp = Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, mime)
                .header(
                    header::CONTENT_RANGE,
                    HeaderValue::from_str(&format!("bytes {start}-{end}/{file_len}"))?,
                )
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_LENGTH, length.to_string())
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(buf)?;
            return Ok(resp);
        }
    }

    // Полный ответ.
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

/// Парсинг "bytes=START-END" (END опционально). Возвращает (start, end) клампнутые в [0, file_len-1].
fn parse_range(header: &str, file_len: u64) -> Option<(u64, u64)> {
    let rest = header.strip_prefix("bytes=")?;
    let mut parts = rest.splitn(2, '-');
    let start: u64 = parts.next()?.trim().parse().unwrap_or(0);
    let end: u64 = parts
        .next()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(file_len.saturating_sub(1));
    let end = end.min(file_len.saturating_sub(1));
    if start > end {
        return None;
    }
    Some((start, end))
}

/// Проверка, что путь лежит под одной из разрешённых папок (folders.json).
fn is_path_allowed(path: &Path) -> bool {
    let folders = match config::load_folders() {
        Ok(f) => f,
        Err(_) => return false,
    };
    let path_str = path.to_string_lossy().to_lowercase();
    folders
        .iter()
        .any(|f| path_str.starts_with(&f.to_string_lossy().to_lowercase()))
}

fn mime_for(path: &Path) -> &'static str {
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
