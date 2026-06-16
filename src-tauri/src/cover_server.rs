//! Локальный HTTP-сервер для Discord RPC: отдаёт текущую обложку по
//! http://127.0.0.1:{port}/cover.jpg.
//! Порты 49200–49299, хранение JPEG/PNG/WebP/GIF в памяти (без записи на диск).

use std::sync::atomic::{AtomicU16, Ordering};
use std::thread;
use std::time::Duration;

use base64::Engine;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use tiny_http::{Header, Response, Server, StatusCode};

struct ImageState {
    bytes: Option<Vec<u8>>,
    mime: String,
    /// Источник текущей обложки (http-URL или data:-URL). Нужен для дедупликации:
    /// `now_playing` пушится ~раз в секунду на позиционных тиках, и без этого мы
    /// бы перекачивали ту же картинку каждую секунду.
    source: Option<String>,
}

static STATE: Lazy<RwLock<ImageState>> = Lazy::new(|| {
    RwLock::new(ImageState {
        bytes: None,
        mime: "image/jpeg".into(),
        source: None,
    })
});
static PORT: AtomicU16 = AtomicU16::new(0);

pub fn start() {
    for port in 49200u16..=49299 {
        match Server::http(format!("127.0.0.1:{port}")) {
            Ok(server) => {
                PORT.store(port, Ordering::Relaxed);
                tracing::info!("CoverServer: started on port {port}");
                thread::spawn(move || serve_loop(server));
                return;
            }
            Err(_) => continue,
        }
    }
    tracing::warn!("CoverServer: could not bind any port in 49200–49299");
}

fn serve_loop(server: Server) {
    for req in server.incoming_requests() {
        let guard = STATE.read();
        let bytes = guard.bytes.clone();
        let mime = guard.mime.clone();
        drop(guard);

        let result = match bytes {
            Some(b) if !b.is_empty() => {
                let resp = Response::from_data(b)
                    .with_status_code(200)
                    .with_header(
                        Header::from_bytes(&b"Content-Type"[..], mime.as_bytes())
                            .unwrap(),
                    )
                    .with_header(
                        Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..])
                            .unwrap(),
                    )
                    .with_header(
                        Header::from_bytes(
                            &b"Cache-Control"[..],
                            &b"no-cache, no-store, must-revalidate"[..],
                        )
                        .unwrap(),
                    );
                req.respond(resp)
            }
            _ => req.respond(Response::empty(StatusCode(404))),
        };
        if let Err(e) = result {
            tracing::warn!("CoverServer: respond error: {e}");
        }
    }
}

pub fn clear_cover() {
    let mut st = STATE.write();
    st.bytes = None;
    st.source = None;
}

pub fn current_bytes() -> Option<Vec<u8>> {
    STATE.read().bytes.clone()
}

pub fn set_cover_from_data_url(data_url: &str) {
    if !data_url.starts_with("data:") {
        clear_cover();
        return;
    }
    // Та же обложка уже загружена — `now_playing` дёргается раз в секунду на
    // позиционных тиках, повторно декодировать тот же data:-URL незачем.
    if STATE.read().source.as_deref() == Some(data_url) {
        return;
    }
    let comma = match data_url.find(',') {
        Some(i) => i,
        None => {
            clear_cover();
            return;
        }
    };
    let header = &data_url[5..comma];
    let b64 = &data_url[comma + 1..];

    let mime = if header.starts_with("image/png") {
        "image/png"
    } else if header.starts_with("image/webp") {
        "image/webp"
    } else if header.starts_with("image/gif") {
        "image/gif"
    } else {
        "image/jpeg"
    };

    match base64::engine::general_purpose::STANDARD.decode(b64) {
        Ok(bytes) => {
            let len = bytes.len();
            let mut st = STATE.write();
            st.mime = mime.into();
            st.bytes = Some(bytes);
            st.source = Some(data_url.to_string());
            tracing::info!("CoverServer: cover set ({} KB, {mime})", len / 1024);
        }
        Err(e) => {
            tracing::warn!("CoverServer.set_cover_from_data_url: {e}");
            clear_cover();
        }
    }
}

/// Fire-and-forget: скачивает обложку по внешнему URL и кладёт в память.
pub fn fetch_cover_async(url: String) {
    if !url.starts_with("http") {
        clear_cover();
        return;
    }
    // Та же обложка уже загружена/качается — не перекачиваем по сети на каждом
    // позиционном тике `now_playing` (~раз в секунду). source выставляем сразу,
    // ещё до завершения запроса, чтобы параллельные тики не запустили дубль-загрузку.
    {
        let mut st = STATE.write();
        if st.source.as_deref() == Some(url.as_str()) {
            return;
        }
        st.source = Some(url.clone());
    }
    tauri::async_runtime::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("CoverServer.fetch: client build: {e}");
                STATE.write().source = None; // позволить повтор на следующем тике
                return;
            }
        };
        let resp = match client
            .get(&url)
            .header(
                "Accept",
                "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            )
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Referer", "https://soundcloud.com/")
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("CoverServer.fetch send: {e}");
                STATE.write().source = None;
                return;
            }
        };
        if !resp.status().is_success() {
            tracing::warn!("CoverServer.fetch: status {}", resp.status());
            STATE.write().source = None;
            return;
        }
        let bytes = match resp.bytes().await {
            Ok(b) => b.to_vec(),
            Err(e) => {
                tracing::warn!("CoverServer.fetch bytes: {e}");
                STATE.write().source = None;
                return;
            }
        };
        let mime = detect_mime(&bytes);
        let len = bytes.len();
        let mut st = STATE.write();
        st.mime = mime.into();
        st.bytes = Some(bytes);
        tracing::info!("CoverServer: fetched {} KB ({mime})", len / 1024);
    });
}

fn detect_mime(bytes: &[u8]) -> &'static str {
    if bytes.len() < 4 {
        return "image/jpeg";
    }
    match (bytes[0], bytes[1]) {
        (0x89, 0x50) => "image/png",
        (0x47, 0x49) => "image/gif",
        (0x52, 0x49) => "image/webp",
        _ => "image/jpeg",
    }
}
