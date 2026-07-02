//! Win+Shift+X — показать/скрыть главное окно. Единственный НЕнастраиваемый
//! global-хоткей (завязан на состояние OS-окна). Остальные системные хоткеи
//! (play/next/prev/like/громкость/оверлей) регистрирует фронт через
//! `@tauri-apps/plugin-global-shortcut` — см. `app/useGlobalHotkeys`.
//! Play/Pause/Next/Prev/Stop с физической клавиатуры/гарнитуры — через SMTC.

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn register(app: &AppHandle) {
    let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyX);
    let app_clone = app.clone();

    let manager = app.global_shortcut();
    if let Err(e) = manager.on_shortcut(shortcut, move |_app, _sc, ev| {
        if ev.state == ShortcutState::Pressed {
            toggle_main_window(&app_clone);
        }
    }) {
        tracing::warn!("global_hotkey: register Win+Shift+X failed: {e}");
    } else {
        tracing::info!("global_hotkey: Win+Shift+X registered");
    }
}

fn toggle_main_window(app: &AppHandle) {
    let w = match app.get_webview_window("main") {
        Some(w) => w,
        None => return,
    };
    let visible = w.is_visible().unwrap_or(false);
    let focused = w.is_focused().unwrap_or(false);

    if visible && focused {
        let _ = w.hide();
    } else {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
