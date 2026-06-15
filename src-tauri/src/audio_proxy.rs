//! Локальный аудио-прокси: Rust качает аудио (reqwest + rustls — надёжный
//! TLS, не зависит от системного TLS WebView2 и публичных CORS-прокси) и
//! отдаёт его на http://127.0.0.1:{port}/a?u=<urlenc>.
//!
//! Зачем: в части окружений WebView2 не может скачать поток c
//! cf-media.sndcdn.com / api.music.yandex.net (ERR_SSL_VERSION_OR_CIPHER_MISMATCH,
//! CORS). Через прокси браузер ходит только на localhost, а TLS делает Rust.
//! Поддержан Range (перемотка) — заголовок пробрасывается на upstream.

use std::sync::atomic::{AtomicU16, Ordering};
use std::thread;
use std::time::Duration;

use tiny_http::{Header, Response, Server, StatusCode};

static PORT: AtomicU16 = AtomicU16::new(0);

pub fn start() {
    for port in 49300u16..=49399 {
        match Server::http(format!("127.0.0.1:{port}")) {
            Ok(server) => {
                PORT.store(port, Ordering::Relaxed);
                tracing::info!("AudioProxy: started on port {port}");
                thread::spawn(move || serve_loop(server));
                return;
            }
            Err(_) => continue,
        }
    }
    tracing::warn!("AudioProxy: no free port in 49300–49399");
}

pub fn port() -> u16 {
    PORT.load(Ordering::Relaxed)
}

/// http://127.0.0.1:{port}/a?u=<urlenc upstream> либо None если не поднят.
pub fn proxied_url(upstream: &str) -> Option<String> {
    let p = port();
    if p == 0 {
        return None;
    }
    Some(format!(
        "http://127.0.0.1:{p}/a?u={}",
        urlencoding::encode(upstream)
    ))
}

fn hdr(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap()
}

fn serve_loop(server: Server) {
    for req in server.incoming_requests() {
        let is_options = *req.method() == tiny_http::Method::Options;
        if is_options {
            let resp = Response::empty(StatusCode(204))
                .with_header(hdr("Access-Control-Allow-Origin", "*"))
                .with_header(hdr("Access-Control-Allow-Methods", "GET, OPTIONS"))
                .with_header(hdr("Access-Control-Allow-Headers", "Range"))
                .with_header(hdr("Access-Control-Max-Age", "86400"));
            let _ = req.respond(resp);
            continue;
        }

        // upstream URL из ?u=
        let upstream = req
            .url()
            .split_once("u=")
            .and_then(|(_, q)| urlencoding::decode(q).ok().map(|c| c.into_owned()));
        let upstream = match upstream {
            Some(u) if u.starts_with("http") => u,
            _ => {
                let _ = req.respond(Response::empty(StatusCode(400)));
                continue;
            }
        };

        let range = req
            .headers()
            .iter()
            .find(|h| h.field.equiv("Range"))
            .map(|h| h.value.as_str().to_string());

        match fetch(&upstream, range.as_deref()) {
            Ok(f) => {
                let mut resp = Response::from_data(f.body).with_status_code(f.status);
                resp.add_header(hdr("Access-Control-Allow-Origin", "*"));
                resp.add_header(hdr("Accept-Ranges", "bytes"));
                resp.add_header(hdr("Content-Type", &f.content_type));
                if let Some(cr) = &f.content_range {
                    resp.add_header(hdr("Content-Range", cr));
                }
                resp.add_header(hdr("Cache-Control", "no-store"));
                let _ = req.respond(resp);
            }
            Err(e) => {
                tracing::warn!("AudioProxy fetch error: {e}");
                let _ = req.respond(Response::empty(StatusCode(502)));
            }
        }
    }
}

struct Fetched {
    status: u16,
    body: Vec<u8>,
    content_type: String,
    content_range: Option<String>,
}

fn fetch(upstream: &str, range: Option<&str>) -> anyhow::Result<Fetched> {
    let upstream = upstream.to_string();
    let range = range.map(|s| s.to_string());
    tauri::async_runtime::block_on(async move {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            .build()?;
        let mut rb = client.get(&upstream);
        if let Some(r) = range {
            rb = rb.header("Range", r);
        }
        let resp = rb.send().await?;
        let status = resp.status().as_u16();
        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("audio/mpeg")
            .to_string();
        let content_range = resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let body = resp.bytes().await?.to_vec();
        Ok(Fetched {
            status,
            body,
            content_type,
            content_range,
        })
    })
}
