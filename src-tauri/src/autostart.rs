//! Автозапуск через HKCU\...\Run.
//! Используем tauri-plugin-autostart напрямую — плагин пишет в стандартный ключ реестра.

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

pub fn is_enabled(app: &AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

pub fn enable(app: &AppHandle) -> anyhow::Result<()> {
    app.autolaunch().enable()?;
    Ok(())
}

pub fn disable(app: &AppHandle) -> anyhow::Result<()> {
    app.autolaunch().disable()?;
    Ok(())
}
