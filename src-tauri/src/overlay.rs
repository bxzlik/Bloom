//! Оверлей-«остров» — всплывающая плашка now-playing поверх всех окон.
//!
//! Окно `overlay`: прозрачное, click-through, always-on-top, без фокуса. Сам
//! ПОКАЗ/СКРЫТИЕ плашки (fade) рулит JS через CSS; OS-окно после первого показа
//! НЕ прячем — иначе каждый показ воровал бы фокус у активного приложения (игры).
//! Прячем OS-окно только при полном выключении оверлея в настройках.
//!
//! Поток данных:
//!   - фронт зовёт `overlay_set_config` при старте/смене настроек (режим/якорь/размер);
//!   - `overlay_flash` — на смену трека (если включено) → JS показывает на N сек;
//!   - хоткей Win+Shift+O → `toggle` → JS закрепляет/снимает плашку.
//! Контент плашка берёт из `bloom-mp-state` (тот же кэш, что у мини-плеера/трея).

use std::sync::atomic::{AtomicBool, Ordering};

use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Логический размер дизайна плашки (без поля под тень).
const PILL_W: f64 = 380.0;
const PILL_H: f64 = 64.0;
/// Поле вокруг плашки внутри окна — чтобы мягкая тень не обрезалась краем окна.
const PAD: f64 = 28.0;
/// Отступ окна от края рабочей области экрана.
const MARGIN: f64 = 4.0;

#[derive(Clone)]
struct OverlayCfg {
    enabled: bool,
    /// Якорь на экране: "tl"|"tc"|"tr"|"bl"|"bc"|"br" (верт. t/b + гориз. l/c/r).
    anchor: String,
    /// Доля масштаба, 1.0 = 100%.
    size: f64,
}

impl Default for OverlayCfg {
    fn default() -> Self {
        Self { enabled: false, anchor: "tr".to_string(), size: 1.0 }
    }
}

static CFG: OnceCell<Mutex<OverlayCfg>> = OnceCell::new();
/// OS-окно уже показано хотя бы раз (после этого не прячем при авто-скрытии).
static SHOWN: AtomicBool = AtomicBool::new(false);

fn cfg() -> &'static Mutex<OverlayCfg> {
    CFG.get_or_init(|| Mutex::new(OverlayCfg::default()))
}

#[derive(Clone, serde::Serialize)]
struct OvShow {
    /// Закрепить (true — без авто-скрытия) — для тогла по хоткею.
    pinned: bool,
    anchor: String,
}

/// Обновить конфиг (режим/якорь/размер). Зовётся фронтом при старте (preview=false)
/// и при смене настроек оверлея пользователем (preview=true → живой показ плашки).
/// При выключении — прячем окно (и сбрасываем «показано»).
pub fn set_config(app: &AppHandle, enabled: bool, anchor: String, size: f64, preview: bool) {
    {
        let mut c = cfg().lock();
        c.enabled = enabled;
        c.anchor = anchor;
        c.size = size.clamp(0.5, 1.6);
    }
    let Some(win) = app.get_webview_window("overlay") else { return };
    if !enabled {
        let _ = win.hide();
        SHOWN.store(false, Ordering::Relaxed);
        return;
    }
    if preview {
        // Живой предпросмотр при включении / смене позиции / масштаба.
        let c = cfg().lock().clone();
        ensure_shown(&win);
        position(&win);
        push_state(&win);
        let _ = win.emit("bloom-ov-show", OvShow { pinned: false, anchor: c.anchor });
    } else if win.is_visible().unwrap_or(false) {
        // Старт при уже видимой плашке — просто применяем позицию/размер.
        position(&win);
    }
}

/// Всплытие на смену трека: показать плашку и дать JS запустить авто-скрытие.
pub fn flash(app: &AppHandle) {
    let c = cfg().lock().clone();
    if !c.enabled {
        return;
    }
    let Some(win) = app.get_webview_window("overlay") else { return };
    ensure_shown(&win);
    position(&win);
    push_state(&win);
    let _ = win.emit("bloom-ov-show", OvShow { pinned: false, anchor: c.anchor });
}

/// Тогл по хоткею: закрепить/снять плашку (логика пина — на стороне JS).
pub fn toggle(app: &AppHandle) {
    let c = cfg().lock().clone();
    if !c.enabled {
        return;
    }
    let Some(win) = app.get_webview_window("overlay") else { return };
    ensure_shown(&win);
    position(&win);
    push_state(&win);
    let _ = win.emit("bloom-ov-toggle", OvShow { pinned: true, anchor: c.anchor });
}

fn push_state(win: &WebviewWindow) {
    let s = crate::commands::miniplayer_get_state();
    let _ = win.emit("bloom-mp-state", s);
}

fn ensure_shown(win: &WebviewWindow) {
    let _ = win.set_ignore_cursor_events(true);
    let _ = win.set_always_on_top(true);
    if !SHOWN.swap(true, Ordering::Relaxed) {
        let _ = win.show();
    }
}

/// Размер + позиция окна по якорю/масштабу в физических пикселях текущего монитора.
fn position(win: &WebviewWindow) {
    let c = cfg().lock().clone();
    let scale = win.scale_factor().unwrap_or(1.0);
    let w_log = (PILL_W + 2.0 * PAD) * c.size;
    let h_log = (PILL_H + 2.0 * PAD) * c.size;
    let w = w_log * scale;
    let h = h_log * scale;
    let _ = win.set_size(PhysicalSize::new(w.round().max(1.0) as u32, h.round().max(1.0) as u32));

    let (mx, my, mw, mh) = work_area(win);
    let mg = MARGIN * scale;
    let horiz = c.anchor.chars().nth(1).unwrap_or('r');
    let x = match horiz {
        'l' => mx + mg,
        'c' => mx + (mw - w) / 2.0,
        _ => mx + mw - w - mg,
    };
    let y = if c.anchor.starts_with('t') {
        my + mg
    } else {
        my + mh - h - mg
    };
    let _ = win.set_position(PhysicalPosition::new(x.round(), y.round()));
}

/// Рабочая область (без панели задач) монитора, на котором окно. Физ. пиксели.
#[cfg(windows)]
fn work_area(win: &WebviewWindow) -> (f64, f64, f64, f64) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    if let Ok(h) = win.hwnd() {
        unsafe {
            let mon = MonitorFromWindow(HWND(h.0), MONITOR_DEFAULTTONEAREST);
            let mut mi = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if GetMonitorInfoW(mon, &mut mi).as_bool() {
                let r = mi.rcWork;
                return (
                    r.left as f64,
                    r.top as f64,
                    (r.right - r.left) as f64,
                    (r.bottom - r.top) as f64,
                );
            }
        }
    }
    fallback_area(win)
}

#[cfg(not(windows))]
fn work_area(win: &WebviewWindow) -> (f64, f64, f64, f64) {
    fallback_area(win)
}

/// Запасной вариант — полные границы монитора (с панелью задач).
fn fallback_area(win: &WebviewWindow) -> (f64, f64, f64, f64) {
    if let Ok(Some(m)) = win.current_monitor() {
        let p = m.position();
        let s = m.size();
        return (p.x as f64, p.y as f64, s.width as f64, s.height as f64);
    }
    (0.0, 0.0, 1920.0, 1080.0)
}
