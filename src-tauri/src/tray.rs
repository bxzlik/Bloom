//! Трей-иконка. ПКМ — кастомный попап (окно `tray-popup`), двойной ЛКМ — главное окно.

use std::sync::Mutex;

use once_cell::sync::OnceCell;
use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

static TRAY_ICON: OnceCell<Mutex<Option<TrayIcon<tauri::Wry>>>> = OnceCell::new();
struct RgbaIcon { rgba: Vec<u8>, w: u32, h: u32 }
static DEFAULT_ICON: OnceCell<Option<RgbaIcon>> = OnceCell::new();

const POPUP_W: f64 = 300.0;
const POPUP_H: f64 = 290.0;
const POPUP_GAP: f64 = 8.0;

pub fn initialize(app: &AppHandle) -> tauri::Result<()> {
    let app_handle = app.clone();
    let default_icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        tauri::image::Image::new_owned(vec![0; 0], 0, 0)
    });
    let _ = DEFAULT_ICON.set(Some(RgbaIcon {
        rgba: default_icon.rgba().to_vec(),
        w: default_icon.width(),
        h: default_icon.height(),
    }));

    let tray = TrayIconBuilder::with_id("bloom-tray")
        .tooltip("Bloom")
        .icon(default_icon)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |tray, event| {
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    button_state: MouseButtonState::Up,
                    rect,
                    ..
                } => {
                    // Колбэк трея исполняется на главном потоке, а ленивое создание
                    // окна попапа само ждёт главный цикл — уводим в async runtime,
                    // иначе дедлок (как с sync-командами, создающими окна).
                    let app = tray.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        show_popup(&app, rect);
                    });
                }
                TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                } => {
                    show_main(tray.app_handle());
                }
                _ => {}
            }
        })
        .build(&app_handle)?;

    TRAY_ICON
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap()
        .replace(tray);

    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Показывает попап над иконкой трея и эмитит свежее состояние плеера в окно.
/// Окно создаётся лениво при первом показе (mirror.rs); хук автоскрытия по
/// потере фокуса вешается там же при создании.
fn show_popup(app: &AppHandle, rect: tauri::Rect) {
    let Some(win) = crate::mirror::ensure_tray_popup(app) else { return };

    let scale = win.scale_factor().unwrap_or(1.0);
    let icon_pos = rect.position.to_physical::<f64>(scale);
    let icon_size = rect.size.to_physical::<f64>(scale);

    // Размер попапа в физических пикселях.
    let popup_w_phys = POPUP_W * scale;
    let popup_h_phys = POPUP_H * scale;
    let gap_phys = POPUP_GAP * scale;

    // По умолчанию ставим попап над иконкой, выровняв по правому краю иконки.
    // Если получилось за границей экрана — корректируем.
    let icon_right = icon_pos.x + icon_size.width;
    let icon_top = icon_pos.y;

    let mut x = icon_right - popup_w_phys;
    let mut y = icon_top - popup_h_phys - gap_phys;

    // Если иконка трея сверху экрана — показываем под иконкой.
    if y < 0.0 {
        y = icon_pos.y + icon_size.height + gap_phys;
    }

    // Не даём улететь влево от экрана.
    if let Ok(Some(m)) = win.current_monitor() {
        let m_pos = m.position();
        let m_size = m.size();
        let min_x = m_pos.x as f64 + 4.0;
        let max_x = (m_pos.x + m_size.width as i32) as f64 - popup_w_phys - 4.0;
        if x < min_x { x = min_x; }
        if x > max_x { x = max_x; }
    }

    let _ = win.set_position(PhysicalPosition::new(x, y));

    // Сначала эмитим текущее состояние, потом показываем — чтобы UI не моргал старыми данными.
    let s = crate::commands::miniplayer_get_state();
    let _ = win.emit_to("tray-popup", "bloom-mp-state", s);
    let _ = win.emit_to("tray-popup", "bloom-win-vis", true);

    let _ = win.show();
    let _ = win.set_focus();
}

/// Декодирует JPEG/PNG-байты, ресайзит до 32×32 и устанавливает иконку трея.
/// Если `bytes.is_empty()` — восстанавливает дефолтную иконку приложения.
pub fn set_icon_from_bytes(bytes: &[u8]) {
    let cell = match TRAY_ICON.get() {
        Some(c) => c,
        None => return,
    };
    let guard = cell.lock().unwrap();
    let tray = match guard.as_ref() {
        Some(t) => t,
        None => return,
    };

    if bytes.is_empty() {
        if let Some(Some(def)) = DEFAULT_ICON.get() {
            let icon = Image::new_owned(def.rgba.clone(), def.w, def.h);
            let _ = tray.set_icon(Some(icon));
        }
        return;
    }

    let img = match image::load_from_memory(bytes) {
        Ok(i) => i,
        Err(e) => {
            tracing::warn!("tray cover decode failed: {e}");
            return;
        }
    };
    let mut resized = img
        .resize_exact(32, 32, image::imageops::FilterType::Lanczos3)
        .to_rgba8();

    // Круглый клип — AA по внешней кромке.
    const SIZE: i32 = 32;
    let cx = (SIZE as f32 - 1.0) / 2.0;
    let cy = (SIZE as f32 - 1.0) / 2.0;
    let r = (SIZE as f32 - 2.0) / 2.0;
    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let d = (dx * dx + dy * dy).sqrt();
            let alpha = if d <= r - 0.5 {
                1.0
            } else if d >= r + 0.5 {
                0.0
            } else {
                r + 0.5 - d
            };
            let px = resized.get_pixel_mut(x as u32, y as u32);
            let a = (px.0[3] as f32 * alpha).round() as u8;
            px.0[3] = a;
        }
    }

    let (w, h) = (resized.width(), resized.height());
    let icon = Image::new_owned(resized.into_raw(), w, h);
    let _ = tray.set_icon(Some(icon));
}

pub fn reset_icon() {
    set_icon_from_bytes(&[]);
}

/// Для совместимости — теперь NowPlaying в трей-меню больше нет, но команды его дёргают.
pub fn update_now_playing(_title: &str, _artist: &str, _playing: bool) {
    // no-op: меню больше нет, информация показывается в попапе
}
