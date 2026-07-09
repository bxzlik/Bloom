//! Ленивое создание «зеркальных» окон плеера: mini player (PiP), попап трея и
//! оверлей-«остров». Раньше все три были описаны в tauri.conf.json и создавались
//! при старте приложения — три WebView2-процесса висели в фоне всегда, даже если
//! пользователь ни разу их не открывал. Теперь окно создаётся при первом реальном
//! использовании (оверлей — при включении фичи в настройках) и дальше живёт
//! скрытым (hide/show), чтобы повторный показ был мгновенным.

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Пост-обработка только что созданного окна: отключаем браузерные
/// accelerator-клавиши WebView2 (см. lib.rs) — раньше это делал setup для всех
/// окон из конфига.
fn post_create(win: &WebviewWindow) {
    #[cfg(windows)]
    crate::disable_browser_accelerator_keys(win);
    #[cfg(not(windows))]
    let _ = win;
}

/// DWM-скругление углов (Windows 11) — для окон с собственным чромом.
fn apply_dwm(win: &WebviewWindow) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        if let Ok(hwnd) = win.hwnd() {
            crate::window_chrome::apply_dwm(HWND(hwnd.0));
        }
    }
    #[cfg(not(windows))]
    let _ = win;
}

/// Окно PiP-мини-плеера (label `miniplayer`). Создаётся скрытым при первом
/// `open_miniplayer`; показ — на стороне вызывающего.
pub fn ensure_miniplayer(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(w) = app.get_webview_window("miniplayer") {
        return Some(w);
    }
    let win = WebviewWindowBuilder::new(
        app,
        "miniplayer",
        WebviewUrl::App("picture-in-picture.html".into()),
    )
    .title("Bloom PiP")
    .inner_size(300.0, 320.0)
    .min_inner_size(260.0, 300.0)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .center()
    .visible(false)
    .build()
    .map_err(|e| tracing::warn!("create miniplayer window failed: {e}"))
    .ok()?;
    post_create(&win);
    apply_dwm(&win);
    Some(win)
}

/// Окно попапа трея (label `tray-popup`). Создаётся скрытым при первом ПКМ по
/// иконке трея; авто-скрытие по потере фокуса вешаем сразу при создании.
pub fn ensure_tray_popup(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(w) = app.get_webview_window("tray-popup") {
        return Some(w);
    }
    let win = WebviewWindowBuilder::new(app, "tray-popup", WebviewUrl::App("tray-popup.html".into()))
        .title("Bloom Tray")
        .inner_size(300.0, 290.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(true)
        .visible(false)
        .shadow(false)
        .build()
        .map_err(|e| tracing::warn!("create tray-popup window failed: {e}"))
        .ok()?;
    post_create(&win);
    apply_dwm(&win);
    // Потерял фокус → спрятать. `bloom-win-vis` глушит тикер/рендер в JS окна.
    // ВНИМАНИЕ: `emit` на окне в Tauri v2 — broadcast во ВСЕ окна (не в себя, как
    // в v1). Только `emit_to(label, ..)` адресует одно окно.
    let hook = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = hook.emit_to("tray-popup", "bloom-win-vis", false);
            let _ = hook.hide();
        }
    });
    Some(win)
}

/// Окно оверлея-«острова» (label `overlay`). Создаётся скрытым при включении
/// оверлея в настройках (overlay_set_config); показом рулит overlay.rs.
pub fn ensure_overlay(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(w) = app.get_webview_window("overlay") {
        return Some(w);
    }
    let win = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("Bloom Overlay")
        .inner_size(420.0, 104.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .shadow(false)
        .build()
        .map_err(|e| tracing::warn!("create overlay window failed: {e}"))
        .ok()?;
    post_create(&win);
    // Ручное размещение: OS-drag окна → пересчёт долей позиции (persist в стор).
    let ov_app = app.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(_) = event {
            crate::overlay::report_moved(&ov_app);
        }
    });
    Some(win)
}
