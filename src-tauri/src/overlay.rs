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
/// Порог «магнита» (логич. px): ближе этого к краю/центру — прилипаем.
const SNAP: f64 = 16.0;

#[derive(Clone)]
struct OverlayCfg {
    enabled: bool,
    /// Якорь на экране: "tl"|"tc"|"tr"|"bl"|"bc"|"br" (верт. t/b + гориз. l/c/r)
    /// либо "custom" — свободная позиция по долям cust_x/cust_y.
    anchor: String,
    /// Доля масштаба, 1.0 = 100%.
    size: f64,
    /// Свободная позиция: доля рабочей области (0..1) по гор./верт. (anchor=="custom").
    cust_x: f64,
    cust_y: f64,
}

impl Default for OverlayCfg {
    fn default() -> Self {
        Self { enabled: false, anchor: "tr".to_string(), size: 1.0, cust_x: 0.98, cust_y: 0.02 }
    }
}

static CFG: OnceCell<Mutex<OverlayCfg>> = OnceCell::new();
/// OS-окно уже показано хотя бы раз (после этого не прячем при авто-скрытии).
static SHOWN: AtomicBool = AtomicBool::new(false);
/// Режим ручного размещения активен: плашка закреплена и таскается мышью.
/// Пока он включён — set_config НЕ репозиционирует окно (иначе drag дёргался бы).
static PLACING: AtomicBool = AtomicBool::new(false);
/// «Сырая» позиция окна во время drag (физ. px), БЕЗ прилипания — чтобы магнит
/// был чисто визуальным и не «залипал» при мелких движениях мыши.
static DRAG_RAW: OnceCell<Mutex<(f64, f64)>> = OnceCell::new();

fn cfg() -> &'static Mutex<OverlayCfg> {
    CFG.get_or_init(|| Mutex::new(OverlayCfg::default()))
}

/// Поле тени вокруг плашки внутри окна, в физ. пикселях (масштабируется размером
/// плашки и DPI). Видимая плашка = окно минус 2× это поле с каждой стороны.
fn pad_phys(win: &WebviewWindow) -> f64 {
    let scale = win.scale_factor().unwrap_or(1.0);
    PAD * cfg().lock().size * scale
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
pub fn set_config(app: &AppHandle, enabled: bool, anchor: String, size: f64, cust_x: f64, cust_y: f64, preview: bool) {
    {
        let mut c = cfg().lock();
        c.enabled = enabled;
        c.anchor = anchor;
        c.size = size.clamp(0.5, 1.6);
        c.cust_x = cust_x.clamp(0.0, 1.0);
        c.cust_y = cust_y.clamp(0.0, 1.0);
    }
    // В режиме ручного размещения только обновляем cfg — окном рулит drag.
    if PLACING.load(Ordering::Relaxed) {
        return;
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

#[derive(Clone, serde::Serialize)]
struct OvPlace {
    /// Включить/выключить режим ручного размещения на стороне плашки.
    on: bool,
}

#[derive(Clone, serde::Serialize)]
struct OvPlaced {
    /// Новые доли позиции (0..1) после перетаскивания.
    x: f64,
    y: f64,
}

/// Войти/выйти из режима ручного размещения. В режиме плашка показана и
/// закреплена, окно ловит мышь (click-through off), а JS делает её drag-ручкой.
/// Выход — снимаем закрепление и возвращаем обычное поведение (авто-скрытие).
pub fn set_place_mode(app: &AppHandle, on: bool) {
    let c = cfg().lock().clone();
    let Some(win) = app.get_webview_window("overlay") else { return };
    if on {
        if !c.enabled {
            return;
        }
        PLACING.store(true, Ordering::Relaxed);
        ensure_shown(&win);
        // Ловим мышь, чтобы можно было схватить плашку.
        let _ = win.set_ignore_cursor_events(false);
        position(&win);
        push_state(&win);
        // Стартовая «сырая» позиция для drag = текущее положение ПЛАШКИ (окно + поле).
        if let Ok(p) = win.outer_position() {
            let pad = pad_phys(&win);
            *DRAG_RAW.get_or_init(|| Mutex::new((0.0, 0.0))).lock() =
                (p.x as f64 + pad, p.y as f64 + pad);
        }
        let _ = win.emit("bloom-ov-place", OvPlace { on: true });
    } else {
        // Если режим размещения и так не активен — ничего не делаем. Иначе любой
        // «выключающий» вызов (размонтирование секции настроек, в т.ч. двойной
        // mount React StrictMode в dev) гасил бы и откреплял видимую плашку.
        if !PLACING.swap(false, Ordering::Relaxed) {
            return;
        }
        let _ = win.emit("bloom-ov-place", OvPlace { on: false });
    }
}

/// Сдвинуть окно оверлея на дельту (в логических CSS-пикселях экрана) — ручное
/// перетаскивание плашки в режиме размещения. Накапливаем «сырую» позицию, а к
/// окну применяем её с прилипанием к краям/центру. Доли пересчитает Moved-хендлер.
pub fn drag_by(app: &AppHandle, dx: f64, dy: f64) {
    if !PLACING.load(Ordering::Relaxed) {
        return;
    }
    let Some(win) = app.get_webview_window("overlay") else { return };
    let scale = win.scale_factor().unwrap_or(1.0);
    let Ok(size) = win.outer_size() else { return };
    let (mx, my, mw, mh) = work_area(&win);
    // Работаем в координатах ВИДИМОЙ плашки (окно минус поле тени), чтобы прижимать
    // вплотную к кромке экрана: поле уходит за край (оно прозрачное).
    let pad = pad_phys(&win);
    let (pw, ph) = (size.width as f64 - 2.0 * pad, size.height as f64 - 2.0 * pad);
    let (free_x, free_y) = ((mw - pw).max(0.0), (mh - ph).max(0.0));

    // Накапливаем чистую позицию плашки (без магнита), чтобы из прилипания можно
    // было выйти плавным движением.
    let raw = DRAG_RAW.get_or_init(|| Mutex::new((0.0, 0.0)));
    let (rx, ry) = {
        let mut r = raw.lock();
        r.0 += dx * scale;
        r.1 += dy * scale;
        r.0 = r.0.clamp(mx, mx + free_x);
        r.1 = r.1.clamp(my, my + free_y);
        (r.0, r.1)
    };

    let snap = SNAP * scale;
    // Точки прилипания плашки по оси: вплотную к краю / центр / противоположный край.
    let snap_axis = |v: f64, lo: f64, free: f64| -> f64 {
        for t in [lo, lo + free / 2.0, lo + free] {
            if (v - t).abs() <= snap {
                return t;
            }
        }
        v
    };
    // Позиция плашки → позиция окна (сдвиг на поле тени).
    let nx = snap_axis(rx, mx, free_x) - pad;
    let ny = snap_axis(ry, my, free_y) - pad;
    let _ = win.set_position(PhysicalPosition::new(nx.round(), ny.round()));
}

/// Окно оверлея сдвинули (drag в режиме размещения) — пересчитать доли
/// позиции относительно рабочей области и сообщить main-окну (persist в стор).
pub fn report_moved(app: &AppHandle) {
    if !PLACING.load(Ordering::Relaxed) {
        return;
    }
    let Some(win) = app.get_webview_window("overlay") else { return };
    let (mx, my, mw, mh) = work_area(&win);
    let Ok(pos) = win.outer_position() else { return };
    let Ok(size) = win.outer_size() else { return };
    // Доли считаем по ПЛАШКЕ (окно минус поле тени), как и снап.
    let pad = pad_phys(&win);
    let (pw, ph) = (size.width as f64 - 2.0 * pad, size.height as f64 - 2.0 * pad);
    let (px, py) = (pos.x as f64 + pad, pos.y as f64 + pad);
    let denom_x = (mw - pw).max(1.0);
    let denom_y = (mh - ph).max(1.0);
    let fx = ((px - mx) / denom_x).clamp(0.0, 1.0);
    let fy = ((py - my) / denom_y).clamp(0.0, 1.0);
    {
        let mut c = cfg().lock();
        c.cust_x = fx;
        c.cust_y = fy;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("bloom-ov-placed", OvPlaced { x: fx, y: fy });
    }
    // Плашке — для живого бейджа с координатами во время перетаскивания.
    let _ = win.emit("bloom-ov-placed", OvPlaced { x: fx, y: fy });
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
    let (x, y) = if c.anchor == "custom" {
        // Свободная позиция: доля хода ПЛАШКИ внутри рабочей области; окно сдвигаем
        // на поле тени, чтобы при долях 0/1 плашка прижималась вплотную к кромке.
        let pad = PAD * c.size * scale;
        let pw = (w - 2.0 * pad).max(1.0);
        let ph = (h - 2.0 * pad).max(1.0);
        (
            mx + (mw - pw).max(0.0) * c.cust_x - pad,
            my + (mh - ph).max(0.0) * c.cust_y - pad,
        )
    } else {
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
        (x, y)
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
