//! Обработка argv второго запуска (deep-links bloom://).
//! tauri-plugin-single-instance передаёт argv повторного запуска в callback
//! первого инстанса; здесь мы вылавливаем из него deep-link.

use tauri::{AppHandle, Emitter};

/// Разбирает argv и, если найден deep-link `bloom://`, эмитит его во фронтенд
/// как событие `bloom-deeplink`.
pub fn dispatch_argv(app: &AppHandle, argv: &[String]) {
    for arg in argv.iter().skip(1) {
        if arg.starts_with("bloom://") {
            tracing::info!("bloom deep link (argv): {arg}");
            let _ = app.emit("bloom-deeplink", arg.clone());
            return;
        }
    }
}

/// Проверяет argv первого запуска на наличие deep-link (когда приложение
/// стартует по клику на bloom://-ссылку).
pub fn dispatch_startup(app: &AppHandle) {
    let argv: Vec<String> = std::env::args().collect();
    dispatch_argv(app, &argv);
}
