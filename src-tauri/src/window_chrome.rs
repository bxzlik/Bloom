//! Кастомизация окна: DWM rounded corners, AppUserModelID, блокировка переходов.

#![cfg(windows)]

use std::ffi::c_void;

use tauri::{AppHandle, Manager};
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWM_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
};
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
use winreg::enums::*;
use winreg::RegKey;

pub const APP_USER_MODEL_ID: &str = "Bloom.App";

/// Применяет DWM-настройки (скруглённые углы, отключение transitions) к окну.
pub fn apply_dwm(hwnd: HWND) {
    unsafe {
        let pref = DWMWCP_ROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &pref as *const DWM_WINDOW_CORNER_PREFERENCE as *const c_void,
            std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        );
        let off: i32 = 0;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            &off as *const i32 as *const c_void,
            std::mem::size_of::<i32>() as u32,
        );
    }
}

/// Устанавливает AppUserModelID процесса для группировки в панели задач
/// и корректной работы Jump List.
pub fn set_app_user_model_id() {
    let id = HSTRING::from(APP_USER_MODEL_ID);
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(PCWSTR(id.as_ptr()));
    }
}

/// Регистрирует приложение в реестре под AppUserModelID.
/// HKCU\Software\Classes\AppUserModelId\Bloom.App  с полями DisplayName/ApplicationName/ApplicationIcon.
pub fn register_app_id() -> anyhow::Result<()> {
    let exe_path = std::env::current_exe()?.to_string_lossy().to_string();
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu.create_subkey(format!(
        r"Software\Classes\AppUserModelId\{APP_USER_MODEL_ID}"
    ))?;
    key.set_value("DisplayName", &"Bloom")?;
    key.set_value("ApplicationName", &"Bloom")?;
    if !exe_path.is_empty() {
        key.set_value("ApplicationIcon", &format!("{exe_path},0"))?;
    }
    Ok(())
}

/// Применяет DWM-твики к главному окну Tauri.
/// Tauri хранит HWND в своей версии `windows` crate; перекладываем через raw pointer.
pub fn apply_to_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(tauri_hwnd) = win.hwnd() {
            apply_dwm(HWND(tauri_hwnd.0));
        }
    }
}
