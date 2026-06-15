//! Логирование с ротацией по размеру.
//! Пишет в %LocalAppData%\com.bloom.app\bloom.log
//! с ротацией при 2 MB (bloom.log.1).

use std::path::PathBuf;
use std::sync::Mutex;

use file_rotate::{compression::Compression, suffix::AppendCount, ContentLimit, FileRotate};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::config::local_appdata_dir;

/// Идемпотентная инициализация глобального логгера.
pub fn init() -> anyhow::Result<()> {
    let dir = local_appdata_dir()?;
    std::fs::create_dir_all(&dir)?;
    let log_path: PathBuf = dir.join("bloom.log");

    // FileRotate сам по себе реализует Write, но не Send по умолчанию — оборачиваем в Mutex.
    let rotate = FileRotate::new(
        log_path,
        AppendCount::new(1),
        ContentLimit::Bytes(2 * 1024 * 1024),
        Compression::None,
        #[cfg(unix)]
        None,
    );
    let writer = Mutex::new(rotate);

    let file_layer = fmt::layer()
        .with_writer(writer)
        .with_ansi(false)
        .with_target(false)
        .with_thread_ids(true);

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    #[cfg(debug_assertions)]
    {
        let console_layer = fmt::layer().with_target(false).with_thread_ids(true);
        tracing_subscriber::registry()
            .with(filter)
            .with(file_layer)
            .with(console_layer)
            .try_init()
            .ok();
    }

    #[cfg(not(debug_assertions))]
    {
        tracing_subscriber::registry()
            .with(filter)
            .with(file_layer)
            .try_init()
            .ok();
    }

    tracing::info!("logger initialized, log dir: {}", dir.display());
    Ok(())
}
