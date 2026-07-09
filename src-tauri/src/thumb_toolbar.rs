//! Thumbnail Toolbar — кнопки Play/Pause/Next/Prev в превью панели задач.
//! Использует ITaskbarList3::ThumbBarAddButtons.
//!
//! Иконки загружаются из bundled resources icons/prev.ico, play.ico, next.ico.
//! Если файлы отсутствуют — кнопки не регистрируются (не критично, физические
//! медиаклавиши всё равно работают через SMTC).

#![cfg(windows)]

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use once_cell::sync::OnceCell;
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Shell::{
    DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_ENABLED, THB_FLAGS,
    THB_ICON, THB_TOOLTIP, THUMBBUTTON, THUMBBUTTONMASK,
};
use windows::Win32::UI::WindowsAndMessaging::{
    LoadImageW, RegisterWindowMessageW, HICON, IMAGE_ICON, LR_DEFAULTSIZE, LR_LOADFROMFILE,
    WM_COMMAND,
};
use windows::core::w;

const BTN_PREV: u32 = 1;
const BTN_PLAY: u32 = 2;
const BTN_NEXT: u32 = 3;
const THBN_CLICKED: u16 = 0x1800;

static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();
/// Регистрируемое системой сообщение, шлётся когда кнопка окна в панели задач
/// создаётся заново (в т.ч. после hide→show при сворачивании в трей).
static WM_TASKBAR_BUTTON_CREATED: OnceCell<u32> = OnceCell::new();

struct ToolbarState {
    hwnd: isize,
    play_icon: Option<HICON>,
    pause_icon: Option<HICON>,
    prev_icon: Option<HICON>,
    next_icon: Option<HICON>,
    is_playing: bool,
}
unsafe impl Send for ToolbarState {}
static STATE: OnceCell<Mutex<ToolbarState>> = OnceCell::new();

pub fn initialize(app: &AppHandle) {
    let window = match app.get_webview_window("main") {
        Some(w) => w,
        None => return,
    };
    let raw_hwnd = match window.hwnd() {
        Ok(h) => h,
        Err(e) => {
            tracing::warn!("thumb_toolbar: hwnd failed: {e}");
            return;
        }
    };
    let hwnd = HWND(raw_hwnd.0);

    let resource_dir = app.path().resource_dir().ok();
    let dev_icons: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons");
    let resolve = |sub: &str| -> Option<PathBuf> {
        if let Some(rd) = resource_dir.as_ref() {
            let p = rd.join(sub);
            if p.exists() {
                return Some(p);
            }
        }
        let p = dev_icons.join(sub.trim_start_matches("icons/"));
        if p.exists() {
            Some(p)
        } else {
            None
        }
    };

    let prev_icon = resolve("icons/thumb/prev.ico").and_then(|p| load_hicon(&p));
    let play_icon = resolve("icons/thumb/play.ico").and_then(|p| load_hicon(&p));
    let pause_icon = resolve("icons/thumb/pause.ico").and_then(|p| load_hicon(&p));
    let next_icon = resolve("icons/thumb/next.ico").and_then(|p| load_hicon(&p));
    tracing::info!(
        "thumb_toolbar: icons prev={} play={} pause={} next={}",
        prev_icon.is_some(),
        play_icon.is_some(),
        pause_icon.is_some(),
        next_icon.is_some()
    );

    if let Err(e) = install(hwnd, prev_icon, play_icon, next_icon) {
        tracing::warn!("thumb_toolbar install: {e:?}");
    } else {
        tracing::info!("thumb_toolbar installed");
    }

    let _ = STATE.set(Mutex::new(ToolbarState {
        hwnd: raw_hwnd.0 as isize,
        play_icon,
        pause_icon,
        prev_icon,
        next_icon,
        is_playing: false,
    }));

    let _ = APP_HANDLE.set(app.clone());
    unsafe {
        let _ = WM_TASKBAR_BUTTON_CREATED.set(RegisterWindowMessageW(w!("TaskbarButtonCreated")));
        let ok = SetWindowSubclass(hwnd, Some(subclass_proc), 0xBEEF, 0);
        if !ok.as_bool() {
            tracing::warn!("thumb_toolbar: SetWindowSubclass failed");
        }
    }
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _uidsubclass: usize,
    _dwrefdata: usize,
) -> LRESULT {
    // Панель задач пересоздала кнопку окна (например, после hide→show при
    // сворачивании в трей) — thumb-кнопки при этом теряются, добавляем заново.
    if let Some(&tb_msg) = WM_TASKBAR_BUTTON_CREATED.get() {
        if msg == tb_msg {
            reinstall_from_state();
            // не return — даём системе доиграть сообщение штатно.
        }
    }
    if msg == WM_COMMAND {
        let hi = ((wparam.0 as u32) >> 16) as u16;
        let lo = wparam.0 as u32 & 0xFFFF;
        if hi == THBN_CLICKED {
            if let Some(app) = APP_HANDLE.get() {
                let cmd = match lo {
                    BTN_PREV => Some("prev"),
                    BTN_PLAY => Some("playpause"),
                    BTN_NEXT => Some("next"),
                    _ => None,
                };
                if let Some(c) = cmd {
                    let _ = app.emit("bloom-command", c);
                    return LRESULT(0);
                }
            }
        }
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

fn make_button(id: u32, icon: Option<HICON>, tip: &str) -> THUMBBUTTON {
    let mut btn = THUMBBUTTON {
        dwMask: THUMBBUTTONMASK(THB_FLAGS.0 | THB_TOOLTIP.0),
        iId: id,
        iBitmap: 0,
        hIcon: icon.unwrap_or(HICON(std::ptr::null_mut())),
        szTip: [0; 260],
        dwFlags: THBF_ENABLED,
    };
    if icon.is_some() {
        btn.dwMask = THUMBBUTTONMASK(btn.dwMask.0 | THB_ICON.0);
    }
    for (i, ch) in tip.encode_utf16().take(259).enumerate() {
        btn.szTip[i] = ch;
    }
    btn
}

/// Пере-добавляет кнопки в панель задач по текущему состоянию (после
/// пересоздания кнопки окна). Использует `ThumbBarAddButtons`, т.к. набор
/// кнопок для новой кнопки окна пуст.
fn reinstall_from_state() {
    let Some(cell) = STATE.get() else { return };
    let st = cell.lock().unwrap();
    let hwnd = HWND(st.hwnd as *mut core::ffi::c_void);
    let prev = st.prev_icon;
    let next = st.next_icon;
    let playing = st.is_playing;
    let play = if playing { st.pause_icon } else { st.play_icon };
    drop(st);
    unsafe {
        let taskbar: Result<ITaskbarList3, _> =
            CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER);
        let Ok(taskbar) = taskbar else { return };
        if taskbar.HrInit().is_err() {
            return;
        }
        let tip = if playing { "Пауза" } else { "Воспроизвести" };
        let buttons = [
            make_button(BTN_PREV, prev, "Предыдущий трек"),
            make_button(BTN_PLAY, play, tip),
            make_button(BTN_NEXT, next, "Следующий трек"),
        ];
        let _ = taskbar.ThumbBarAddButtons(hwnd, &buttons);
    }
}

fn load_hicon(path: &Path) -> Option<HICON> {
    if !path.exists() {
        return None;
    }
    let wide: Vec<u16> = path
        .to_string_lossy()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        LoadImageW(
            None,
            windows::core::PCWSTR(wide.as_ptr()),
            IMAGE_ICON,
            0,
            0,
            LR_LOADFROMFILE | LR_DEFAULTSIZE,
        )
        .ok()
        .map(|h| HICON(h.0))
    }
}

fn install(
    hwnd: HWND,
    prev: Option<HICON>,
    play: Option<HICON>,
    next: Option<HICON>,
) -> windows::core::Result<()> {
    unsafe {
        let taskbar: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)?;
        taskbar.HrInit()?;

        let buttons = [
            make_button(BTN_PREV, prev, "Предыдущий трек"),
            make_button(BTN_PLAY, play, "Воспроизвести / Пауза"),
            make_button(BTN_NEXT, next, "Следующий трек"),
        ];
        taskbar.ThumbBarAddButtons(hwnd, &buttons)?;
    }
    Ok(())
}

/// Обновляет среднюю кнопку: play ↔ pause в зависимости от текущего состояния.
pub fn set_playing(playing: bool) {
    let cell = match STATE.get() {
        Some(c) => c,
        None => return,
    };
    let mut st = cell.lock().unwrap();
    if st.is_playing == playing {
        return;
    }
    st.is_playing = playing;
    let icon = if playing { st.pause_icon } else { st.play_icon };
    let hwnd = HWND(st.hwnd as *mut core::ffi::c_void);
    let prev = st.prev_icon;
    let next = st.next_icon;
    drop(st);
    unsafe {
        let taskbar: Result<ITaskbarList3, _> =
            CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER);
        let Ok(taskbar) = taskbar else { return };
        if taskbar.HrInit().is_err() {
            return;
        }
        let tip = if playing { "Пауза" } else { "Воспроизвести" };
        let buttons = [
            make_button(BTN_PREV, prev, "Предыдущий трек"),
            make_button(BTN_PLAY, icon, tip),
            make_button(BTN_NEXT, next, "Следующий трек"),
        ];
        let _ = taskbar.ThumbBarUpdateButtons(hwnd, &buttons);
    }
}

#[allow(dead_code)]
pub fn dispatch_click(app: &AppHandle, button_id: u32) {
    let cmd = match button_id {
        BTN_PREV => "prev",
        BTN_PLAY => "playpause",
        BTN_NEXT => "next",
        _ => return,
    };
    let _ = app.emit("bloom-command", cmd);
}
