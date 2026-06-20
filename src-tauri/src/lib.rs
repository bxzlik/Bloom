//! Bloom — точка входа Tauri-приложения.

mod audio_proxy;
mod autostart;
mod commands;
mod config;
mod cover_server;
mod discord_rpc;
mod events;
mod file_protocol;
mod folder_watcher;
mod global_hotkey;
mod logger;
mod lyrics_service;
mod overlay;
mod pipe;
mod smtc;
mod thumb_toolbar;
mod tray;
mod updater;
mod spotify;
mod window_chrome;
mod yandex;
mod ytm;

use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Инициализация логгера как можно раньше, до Tauri.
    if let Err(e) = logger::init() {
        eprintln!("logger init failed: {e}");
    }

    tracing::info!("Bloom starting...");

    // AppUserModelID должен быть установлен ДО создания первого окна,
    // иначе Windows привяжет к иконке в taskbar свой авто-ID и Jump List
    // не найдёт цель. Та же причина: RegisterAppId в реестре.
    #[cfg(windows)]
    {
        if let Err(e) = window_chrome::register_app_id() {
            tracing::warn!("RegisterAppId failed: {e}");
        }
        window_chrome::set_app_user_model_id();
    }

    let builder = tauri::Builder::default()
        // --- Кастомный протокол bloom-file:// (локальные аудио с HTTP Range) ---
        .register_uri_scheme_protocol(file_protocol::SCHEME, |ctx, req| {
            file_protocol::handle(ctx, req)
        })
        // --- Плагины ---
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            tracing::info!("second instance args: {:?}", argv);
            let is_cmd = argv.iter().any(|a| {
                matches!(a.as_str(), "--playpause" | "--next" | "--prev")
            });
            if is_cmd {
                // Jump List команда — обработать без показа окна.
                pipe::dispatch_argv(app, &argv);
            } else {
                // Любой другой запуск (в том числе bloom://) — показать окно и обработать URL.
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
                pipe::dispatch_argv(app, &argv);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // --- Команды ---
        .invoke_handler(tauri::generate_handler![
            commands::get_app_settings,
            commands::setautostart,
            commands::getautostart,
            commands::setautoplay,
            commands::getautoplay,
            commands::setminimize_to_tray,
            commands::getminimize_to_tray,
            commands::setdiscordrpc,
            commands::getdiscordrpc,
            updater::app_version,
            updater::check_update,
            updater::fetch_update_notes,
            updater::download_update,
            updater::install_update,
            commands::set_discord_settings,
            commands::get_discord_settings,
            commands::setchangetitlebar,
            commands::getchangetitlebar,
            commands::setchangetray_cover,
            commands::getchangetray_cover,
            commands::setzoom,
            commands::setwinzoom,
            commands::now_playing,
            commands::set_cover_data,
            commands::folder_add,
            commands::folder_remove,
            commands::folder_scan,
            commands::folder_get,
            commands::sc_download,
            commands::pick_playlist_dir,
            commands::download_to_dir,
            commands::local_download,
            commands::cover_download,
            commands::lyrics_request,
            commands::lyrics_cache_clear,
            commands::lyrics_cache_stats,
            commands::lyrics_cache_purge,
            commands::set_lyrics_cache,
            commands::genius_token,
            commands::jserror,
            commands::export_playlist_file,
            commands::import_playlist_file,
            commands::export_logs,
            commands::read_logs,
            commands::clear_logs,
            commands::get_pending_deep_link,
            commands::open_miniplayer,
            commands::close_miniplayer,
            commands::overlay_set_config,
            commands::overlay_flash,
            commands::overlay_toggle,
            commands::overlay_set_interactive,
            commands::miniplayer_cmd,
            commands::miniplayer_get_state,
            commands::mp_add_to_lib,
            commands::mp_add_to_pl,
            commands::mp_open_new_pl,
            commands::open_main_window,
            commands::hide_tray_popup,
            commands::exit_app,
            commands::tray_open_artist,
            commands::ym_auth_start,
            commands::ym_auth_poll,
            commands::ym_is_authed,
            commands::ym_logout,
            commands::ym_search,
            commands::ym_album,
            commands::ym_artist,
            commands::ym_playlist,
            commands::ym_playlist_uuid,
            commands::ym_resolve,
            commands::ym_has_plus,
            commands::ym_stream_url,
            commands::ym_proxy_url,
            commands::ym_wave_tracks,
            commands::ym_wave_feedback,
            commands::ytm_search,
            commands::ytm_stream_url,
            commands::ytm_album,
            commands::ytm_artist,
            commands::ytm_playlist,
            commands::ytm_track,
            commands::ui_log,
            commands::sp_search,
            commands::sp_album,
            commands::sp_artist,
            commands::sp_playlist,
            commands::sp_track,
            commands::sp_set_creds,
            commands::sp_get_creds,
            commands::sp_has_creds,
            commands::sp_check,
            commands::sp_clear_creds,
        ]);

    builder
        .setup(|app| {
            tracing::info!("Bloom setup starting");

            #[cfg(windows)]
            {
                window_chrome::apply_to_main_window(app.handle());
                // Apply DWM rounded corners to mini player window too
                if let Some(mp) = app.get_webview_window("miniplayer") {
                    use windows::Win32::Foundation::HWND;
                    if let Ok(hwnd) = mp.hwnd() {
                        window_chrome::apply_dwm(HWND(hwnd.0));
                    }
                }
                if let Some(tp) = app.get_webview_window("tray-popup") {
                    use windows::Win32::Foundation::HWND;
                    if let Ok(hwnd) = tp.hwnd() {
                        window_chrome::apply_dwm(HWND(hwnd.0));
                    }
                }
            }

            // Восстанавливаем размер/позицию/масштаб окна из window.json.
            if let Ok(ws) = config::load_window_state() {
                if let Some(w) = app.get_webview_window("main") {
                    if let (Some(width), Some(height)) = (ws.width, ws.height) {
                        let _ = w.set_size(tauri::LogicalSize::new(width, height));
                    }
                    if let (Some(x), Some(y)) = (ws.left, ws.top) {
                        let _ = w.set_position(tauri::LogicalPosition::new(x, y));
                    }
                    let maximized = w.is_maximized().unwrap_or(false);
                    if maximized {
                        if let Some(z) = ws.zoom { let _ = w.set_zoom(z); }
                    } else {
                        let z = ws.window_zoom.or(ws.zoom).unwrap_or(1.0);
                        let _ = w.set_zoom(z);
                    }
                }
            }

            // Сохраняем размер/позицию при изменениях (дебаунс через таймер).
            if let Some(win) = app.get_webview_window("main") {
                let win_clone = win.clone();
                // Хендл для эмита событий фокуса/сворачивания (слой «Оптимизация» во фронте).
                let opt_app = app.handle().clone();
                win.on_window_event(move |event| {
                    match event {
                        // Фокус окна → фронт включает/снимает упрощение графики (анфокус).
                        tauri::WindowEvent::Focused(focused) => {
                            events::emit_window_focus(&opt_app, *focused);
                        }
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            let settings = config::load_app_settings().unwrap_or_default();
                            if settings.minimize_to_tray {
                                api.prevent_close();
                                let _ = win_clone.hide();
                            }
                        }
                        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                            let Ok(scale) = win_clone.scale_factor() else { return };
                            let Ok(size) = win_clone.outer_size() else { return };
                            let Ok(pos) = win_clone.outer_position() else { return };
                            let Ok(maximized) = win_clone.is_maximized() else { return };
                            let Ok(minimized) = win_clone.is_minimized() else { return };
                            // Свёрнуто/восстановлено → фронт включает/снимает «умное
                            // высвобождение ресурсов» (Resized стреляет на minimize/restore).
                            events::emit_window_minimized(&opt_app, minimized);
                            // Применяем зум в зависимости от режима окна
                            if !minimized {
                                let ws = config::load_window_state().unwrap_or_default();
                                let zoom = if maximized {
                                    ws.zoom.unwrap_or(1.0)
                                } else {
                                    ws.window_zoom.or(ws.zoom).unwrap_or(1.0)
                                };
                                let _ = win_clone.set_zoom(zoom);
                            }
                            // Windows при сворачивании присваивает окну позицию
                            // (-32000, -32000) и размер ~20×20 — сохранять такое
                            // нельзя, иначе при следующем запуске окно окажется
                            // за пределами экрана.
                            if maximized || minimized || pos.x < -10_000 || pos.y < -10_000 {
                                return;
                            }
                            let w = size.width as f64 / scale;
                            let h = size.height as f64 / scale;
                            if w < 100.0 || h < 100.0 {
                                return;
                            }
                            let mut ws = config::load_window_state().unwrap_or_default();
                            ws.width = Some(w);
                            ws.height = Some(h);
                            ws.left = Some(pos.x as f64 / scale);
                            ws.top = Some(pos.y as f64 / scale);
                            let _ = config::save_window_state(&ws);
                        }
                        _ => {}
                    }
                });
            }

            // Регистрируем bloom:// схему в реестре Windows для текущего пользователя.
            // Это нужно в dev-режиме; NSIS-инсталлятор делает то же самое для всех пользователей.
            if let Err(e) = app.deep_link().register_all() {
                tracing::warn!("deep link register failed: {e}");
            }

            // Если приложение запущено через bloom:// deep link — сохранить для фронтенда.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                if let Some(url) = urls.first() {
                    tracing::info!("startup deep link: {url}");
                    commands::set_pending_deep_link(url.to_string());
                }
            }
            // Хендлер для deep link при уже запущенном приложении.
            let dl_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    tracing::info!("deep link: {url}");
                    let _ = dl_handle.emit("bloom-deeplink", url.to_string());
                }
            });

            // Если приложение запущено с CLI-командой (через Jump List) — обработать.
            pipe::dispatch_startup(app.handle());

            // Запускаем сканирование и watch-мониторинг пользовательских папок.
            folder_watcher::start_all(app.handle());

            // Локальный HTTP-сервер для обложек Discord RPC.
            cover_server::start();

            // Локальный аудио-прокси (Яндекс/SoundCloud стрим в обход
            // TLS/CORS-проблем WebView2).
            audio_proxy::start();

            // Глобальный хоткей Win+Shift+X.
            global_hotkey::register(app.handle());

            // SMTC — панель Windows и физические медиаклавиши.
            #[cfg(windows)]
            smtc::initialize(app.handle());

            // Трей-иконка с меню.
            if let Err(e) = tray::initialize(app.handle()) {
                tracing::warn!("tray init failed: {e}");
            }

            // Thumbnail toolbar поверх главного окна.
            #[cfg(windows)]
            thumb_toolbar::initialize(app.handle());

            // Discord RPC (подключится только если пользователь запустил Discord).
            let settings = config::load_app_settings().unwrap_or_default();
            if settings.discord_rpc {
                discord_rpc::initialize();
            }
            lyrics_service::set_disk_cache(settings.lyrics_disk_cache);

            tracing::info!("Bloom setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Bloom");
}
