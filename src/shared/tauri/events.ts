import { listen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type {
  DownloadState,
  LocalTrackInfo,
  LyricsResult,
  MpState,
  PlayerCommand,
  UpdateProgress,
} from './types'

/**
 * Все события, эмиттируемые из Rust через `app.emit(name, payload)`.
 * Источник: src-tauri/COMMANDS.md (раздел "События").
 *
 * Ключ — имя события (в kebab-case с префиксом `bloom-`), значение — payload.
 * Для безпейлоадных событий — `void`.
 */
export interface AppEvents {
  'bloom-set-title': string
  'bloom-mp-state': MpState
  'bloom-mp-closed': void
  'bloom-mp-seek': number
  'bloom-mp-volume': number
  'bloom-mp-add-to-lib': void
  'bloom-mp-add-to-pl': string
  'bloom-mp-new-pl': void
  'bloom-command': PlayerCommand
  'bloom-open-artist': string
  'bloom-deeplink': string
  'bloom-download-state': DownloadState
  'bloom-lyrics': LyricsResult
  'bloom-folder-list': string[]
  'bloom-folder-tracks': LocalTrackInfo[]
  'bloom-folder-removed': string
  'bloom-folder-track-removed': string
  'bloom-autostart-state': boolean
  'bloom-autoplay-state': boolean
  'bloom-minimize-to-tray': boolean
  'bloom-window-focus': boolean
  'bloom-window-minimized': boolean
  'bloom-set-maximized': boolean
  'bloom-update-progress': UpdateProgress
  /** Оверлей передвинут в режиме ручного размещения: новые доли позиции (0..1). */
  'bloom-ov-placed': { x: number; y: number }
}

export type AppEventName = keyof AppEvents

/**
 * Метка своего окна как target подписки. С дефолтным `{kind:'Any'}` слушатель
 * ловит и адресные `emit_to(другое_окно, ..)` из Rust — так, например, «стоп
 * рендера» скрываемого tray-popup замораживал открытый PiP. Помеченный
 * слушатель получает только свои адресные события + broadcast `app.emit`.
 *
 * Лениво: `getCurrentWindow()` требует уже внедрённый `__TAURI_INTERNALS__`.
 */
let selfLabel: string | undefined
const label = (): string => (selfLabel ??= getCurrentWindow().label)

/**
 * Типизированная подписка на событие из Rust. Возвращает функцию отписки.
 *
 * @example
 * const unlisten = await onAppEvent('bloom-mp-state', (state) => {
 *   // state: MpState
 * })
 * // позже: unlisten()
 */
export const onAppEvent = <K extends AppEventName>(
  name: K,
  handler: (payload: AppEvents[K]) => void,
): Promise<UnlistenFn> => {
  const cb: EventCallback<AppEvents[K]> = (e) => handler(e.payload)
  return listen<AppEvents[K]>(name, cb, { target: label() })
}
