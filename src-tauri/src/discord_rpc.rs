//! Discord Rich Presence.
//! Используем крейт `discord-rich-presence` (сам делает IPC через named pipe),
//! поверх него — background thread с reconnect-backoff (5c → 60c) и очередью состояний.

use std::sync::mpsc::{channel, Sender, TryRecvError};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets, Button, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use once_cell::sync::OnceCell;
use parking_lot::Mutex;

const CLIENT_ID: &str = env!("DISCORD_CLIENT_ID");

#[derive(Clone, Debug, PartialEq)]
pub struct PresenceState {
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub artwork_url: String,
    pub position_sec: f64,
    pub duration_sec: f64,
    // Extended settings
    pub show_progress: bool,
    pub custom_artwork: String,
    pub show_small_img: bool,
    pub small_img_url: String,
    /// "off" | "default" | "custom" | "platform" ("" = legacy).
    pub small_img_mode: String,
    /// Площадка текущего трека: "soundcloud" | "ytmusic" | "spotify" | "yandex" | "".
    pub source: String,
    pub btn1_mode: String,
    pub btn1_label: String,
    pub btn1_url: String,
    pub btn2_mode: String,
    pub btn2_label: String,
    pub btn2_url: String,
}

impl PresenceState {
    pub fn empty() -> Self {
        Self {
            title: String::new(),
            artist: String::new(),
            playing: false,
            artwork_url: String::new(),
            position_sec: 0.0,
            duration_sec: 0.0,
            show_progress: true,
            custom_artwork: String::new(),
            show_small_img: true,
            small_img_url: String::new(),
            small_img_mode: String::new(),
            source: String::new(),
            btn1_mode: String::new(),
            btn1_label: String::new(),
            btn1_url: String::new(),
            btn2_mode: String::new(),
            btn2_label: String::new(),
            btn2_url: String::new(),
        }
    }
    pub fn is_empty(&self) -> bool {
        self.title.is_empty()
    }
    /// Считаем равными, если position расходится менее чем на 6 секунд.
    fn near_equal(&self, other: &PresenceState) -> bool {
        self.title == other.title
            && self.artist == other.artist
            && self.playing == other.playing
            && self.artwork_url == other.artwork_url
            && self.show_progress == other.show_progress
            && self.custom_artwork == other.custom_artwork
            && self.show_small_img == other.show_small_img
            && self.small_img_url == other.small_img_url
            && self.small_img_mode == other.small_img_mode
            && self.source == other.source
            && self.btn1_mode == other.btn1_mode
            && self.btn2_mode == other.btn2_mode
            && (self.position_sec - other.position_sec).abs() < 6.0
    }
}

enum Cmd {
    Update(PresenceState),
}

static TX: OnceCell<Mutex<Option<Sender<Cmd>>>> = OnceCell::new();

pub fn initialize() {
    let slot = TX.get_or_init(|| Mutex::new(None));
    let mut guard = slot.lock();
    // Идемпотентность: worker уже запущен → не плодим второй поток (важно при
    // включении RPC в рантайме через setdiscordrpc, когда initialize() из setup
    // уже мог отработать на старте).
    if guard.is_some() {
        return;
    }
    let (tx, rx) = channel::<Cmd>();
    *guard = Some(tx);
    drop(guard);

    thread::spawn(move || {
        let mut backoff_ms: u64 = 5_000;
        let max_backoff_ms: u64 = 60_000;
        let mut pending: Option<PresenceState> = None;

        loop {
            // Неблокирующе забираем накопившиеся обновления состояния.
            match rx.try_recv() {
                Ok(Cmd::Update(s)) => pending = Some(s),
                Err(TryRecvError::Empty) => {}
                Err(TryRecvError::Disconnected) => return,
            }

            let mut client = match DiscordIpcClient::new(CLIENT_ID) {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("DiscordRpc: client build failed: {e}");
                    wait_collecting(&rx, &mut pending, Duration::from_millis(backoff_ms));
                    backoff_ms = (backoff_ms * 2).min(max_backoff_ms);
                    continue;
                }
            };

            if let Err(e) = client.connect() {
                tracing::info!("DiscordRpc: connect failed: {e}");
                wait_collecting(&rx, &mut pending, Duration::from_millis(backoff_ms));
                backoff_ms = (backoff_ms * 2).min(max_backoff_ms);
                continue;
            }

            tracing::info!("DiscordRpc: connected");
            backoff_ms = 5_000;
            let mut last_sent: Option<PresenceState> = None;

            loop {
                let msg = if pending.is_some() {
                    // Если есть pending — пушим сразу, потом блокирующе ждём новые команды.
                    Cmd::Update(pending.take().unwrap())
                } else {
                    match rx.recv() {
                        Ok(c) => c,
                        Err(_) => return,
                    }
                };

                match msg {
                    Cmd::Update(state) => {
                        if last_sent.as_ref().map(|p| p.near_equal(&state)).unwrap_or(false) {
                            continue;
                        }
                        let send_result = if state.is_empty() {
                            client.clear_activity()
                        } else {
                            send_activity(&mut client, &state)
                        };
                        match send_result {
                            Ok(_) => {
                                last_sent = Some(state);
                            }
                            Err(e) => {
                                tracing::warn!("DiscordRpc: send failed: {e}");
                                // Сохраняем state как pending для реконнекта и выходим во внешний цикл.
                                pending = last_sent.take();
                                if pending.is_none() {
                                    pending = Some(state);
                                }
                                break;
                            }
                        }
                    }
                }
            }

            let _ = client.close();
            tracing::info!("DiscordRpc: reconnecting in {}s", backoff_ms / 1000);
            wait_collecting(&rx, &mut pending, Duration::from_millis(backoff_ms));
            backoff_ms = (backoff_ms * 2).min(max_backoff_ms);
        }
    });
}

/// Ждёт заданное время, собирая любые новые Update-команды в `pending`.
fn wait_collecting(
    rx: &std::sync::mpsc::Receiver<Cmd>,
    pending: &mut Option<PresenceState>,
    dur: Duration,
) {
    let deadline = Instant::now() + dur;
    while Instant::now() < deadline {
        let remaining = deadline - Instant::now();
        match rx.recv_timeout(remaining) {
            Ok(Cmd::Update(s)) => *pending = Some(s),
            Err(_) => break,
        }
    }
}

pub fn update(state: PresenceState) {
    if let Some(slot) = TX.get() {
        if let Some(tx) = slot.lock().as_ref() {
            let _ = tx.send(Cmd::Update(state));
        }
    }
}

pub fn clear() {
    update(PresenceState::empty());
}

/// Собирает Activity со ссылками на owned-строки в `state` и `effective_artwork`,
/// и отправляет его через client. Activity живёт только внутри функции.
fn send_activity(
    client: &mut DiscordIpcClient,
    state: &PresenceState,
) -> Result<(), Box<dyn std::error::Error>> {
    let details = trim_128(&state.title);
    let state_text = if state.artist.is_empty() {
        None
    } else {
        Some(trim_128(&state.artist))
    };

    // Large image: custom > track artwork > fallback
    let effective_custom = normalize_artwork_url(&state.custom_artwork);
    let effective_artwork = if effective_custom.is_some() {
        effective_custom
    } else {
        normalize_artwork_url(&state.artwork_url).map(|u| {
            u.replace("-t300x300.", "-t500x500.")
                .replace("-large.", "-t500x500.")
        })
    };
    let large_image: &str = match &effective_artwork {
        Some(u) => u.as_str(),
        None => "bloom",
    };

    // Small image: off | platform-бейдж | кастомный URL | дефолт (иконка приложения).
    let small_image: Option<String> = if !state.show_small_img {
        None
    } else {
        match state.small_img_mode.as_str() {
            "platform" => Some(platform_asset_key(&state.source).to_string()),
            "custom" => {
                Some(normalize_artwork_url(&state.small_img_url).unwrap_or_else(|| "bloom".into()))
            }
            "default" => Some("bloom".into()),
            // Legacy-конфиг (mode ещё не задан): старое поведение — URL если есть,
            // иначе иконка приложения.
            _ => Some(normalize_artwork_url(&state.small_img_url).unwrap_or_else(|| "bloom".into())),
        }
    };

    let mut activity = Activity::new()
        .activity_type(ActivityType::Listening)
        .details(details);
    if let Some(s) = state_text {
        activity = activity.state(s);
    }

    let mut assets = Assets::new().large_image(large_image);
    if let Some(ref si) = small_image {
        assets = assets
            .small_image(si.as_str())
            .small_text(platform_label(&state.source, &state.small_img_mode));
    }
    activity = activity.assets(assets);

    if state.playing && state.show_progress {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let start = now - state.position_sec as i64;
        if state.duration_sec > 1.0 {
            let end = start + state.duration_sec as i64;
            activity = activity.timestamps(Timestamps::new().start(start).end(end));
        } else {
            activity = activity.timestamps(Timestamps::new().start(start));
        }
    }

    // Buttons (Discord allows max 2)
    let mut buttons: Vec<Button<'_>> = Vec::new();
    for (mode, label, url) in [
        (&state.btn1_mode, &state.btn1_label, &state.btn1_url),
        (&state.btn2_mode, &state.btn2_label, &state.btn2_url),
    ] {
        if mode.is_empty() || mode == "off" { continue; }
        let effective_url = match mode.as_str() {
            "track" | "artist" | "custom" => url.as_str(),
            _ => continue,
        };
        let effective_label = match mode.as_str() {
            "track"  => "На трек",
            "artist" => "На артиста",
            "custom" => if label.is_empty() { continue } else { label.as_str() },
            _ => continue,
        };
        if effective_url.is_empty() { continue; }
        buttons.push(Button::new(effective_label, effective_url));
        if buttons.len() == 2 { break; }
    }
    if !buttons.is_empty() {
        activity = activity.buttons(buttons);
    }

    client.set_activity(activity)
}

fn trim_128(s: &str) -> &str {
    if s.len() <= 128 {
        s
    } else {
        // Обрезаем по char-boundary.
        let mut end = 128;
        while !s.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        &s[..end]
    }
}

/// Ключ ассета площадки (Art Assets в Discord Developer Portal). Локальные
/// треки/неизвестная площадка → иконка приложения "bloom".
fn platform_asset_key(source: &str) -> &'static str {
    match source {
        "soundcloud" => "soundcloud",
        "ytmusic" => "ytmusic",
        "spotify" => "spotify",
        "yandex" => "yandex",
        _ => "bloom",
    }
}

/// Подпись (tooltip) для маленькой иконки. В режиме площадки — имя площадки.
fn platform_label(source: &str, mode: &str) -> &'static str {
    if mode != "platform" {
        return "Bloom";
    }
    match source {
        "soundcloud" => "SoundCloud",
        "ytmusic" => "YouTube Music",
        "spotify" => "Spotify",
        "yandex" => "Яндекс Музыка",
        _ => "Bloom",
    }
}

fn normalize_artwork_url(url: &str) -> Option<String> {
    if url.trim().is_empty() {
        return None;
    }
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("blob:") || lower.starts_with("file:") || lower.starts_with("data:") {
        return None;
    }
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some(url.to_string());
    }
    if url.starts_with("//") {
        return Some(format!("https:{url}"));
    }
    None
}
