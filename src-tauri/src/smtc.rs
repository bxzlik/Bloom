//! SystemMediaTransportControls.
//! Делает три вещи:
//! 1. Получает SMTC для HWND главного окна через ISystemMediaTransportControlsInterop.
//! 2. Регистрирует ButtonPressed, эмитит события bloom-command в JS
//!    (playpause / next / prev / stop) — это канал физических медиаклавиш,
//!    Bluetooth-гарнитур и флайаута Windows.
//! 3. Обновляет display (title/artist/обложка) и PlaybackStatus.

#![cfg(windows)]

use std::sync::Mutex;

use once_cell::sync::OnceCell;
use tauri::{AppHandle, Emitter, Manager};
use windows::core::HSTRING;
use windows::Foundation::{TypedEventHandler, Uri};
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
    SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
};
use windows::Storage::Streams::RandomAccessStreamReference;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::WinRT::{ISystemMediaTransportControlsInterop, RoGetActivationFactory};

static SMTC: OnceCell<Mutex<Option<SystemMediaTransportControls>>> = OnceCell::new();

pub fn initialize(app: &AppHandle) {
    let window = match app.get_webview_window("main") {
        Some(w) => w,
        None => {
            tracing::warn!("smtc: main window not found");
            return;
        }
    };
    let raw_hwnd = match window.hwnd() {
        Ok(h) => h,
        Err(e) => {
            tracing::warn!("smtc: get hwnd failed: {e}");
            return;
        }
    };
    let hwnd = HWND(raw_hwnd.0);

    let smtc = match get_for_window(hwnd) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("smtc: get_for_window failed: {e:?}");
            return;
        }
    };

    if let Err(e) = configure(&smtc) {
        tracing::warn!("smtc: configure failed: {e:?}");
        return;
    }

    let app_clone = app.clone();
    let handler = TypedEventHandler::<
        SystemMediaTransportControls,
        SystemMediaTransportControlsButtonPressedEventArgs,
    >::new(move |_sender, args| {
        if let Some(args) = args.as_ref() {
            if let Ok(button) = args.Button() {
                let cmd = match button {
                    SystemMediaTransportControlsButton::Play
                    | SystemMediaTransportControlsButton::Pause => Some("playpause"),
                    SystemMediaTransportControlsButton::Next => Some("next"),
                    SystemMediaTransportControlsButton::Previous => Some("prev"),
                    SystemMediaTransportControlsButton::Stop => Some("stop"),
                    _ => None,
                };
                if let Some(c) = cmd {
                    tracing::info!("smtc ButtonPressed: {c}");
                    let _ = app_clone.emit("bloom-command", c);
                }
            }
        }
        Ok(())
    });

    if let Err(e) = smtc.ButtonPressed(&handler) {
        tracing::warn!("smtc: ButtonPressed register failed: {e:?}");
    }

    SMTC.get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap()
        .replace(smtc);

    tracing::info!("smtc initialized");
}

fn get_for_window(hwnd: HWND) -> windows::core::Result<SystemMediaTransportControls> {
    let class_name: HSTRING = "Windows.Media.SystemMediaTransportControls".into();
    unsafe {
        let interop: ISystemMediaTransportControlsInterop = RoGetActivationFactory(&class_name)?;
        let smtc: SystemMediaTransportControls = interop.GetForWindow(hwnd)?;
        Ok(smtc)
    }
}

fn configure(smtc: &SystemMediaTransportControls) -> windows::core::Result<()> {
    smtc.SetIsEnabled(true)?;
    smtc.SetIsPlayEnabled(true)?;
    smtc.SetIsPauseEnabled(true)?;
    smtc.SetIsNextEnabled(true)?;
    smtc.SetIsPreviousEnabled(true)?;
    smtc.SetIsStopEnabled(true)?;
    smtc.SetPlaybackStatus(MediaPlaybackStatus::Stopped)?;
    Ok(())
}

pub fn update_display(title: &str, artist: &str, playing: bool, artwork_url: Option<&str>) {
    let cell = match SMTC.get() {
        Some(c) => c,
        None => return,
    };
    let guard = cell.lock().unwrap();
    let smtc = match guard.as_ref() {
        Some(s) => s,
        None => return,
    };

    if let Err(e) = update_inner(smtc, title, artist, playing, artwork_url) {
        tracing::warn!("smtc update_display: {e:?}");
    }
}

fn update_inner(
    smtc: &SystemMediaTransportControls,
    title: &str,
    artist: &str,
    playing: bool,
    artwork_url: Option<&str>,
) -> windows::core::Result<()> {
    if title.is_empty() || title == "Bloom" {
        smtc.SetPlaybackStatus(MediaPlaybackStatus::Stopped)?;
        let updater = smtc.DisplayUpdater()?;
        updater.ClearAll()?;
        updater.Update()?;
        return Ok(());
    }

    smtc.SetPlaybackStatus(if playing {
        MediaPlaybackStatus::Playing
    } else {
        MediaPlaybackStatus::Paused
    })?;

    let updater = smtc.DisplayUpdater()?;
    updater.SetType(MediaPlaybackType::Music)?;
    let music = updater.MusicProperties()?;
    music.SetTitle(&HSTRING::from(title))?;
    music.SetArtist(&HSTRING::from(artist))?;

    if let Some(url) = artwork_url {
        if !url.is_empty() {
            match Uri::CreateUri(&HSTRING::from(url))
                .and_then(|u| RandomAccessStreamReference::CreateFromUri(&u))
            {
                Ok(stream) => {
                    let _ = updater.SetThumbnail(&stream);
                }
                Err(e) => tracing::warn!("smtc artwork URI: {e:?}"),
            }
        }
    }

    updater.Update()?;
    Ok(())
}
