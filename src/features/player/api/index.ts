import { invoke, type MpState, type PlayerCommand } from '@shared/tauri'

/**
 * Player API: тонкие типизированные обёртки над Rust-командами из commands.rs.
 * Список — см. `src-tauri/COMMANDS.md`.
 */

// --- Mini player state cache (Rust держит зеркало для прочих окон) ---
export const miniplayerGetState = (): Promise<MpState> =>
  invoke('miniplayer_get_state')

// --- Окна ---
export const openMiniplayer = (): Promise<void> => invoke('open_miniplayer')
export const closeMiniplayer = (): Promise<void> => invoke('close_miniplayer')
export const openMainWindow = (): Promise<void> => invoke('open_main_window')
export const hideTrayPopup = (): Promise<void> => invoke('hide_tray_popup')
export const exitApp = (): Promise<void> => invoke('exit_app')

// --- Команды плеера через miniplayer_cmd ---
// Rust ретранслирует в событие `bloom-command` для main-окна,
// либо в `bloom-mp-seek` / `bloom-mp-volume` для двусторонней синхронизации.

export const sendPlayerCommand = (cmd: PlayerCommand): Promise<void> =>
  invoke('miniplayer_cmd', { cmd })

export const seek = (positionSec: number): Promise<void> =>
  invoke('miniplayer_cmd', { cmd: 'seek', value: positionSec })

export const setVolume = (volume0to100: number): Promise<void> =>
  invoke('miniplayer_cmd', { cmd: 'volume', value: volume0to100 })

// --- Прочие действия из tray-popup / miniplayer ---
export const trayOpenArtist = (artist: string): Promise<void> =>
  invoke('tray_open_artist', { artist })

export const mpAddToLib = (): Promise<void> => invoke('mp_add_to_lib')
export const mpAddToPlaylist = (plId: string): Promise<void> =>
  invoke('mp_add_to_pl', { plId })
export const mpOpenNewPlaylist = (): Promise<void> => invoke('mp_open_new_pl')

// High-level player API (main окно).
export * from './play'
