import { useEffect } from 'react'
import { create } from 'zustand'
import { t } from '@shared/i18n'

/**
 * Тема UI — настройки внешнего вида, которые применяются через CSS custom
 * properties на `document.documentElement`. Без persistence в Rust — только
 * `localStorage[bloom_theme]` (+ `localStorage[bloom_custom_themes]` для
 * пользовательских пресетов).
 *
 * Основные поля (всегда применяются):
 *   - bg          — цвет страницы / фон body (`--bg`)
 *   - blockColor  — цвет блоков-контейнеров (`--block-color`, и `--card` следует
 *                   за ним через overrides-main.css, если палитра его не задаёт)
 *   - accent      — акцентный цвет (`--accent`)
 *   - radius      — радиус скругления (`--radius` в px)
 *   - fontFamily  — UI-шрифт (`--font`)
 *
 * Вторичная палитра (`palette`) — остальные тоновые переменные легаси-темы
 * (`--bg2/--card/--hover/--border/--accent2/--glow/--text/--text2/--muted`).
 * Их дефолты живут в shared/styles/root.css; когда активен пресет, мы переопределяем
 * их инлайном на :root, когда нет — снимаем (revert к root.css). Это даёт
 * полноценные пресеты тем (Light/Nord/…), т.к. CSS bloom потребляет
 * весь этот набор переменных.
 *
 * Прозрачность блоков (blockOpacity), bgBlur/bgDim — отложенная «тяжёлая»
 * инфра (стекло/прозрачность), в пресеты пока не входит.
 *
 * Производные CSS vars:
 *   - --accent-rgb (r,g,b триплет для rgba()-литералов)
 *   - --accent-text (контрастный цвет для текста на accent — белый/чёрный)
 *   - --accent2 — палитра пресета либо сам accent (для hover-состояний)
 */

/** Вторичные тоновые переменные пресета (без основных bg/block/accent). */
export type ThemePalette = Record<string, string>

/** Пресет темы — встроенный или пользовательский. */
export interface ThemePreset {
  id: string
  name: string
  custom?: boolean
  bg: string
  blockColor: string
  accent: string
  palette: ThemePalette
  preview: { bg: string; card: string; accent: string }
  radius?: number
  font?: string
}

export interface ThemeState {
  bg: string
  blockColor: string
  accent: string
  /** Радиус скругления (px). */
  radius: number
  /** CSS font-family для UI (--font). */
  fontFamily: string
  /** Авто-акцент из обложки трека. */
  autoAccent: boolean
  /** Ручной акцент — точка восстановления при выключении авто-акцента. */
  accentManual: string
  /** Вторичная палитра активного пресета (пустая = дефолты root.css). */
  palette: ThemePalette
  /** id активного пресета ('' / 'custom' — нет совпадения). */
  activeThemeId: string
  /** Пользовательские пресеты (зеркало bloom_custom_themes). */
  customThemes: ThemePreset[]
  setBg: (v: string) => void
  setBlockColor: (v: string) => void
  /** Ручной выбор акцента — ВЫКЛЮЧАЕТ авто-акцент. */
  setAccent: (v: string) => void
  setRadius: (v: number) => void
  setFontFamily: (v: string) => void
  setAutoAccent: (v: boolean) => void
  /** Применить извлечённый из обложки акцент (авто-акцент остаётся вкл). */
  applyAutoAccent: (v: string) => void
  /** Применить пресет темы (встроенный или пользовательский). */
  applyTheme: (id: string) => void
  /** Сохранить текущий вид как пользовательский пресет. */
  saveAsPreset: (name: string) => void
  /** Создать пользовательский пресет из заданных цветов (фон/блоки/акцент) и применить. */
  createCustomTheme: (name: string, colors: { bg: string; blockColor: string; accent: string }) => void
  /** Удалить пользовательский пресет. */
  deleteCustomTheme: (id: string) => void
  resetAll: () => void
}

const DEFAULTS = {
  bg: '#0a0a0a',
  blockColor: '#0a0a0a',
  accent: '#3b82f6',
  radius: 14,
  fontFamily: 'Inter, system-ui, sans-serif',
  autoAccent: false,
  accentManual: '#3b82f6',
  palette: {} as ThemePalette,
  activeThemeId: '',
}

export const FONT_PRESETS = [
  { label: 'Inter (по умолчанию)', value: 'Inter, system-ui, sans-serif' },
  { label: 'Manrope', value: 'Manrope, Inter, system-ui, sans-serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Системный', value: 'system-ui, sans-serif' },
] as const

/**
 * Встроенные пресеты тем.
 * `vars['--bg']` (внутренняя поверхность) и `appBg` (фон body) в bloom
 * слиты в одно `bg` (body использует var(--bg)); берём видимый фон = appBg ?? --bg.
 * `blockColor` = blockColor ?? vars['--card']; `palette` = остальные тона.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'dark',
    name: 'Dark',
    bg: '#0f0f0f',
    blockColor: '#0f0f0f',
    accent: '#888888',
    palette: { '--bg2': '#141414', '--card': '#1a1a1a', '--hover': '#222222', '--border': '#2a2a2a', '--accent2': '#666666', '--glow': 'rgba(136,136,136,.2)', '--text': '#ffffff', '--text2': '#999999', '--muted': '#555555' },
    preview: { bg: '#141414', card: '#1a1a1a', accent: '#888888' },
  },
  {
    id: 'amoled',
    name: 'AMOLED',
    bg: '#0a0a0a',
    blockColor: '#0a0a0a',
    accent: '#ffffff',
    palette: { '--bg2': '#050505', '--card': '#0a0a0a', '--hover': '#111111', '--border': '#2e2e2e', '--accent2': '#cccccc', '--glow': 'rgba(255,255,255,.15)', '--text': '#ffffff', '--text2': '#888888', '--muted': '#444444' },
    preview: { bg: '#050505', card: '#0a0a0a', accent: '#ffffff' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    bg: '#101828',
    blockColor: '#101828',
    accent: '#4d9fff',
    palette: { '--bg2': '#0b1020', '--card': '#101828', '--hover': '#162135', '--border': '#1e2d42', '--accent2': '#2e7acc', '--glow': 'rgba(77,159,255,.2)', '--text': '#e8f0ff', '--text2': '#7a9cc4', '--muted': '#3a5070' },
    preview: { bg: '#0b1020', card: '#101828', accent: '#4d9fff' },
  },
  {
    id: 'nord',
    name: 'Nord',
    bg: '#3b4252',
    blockColor: '#3b4252',
    accent: '#88c0d0',
    palette: { '--bg2': '#2e3440', '--card': '#3b4252', '--hover': '#434c5e', '--border': '#3d4758', '--accent2': '#81a1c1', '--glow': 'rgba(136,192,208,.2)', '--text': '#eceff4', '--text2': '#d8dee9', '--muted': '#7a889e' },
    preview: { bg: '#2e3440', card: '#3b4252', accent: '#88c0d0' },
  },
  {
    id: 'warm',
    name: 'Warm',
    bg: '#1c1610',
    blockColor: '#1c1610',
    accent: '#d4875a',
    palette: { '--bg2': '#131009', '--card': '#1c1610', '--hover': '#25201a', '--border': '#2e2518', '--accent2': '#b86a3a', '--glow': 'rgba(212,135,90,.2)', '--text': '#f5ede4', '--text2': '#a08060', '--muted': '#5a4030' },
    preview: { bg: '#131009', card: '#1c1610', accent: '#d4875a' },
  },
  {
    id: 'light',
    name: 'Light',
    bg: '#e8e8e8',
    blockColor: '#ffffff',
    accent: '#333333',
    palette: { '--bg2': '#f0f0f0', '--card': '#ffffff', '--hover': '#f5f5f5', '--border': '#d0d0d0', '--accent2': '#555555', '--glow': 'rgba(0,0,0,.08)', '--text': '#111111', '--text2': '#555555', '--muted': '#aaaaaa' },
    preview: { bg: '#f0f0f0', card: '#ffffff', accent: '#333333' },
  },
]

const LS_KEY = 'bloom_theme'
const LS_CUSTOM_KEY = 'bloom_custom_themes'

/** Ключи вторичной палитры, применяемые/снимаемые единообразно (без --accent2). */
const SECONDARY_KEYS = ['--bg2', '--card', '--hover', '--border', '--glow', '--text', '--text2', '--muted'] as const
/** Все ключи палитры для снимка текущего вида (включая --accent2). */
const ALL_PALETTE_KEYS = [...SECONDARY_KEYS, '--accent2'] as const

type Snapshot = Pick<
  ThemeState,
  'bg' | 'blockColor' | 'accent' | 'radius' | 'fontFamily' | 'autoAccent' | 'accentManual' | 'palette' | 'activeThemeId'
>

const loadCustomThemes = (): ThemePreset[] => {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

const saveCustomThemes = (arr: ThemePreset[]): void => {
  try {
    localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(arr))
  } catch {
    /* full → ignore */
  }
}

const loadFromLs = (): Snapshot => {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw)
    return {
      bg: typeof p.bg === 'string' ? p.bg : DEFAULTS.bg,
      blockColor: typeof p.blockColor === 'string' ? p.blockColor : DEFAULTS.blockColor,
      accent: typeof p.accent === 'string' ? p.accent : DEFAULTS.accent,
      radius: typeof p.radius === 'number' ? p.radius : DEFAULTS.radius,
      fontFamily: typeof p.fontFamily === 'string' ? p.fontFamily : DEFAULTS.fontFamily,
      autoAccent: !!p.autoAccent,
      accentManual: typeof p.accentManual === 'string' ? p.accentManual : (typeof p.accent === 'string' ? p.accent : DEFAULTS.accentManual),
      palette: p.palette && typeof p.palette === 'object' ? (p.palette as ThemePalette) : {},
      activeThemeId: typeof p.activeThemeId === 'string' ? p.activeThemeId : '',
    }
  } catch {
    return DEFAULTS
  }
}

const saveToLs = (s: Snapshot): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch {
    /* full → ignore */
  }
}

const hexToRgb = (hex: string): string => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return '0,0,0'
  return `${parseInt(m[1]!, 16)},${parseInt(m[2]!, 16)},${parseInt(m[3]!, 16)}`
}

const contrastTextOn = (hex: string): string => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return '#fff'
  const r = parseInt(m[1]!, 16) / 255
  const g = parseInt(m[2]!, 16) / 255
  const b = parseInt(m[3]!, 16) / 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum > 0.6 ? '#000' : '#fff'
}

const applyToRoot = (s: Snapshot): void => {
  const root = document.documentElement
  root.style.setProperty('--bg', s.bg)
  root.style.setProperty('--block-color', s.blockColor)
  root.style.setProperty('--accent', s.accent)
  root.style.setProperty('--accent-rgb', hexToRgb(s.accent))
  root.style.setProperty('--accent-text', contrastTextOn(s.accent))
  // --accent2: палитра пресета либо сам accent (для hover-состояний).
  root.style.setProperty('--accent2', s.palette['--accent2'] || s.accent)
  root.style.setProperty('--radius', `${s.radius}px`)
  root.style.setProperty('--font', s.fontFamily)
  // Вторичные тона: задаём из палитры пресета либо снимаем (revert к root.css).
  for (const k of SECONDARY_KEYS) {
    const v = s.palette[k]
    if (v) root.style.setProperty(k, v)
    else root.style.removeProperty(k)
  }
}

/**
 * Публикуем тему в miniplayer/tray-popup. Эти окна — самодостаточный vanilla HTML
 * (см./picture-in-picture.html), который читает `localStorage['bloom_settings']` и
 * слушает `storage`-событие (одна origin → событие долетает в другие окна). Формат
 * `applySettings`: accent/accent2/font/radius + blockR/G/B (из
 * blockColor). Без этого окна остаются на дефолтной палитре.
 */
const publishToMpWindows = (s: Snapshot): void => {
  try {
    const settings: Record<string, unknown> = {
      accent: s.accent,
      accent2: s.palette['--accent2'] || s.accent,
      radius: `${s.radius}px`,
    }
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s.blockColor.trim())
    if (m) {
      settings.blockR = parseInt(m[1]!, 16)
      settings.blockG = parseInt(m[2]!, 16)
      settings.blockB = parseInt(m[3]!, 16)
    }
    localStorage.setItem('bloom_settings', JSON.stringify(settings))
  } catch {
    /* localStorage недоступен — игнор */
  }
}

/** Снимок текущей эффективной палитры (inline → computed) для нового пресета. */
const readCurrentPalette = (): ThemePalette => {
  const root = document.documentElement
  const cs = getComputedStyle(root)
  const out: ThemePalette = {}
  for (const k of ALL_PALETTE_KEYS) {
    const inline = root.style.getPropertyValue(k).trim()
    const v = inline || cs.getPropertyValue(k).trim()
    if (v) out[k] = v
  }
  return out
}

const initial: Snapshot = loadFromLs()
const initialCustoms = loadCustomThemes()

export const useThemeStore = create<ThemeState>((set, get) => {
  const persist = (next: Snapshot): Snapshot => {
    saveToLs(next)
    applyToRoot(next)
    publishToMpWindows(next)
    return next
  }
  const getAllThemes = (): ThemePreset[] => [...THEME_PRESETS, ...get().customThemes]
  return {
    ...initial,
    customThemes: initialCustoms,
    setBg: (v) => set((s) => ({ ...persist({ ...s, bg: v, activeThemeId: 'custom' }) })),
    setBlockColor: (v) => set((s) => ({ ...persist({ ...s, blockColor: v, activeThemeId: 'custom' }) })),
    // Ручной выбор акцента — выключает авто-акцент, помечает тему как custom.
    setAccent: (v) => set((s) => ({ ...persist({ ...s, accent: v, accentManual: v, autoAccent: false, activeThemeId: 'custom' }) })),
    setRadius: (v) => set((s) => ({ ...persist({ ...s, radius: v }) })),
    setFontFamily: (v) => set((s) => ({ ...persist({ ...s, fontFamily: v }) })),
    setAutoAccent: (v) =>
      set((s) => ({
        ...(v
          ? persist({ ...s, autoAccent: true, accentManual: s.accent })
          : persist({ ...s, autoAccent: false, accent: s.accentManual })),
      })),
    // Извлечённый из обложки цвет: меняем только эффективный accent, авто остаётся.
    applyAutoAccent: (v) => set((s) => ({ ...persist({ ...s, accent: v }) })),
    applyTheme: (id) =>
      set((s) => {
        const t = getAllThemes().find((x) => x.id === id)
        if (!t) return s
        return persist({
          ...s,
          bg: t.bg,
          blockColor: t.blockColor,
          accent: t.accent,
          accentManual: t.accent,
          autoAccent: false,
          palette: { ...t.palette },
          radius: t.radius ?? s.radius,
          fontFamily: t.font ?? s.fontFamily,
          activeThemeId: id,
        })
      }),
    saveAsPreset: (name) =>
      set((s) => {
        const id = 'custom_' + Date.now()
        const theme: ThemePreset = {
          id,
          name: name.trim() || t('theme.myPreset'),
          custom: true,
          bg: s.bg,
          blockColor: s.blockColor,
          accent: s.accent,
          palette: readCurrentPalette(),
          preview: { bg: s.bg, card: s.blockColor, accent: s.accent },
          radius: s.radius,
          font: s.fontFamily,
        }
        const customThemes = [...s.customThemes, theme]
        saveCustomThemes(customThemes)
        return { ...persist({ ...s, activeThemeId: id }), customThemes }
      }),
    createCustomTheme: (name, colors) =>
      set((s) => {
        const id = 'custom_' + Date.now()
        const theme: ThemePreset = {
          id,
          name: name.trim() || t('theme.defaultName'),
          custom: true,
          bg: colors.bg,
          blockColor: colors.blockColor,
          accent: colors.accent,
          // Только 3 основных цвета — вторичные тона берём из дефолтов root.css.
          palette: {},
          preview: { bg: colors.bg, card: colors.blockColor, accent: colors.accent },
          radius: s.radius,
          font: s.fontFamily,
        }
        const customThemes = [...s.customThemes, theme]
        saveCustomThemes(customThemes)
        return {
          ...persist({
            ...s,
            bg: theme.bg,
            blockColor: theme.blockColor,
            accent: theme.accent,
            accentManual: theme.accent,
            autoAccent: false,
            palette: {},
            activeThemeId: id,
          }),
          customThemes,
        }
      }),
    deleteCustomTheme: (id) =>
      set((s) => {
        const customThemes = s.customThemes.filter((t) => t.id !== id)
        saveCustomThemes(customThemes)
        if (s.activeThemeId === id) {
          const dark = THEME_PRESETS[0]!
          return {
            ...persist({
              ...s,
              bg: dark.bg,
              blockColor: dark.blockColor,
              accent: dark.accent,
              accentManual: dark.accent,
              autoAccent: false,
              palette: { ...dark.palette },
              activeThemeId: dark.id,
            }),
            customThemes,
          }
        }
        return { ...s, customThemes }
      }),
    resetAll: () => set((s) => ({ ...persist({ ...DEFAULTS }), customThemes: s.customThemes })),
  }
})

/** Применить тему к :root при первом маунте. Подключается в App.tsx. */
export const useThemeBootstrap = (): void => {
  useEffect(() => {
    applyToRoot(useThemeStore.getState())
    // Стартовая публикация — miniplayer/tray, открытые до первого изменения темы,
    // должны сразу получить актуальные цвета/шрифт (читают bloom_settings при старте).
    publishToMpWindows(useThemeStore.getState())
  }, [])
}

export const THEME_DEFAULTS = DEFAULTS
