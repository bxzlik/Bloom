import { create } from 'zustand'

/**
 * Переназначаемые ЛОКАЛЬНЫЕ горячие клавиши (внутри окна),
 * `DEFAULT_HOTKEYS`/`_hk*`. Это НЕ глобальные OS-хоткеи (тот
 * единственный — Win+Shift+X на tray-popup — регистрирует Rust); тут чистый
 * front-end keydown-матчинг, поэтому редактирование не требует Rust.
 *
 * Диспетчер клавиш на действия плеера — `app/useGlobalHotkeys` (вынесен в app,
 * чтобы не создавать цикл settings↔player).
 */

export type HotkeyAction =
  | 'play'
  | 'seekBack'
  | 'seekFwd'
  | 'prev'
  | 'next'
  | 'volUp'
  | 'volDown'
  | 'mute'
  | 'loop'
  | 'shuffle'
  | 'search'

export type HotkeyMod = 'Shift' | 'Ctrl' | 'Alt' | null

export interface Hotkey {
  label: string
  /** KeyboardEvent.code (например 'Space', 'KeyM', 'ArrowLeft'). */
  code: string
  /** Базовая клавиша для бейджа (без модификатора): '←', '→', 'M', 'Space'. */
  display: string
  mod: HotkeyMod
}

export const DEFAULT_HOTKEYS: Record<HotkeyAction, Hotkey> = {
  play: { label: 'Play / Pause', code: 'Space', display: 'Space', mod: null },
  seekBack: { label: 'Перемотка −5 сек', code: 'ArrowLeft', display: '←', mod: null },
  seekFwd: { label: 'Перемотка +5 сек', code: 'ArrowRight', display: '→', mod: null },
  prev: { label: 'Предыдущий трек', code: 'ArrowLeft', display: '←', mod: 'Shift' },
  next: { label: 'Следующий трек', code: 'ArrowRight', display: '→', mod: 'Shift' },
  volUp: { label: 'Громкость +5%', code: 'ArrowUp', display: '↑', mod: null },
  volDown: { label: 'Громкость −5%', code: 'ArrowDown', display: '↓', mod: null },
  mute: { label: 'Mute / Unmute', code: 'KeyM', display: 'M', mod: null },
  loop: { label: 'Повтор (Loop)', code: 'KeyL', display: 'L', mod: null },
  shuffle: { label: 'Перемешать', code: 'KeyS', display: 'S', mod: null },
  search: { label: 'Открыть поиск', code: 'KeyK', display: 'K', mod: 'Ctrl' },
}

/** Символ модификатора для бейджа. */
export const modSymbol = (mod: HotkeyMod): string =>
  mod === 'Shift' ? '⇧' : mod === 'Ctrl' ? 'Ctrl' : mod === 'Alt' ? 'Alt' : ''

const KEY = 'bloom_hotkeys'
const ENABLED_KEY = 'bloom_hotkeys_enabled'

const readHotkeys = (): Record<HotkeyAction, Hotkey> => {
  const out = {} as Record<HotkeyAction, Hotkey>
  let saved: Partial<Record<HotkeyAction, Hotkey>> = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    saved = {}
  }
  for (const k of Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[]) {
    out[k] = saved[k] ? { ...DEFAULT_HOTKEYS[k], ...saved[k] } : { ...DEFAULT_HOTKEYS[k] }
  }
  return out
}

const readEnabled = (): boolean => {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export interface HotkeysState {
  enabled: boolean
  hotkeys: Record<HotkeyAction, Hotkey>
  /** Действие, для которого сейчас идёт перехват новой клавиши (null = нет). */
  capturing: HotkeyAction | null
  setEnabled: (v: boolean) => void
  setHotkey: (k: HotkeyAction, patch: Partial<Hotkey>) => void
  resetAll: () => void
  setCapturing: (k: HotkeyAction | null) => void
}

export const useHotkeysStore = create<HotkeysState>((set, get) => ({
  enabled: readEnabled(),
  hotkeys: readHotkeys(),
  capturing: null,

  setEnabled: (v) => {
    try {
      localStorage.setItem(ENABLED_KEY, v ? 'true' : 'false')
    } catch {
      /* ignore */
    }
    set({ enabled: v })
  },

  setHotkey: (k, patch) => {
    const next = { ...get().hotkeys, [k]: { ...get().hotkeys[k], ...patch } }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
    set({ hotkeys: next })
  },

  resetAll: () => {
    const next = {} as Record<HotkeyAction, Hotkey>
    for (const k of Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[]) next[k] = { ...DEFAULT_HOTKEYS[k] }
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    set({ hotkeys: next })
  },

  setCapturing: (k) => set({ capturing: k }),
}))
