import { create } from 'zustand'

/**
 * Настраиваемые СИСТЕМНЫЕ (OS-global) горячие клавиши. Работают всегда, даже
 * когда окно не в фокусе — регистрируются через `@tauri-apps/plugin-global-shortcut`
 * прямо из фронта (см. `app/useGlobalHotkeys`). Локальных (in-app keydown)
 * хоткеев больше нет.
 *
 * Единственный НЕнастраиваемый global-хоткей — Win+Shift+X (показать/скрыть
 * окно) — регистрирует Rust (`global_hotkey.rs`), т.к. он завязан на состояние
 * OS-окна. Всё остальное здесь.
 */

export type HotkeyAction =
  | 'play'
  | 'next'
  | 'prev'
  | 'like'
  | 'volUp'
  | 'volDown'
  | 'toggleOverlay'

/** Порядок отображения в настройках (совпадает с макетом). */
export const HOTKEY_ORDER: HotkeyAction[] = [
  'play',
  'next',
  'prev',
  'like',
  'volUp',
  'volDown',
  'toggleOverlay',
]

/**
 * Дефолтные привязки. Медиа-действия по умолчанию не назначены (физические
 * медиаклавиши и так работают через SMTC) — пользователь задаёт их сам.
 * Оверлей сохраняет прежний глобальный хоткей Win+Shift+O.
 */
export const DEFAULT_BINDINGS: Record<HotkeyAction, string | null> = {
  play: null,
  next: null,
  prev: null,
  like: null,
  volUp: null,
  volDown: null,
  toggleOverlay: 'Super+Shift+O',
}

const KEY = 'bloom_global_hotkeys'
const ENABLED_KEY = 'bloom_global_hotkeys_enabled'

const readEnabled = (): boolean => {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

const readBindings = (): Record<HotkeyAction, string | null> => {
  const out = {} as Record<HotkeyAction, string | null>
  let saved: Partial<Record<HotkeyAction, string | null>> = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    saved = {}
  }
  for (const k of HOTKEY_ORDER) {
    out[k] = Object.prototype.hasOwnProperty.call(saved, k) ? (saved[k] ?? null) : DEFAULT_BINDINGS[k]
  }
  return out
}

const persist = (b: Record<HotkeyAction, string | null>): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(b))
  } catch {
    /* ignore */
  }
}

export interface HotkeysState {
  /** Мастер-переключатель: если false — ни один системный хоткей не регистрируется. */
  enabled: boolean
  /** action → accelerator (tauri-формат, напр. 'Alt+4') либо null (не назначено). */
  bindings: Record<HotkeyAction, string | null>
  /** Действие, для которого сейчас идёт перехват новой клавиши (null = нет). */
  capturing: HotkeyAction | null
  setEnabled: (v: boolean) => void
  setBinding: (k: HotkeyAction, accel: string | null) => void
  resetAll: () => void
  setCapturing: (k: HotkeyAction | null) => void
}

export const useHotkeysStore = create<HotkeysState>((set, get) => ({
  enabled: readEnabled(),
  bindings: readBindings(),
  capturing: null,

  setEnabled: (v) => {
    try {
      localStorage.setItem(ENABLED_KEY, v ? 'true' : 'false')
    } catch {
      /* ignore */
    }
    set({ enabled: v, capturing: v ? get().capturing : null })
  },

  setBinding: (k, accel) => {
    const next = { ...get().bindings }
    // Один и тот же акселератор не может висеть на двух действиях — снимаем с других.
    if (accel) {
      for (const a of HOTKEY_ORDER) if (a !== k && next[a] === accel) next[a] = null
    }
    next[k] = accel
    persist(next)
    set({ bindings: next })
  },

  resetAll: () => {
    const next = { ...DEFAULT_BINDINGS }
    persist(next)
    set({ bindings: next })
  },

  setCapturing: (k) => set({ capturing: k }),
}))

// --- Конвертация KeyboardEvent → tauri-accelerator и красивое отображение ---

/** Модификаторы из события в порядке, ожидаемом tauri-парсером. */
const eventMods = (e: KeyboardEvent): string[] => {
  const m: string[] = []
  if (e.metaKey) m.push('Super')
  if (e.ctrlKey) m.push('Ctrl')
  if (e.altKey) m.push('Alt')
  if (e.shiftKey) m.push('Shift')
  return m
}

/** Базовая клавиша (без модификаторов) в tauri-токен. null — если это сам модификатор. */
const eventKey = (e: KeyboardEvent): string | null => {
  const c = e.code
  if (['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(c))
    return null
  if (c.startsWith('Key')) return c.slice(3) // KeyA → A
  if (c.startsWith('Digit')) return c.slice(5) // Digit4 → 4
  if (c.startsWith('Numpad')) return c === 'NumpadEnter' ? 'Enter' : 'Num' + c.slice(6) // Numpad4 → Num4
  if (c.startsWith('Arrow')) return c.slice(5) // ArrowUp → Up
  if (/^F\d{1,2}$/.test(c)) return c // F5
  const MAP: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Tab: 'Tab',
  }
  return MAP[c] ?? null
}

export interface Captured {
  /** Accelerator в формате tauri (для register). */
  accelerator: string
  /** Читаемые сегменты для бейджа (['Alt','4']). */
  segments: string[]
}

/**
 * Разбирает keydown в accelerator. Требует хотя бы один модификатор — иначе
 * глобальный хоткей перехватывал бы одиночную клавишу во всей ОС. Возвращает
 * null, если клавиша не подходит (только модификатор / без модификатора / неизв.).
 */
export const captureFromEvent = (e: KeyboardEvent): Captured | null => {
  const mods = eventMods(e)
  const key = eventKey(e)
  if (!key || mods.length === 0) return null
  return {
    accelerator: [...mods, key].join('+'),
    segments: [...mods, key],
  }
}

/** Читаемая метка модификатора для бейджа. */
const SEG_LABEL: Record<string, string> = {
  Super: 'Win',
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
}

/** Accelerator ('Alt+Shift+O') → сегменты для бейджа (['Alt','Shift','O']). */
export const acceleratorSegments = (accel: string): string[] =>
  accel.split('+').map((s) => SEG_LABEL[s] ?? s)
