import { useEffect } from 'react'
import { create } from 'zustand'
import { t } from '@shared/i18n'
import { AUTO_ACCENT_L_DEFAULT, AUTO_ACCENT_L_MAX, AUTO_ACCENT_L_MIN } from '../lib/coverAccent'
import { isPixelFont } from '../lib/fonts'

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

/**
 * Пресет темы — встроенный или пользовательский. ТОЛЬКО ЦВЕТА: радиус и шрифт
 * в тему не входят намеренно, это независимые настройки внешнего вида, и смена
 * темы не должна их сбрасывать. Старые записи в localStorage могли содержать
 * radius/font — они просто игнорируются.
 */
export interface ThemePreset {
  id: string
  name: string
  custom?: boolean
  bg: string
  blockColor: string
  accent: string
  palette: ThemePalette
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
  /** Яркость авто-акцента (центр коридора светлоты, 0.1–0.6). См. coverAccent.ts. */
  autoAccentL: number
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
  /** Яркость авто-акцента (перерасчёт цвета делает autoAccentBridge). */
  setAutoAccentL: (v: number) => void
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
  autoAccentL: AUTO_ACCENT_L_DEFAULT,
  accentManual: '#3b82f6',
  palette: {} as ThemePalette,
  activeThemeId: '',
}

const clampAccentL = (v: number): number =>
  Math.max(AUTO_ACCENT_L_MIN, Math.min(AUTO_ACCENT_L_MAX, v))

export const FONT_PRESETS = [
  { label: 'Inter (по умолчанию)', value: 'Inter, system-ui, sans-serif' },
  { label: 'Manrope', value: 'Manrope, Inter, system-ui, sans-serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Системный', value: 'system-ui, sans-serif' },
] as const

/**
 * Встроенные пресеты тем.
 *
 * Пресет — это РОВНО ТРИ ЦВЕТА (`bg` = `blockColor` — плоская поверхность — и
 * `accent`), палитра пустая. Все вторичные тона считаются из них формулами
 * (DERIVED_SECONDARY ниже), теми же самыми, что и для пользовательской темы.
 * Это не экономия строк, а гарантия: тема, созданная через «+» с теми же тремя
 * цветами, получается ПОБИТОВО такой же, как пресет. Раньше вторичные тона у
 * пресетов были подобраны руками, и совпасть с ними кастомная тема не могла.
 *
 * Плоская поверхность значит, что блоки не выделяются собственным цветом: их
 * приподнимает только полупрозрачная плёнка (`rgba(var(--ovl-rgb),…)`,
 * color-mix c --ov-lift/--ov-card). Новые пресеты писать так же.
 */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'dark', name: 'Dark', bg: '#0a0a0a', blockColor: '#0a0a0a', accent: '#ffffff', palette: {} },
  { id: 'amoled', name: 'AMOLED', bg: '#000000', blockColor: '#000000', accent: '#ffffff', palette: {} },
  { id: 'midnight', name: 'Midnight', bg: '#101828', blockColor: '#101828', accent: '#4d9fff', palette: {} },
  { id: 'nord', name: 'Nord', bg: '#3b4252', blockColor: '#3b4252', accent: '#88c0d0', palette: {} },
  { id: 'warm', name: 'Warm', bg: '#1c1610', blockColor: '#1c1610', accent: '#d4875a', palette: {} },
  { id: 'light', name: 'Light', bg: '#e8e8e8', blockColor: '#e8e8e8', accent: '#333333', palette: {} },
]

const LS_KEY = 'bloom_theme'
const LS_CUSTOM_KEY = 'bloom_custom_themes'

/** Ключи вторичной палитры, применяемые/снимаемые единообразно (без --accent2). */
const SECONDARY_KEYS = ['--bg2', '--card', '--hover', '--border', '--glow', '--text', '--text2', '--muted'] as const
/** Все ключи палитры для снимка текущего вида (включая --accent2). */
const ALL_PALETTE_KEYS = [...SECONDARY_KEYS, '--accent2'] as const

/**
 * ВСЯ вторичная палитра как формулы от трёх цветов темы (фон / блоки / акцент).
 *
 * Один и тот же набор применяется и к пресету, и к пользовательской теме, и к
 * ручным пикерам — поэтому «те же три цвета» всегда дают один и тот же вид.
 * Значения подобраны так, чтобы попадать примерно туда же, где раньше стояли
 * ручные тона пресетов (см. таблицу в комментариях к каждой строке).
 *
 * Всё считается CSS-функциями, а не в JS: оттенок темы сохраняется сам, потому
 * что тона мешаются с ЕЁ ЖЕ поверхностью, а направление подмеса переворачивается
 * на светлой теме автоматически — там `--ovl-rgb` чёрный, а `--text` тёмный.
 *
 * `--text` формулой не выразить (нужен порог по светлоте) — он в applyToRoot.
 */
const DERIVED_SECONDARY: Partial<Record<(typeof SECONDARY_KEYS)[number], string>> = {
  // Плоская поверхность: блоки и вторичные подложки = цвет блоков.
  '--bg2': 'var(--block-color)',
  '--card': 'var(--block-color)',
  // Наведение — плёнка 5% (совпадает с дефолтом overrides-main.css).
  // Было руками: Dark #1c1c1c, AMOLED #131313, Light #dcdcdc.
  '--hover': 'rgba(var(--ovl-rgb),.05)',
  // Рамка — поверхность + плёнка 12%. Было: Dark #262626 (≈11%), Light #cfcfcf.
  '--border': 'color-mix(in srgb,var(--block-color),rgb(var(--ovl-rgb)) 12%)',
  // Свечение — сам акцент. У Midnight/Nord/Warm ровно так и было записано.
  '--glow': 'rgba(var(--accent-rgb),.2)',
  // Второстепенный текст и «глухой» — текст, утопленный в поверхность.
  // Было: Dark #999/#555 (≈40%/68%), Light #555/#9a9a9a.
  '--text2': 'color-mix(in srgb,var(--text),var(--block-color) 40%)',
  '--muted': 'color-mix(in srgb,var(--text),var(--block-color) 68%)',
}

/**
 * Акцент, подмешанный к поверхности: на тёмной теме темнее, на светлой светлее.
 * Доля вынесена в константу — её же считает mixHex для мини-окон, которые
 * color-mix от наших переменных использовать не могут (у них свой :root).
 */
const ACCENT2_MIX = 0.22
const DERIVED_ACCENT2 = `color-mix(in srgb,var(--accent),var(--block-color) ${ACCENT2_MIX * 100}%)`

/**
 * Конфликтует ли палитра с текущей поверхностью — судим по --text: он утонет,
 * если светлый на светлом или тёмный на тёмном. Пороги нарочно асимметричные и
 * с запасом: приглушённый серый текст в тёмной кастомной палитре — законный
 * приём, отбирать его не за что, а вот белое по белому чинить обязательно.
 * Нет --text вообще (кастомная тема из 3 цветов) — палитры нет, значит конфликт.
 *
 * У встроенных пресетов палитры больше нет вовсе, так что сюда попадают только
 * старые темы, сохранённые через «сохранить текущий вид» (saveAsPreset снимает
 * полную палитру). Их снимок уважаем, недостающие ключи добираем формулами.
 */
const paletteClashes = (palette: ThemePalette, light: boolean): boolean => {
  const lum = luminance(palette['--text'] ?? '')
  if (lum === null) return true
  return light ? lum > 0.6 : lum < 0.35
}

type Snapshot = Pick<
  ThemeState,
  'bg' | 'blockColor' | 'accent' | 'radius' | 'fontFamily' | 'autoAccent' | 'autoAccentL' | 'accentManual' | 'palette' | 'activeThemeId'
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
      autoAccentL: typeof p.autoAccentL === 'number' ? clampAccentL(p.autoAccentL) : DEFAULTS.autoAccentL,
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

/** Смешать два hex-цвета (a + b·t), как color-mix. Не hex → возвращаем a. */
const mixHex = (a: string, b: string, t: number): string => {
  const re = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i
  const ma = re.exec(a.trim())
  const mb = re.exec(b.trim())
  if (!ma || !mb) return a
  const ch = (i: number): string =>
    Math.round(parseInt(ma[i]!, 16) * (1 - t) + parseInt(mb[i]!, 16) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${ch(1)}${ch(2)}${ch(3)}`
}

/** Воспринимаемая светлота hex-цвета, 0..1. null — если это не hex. */
const luminance = (hex: string): number | null => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  const r = parseInt(m[1]!, 16) / 255
  const g = parseInt(m[2]!, 16) / 255
  const b = parseInt(m[3]!, 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

const contrastTextOn = (hex: string): string => {
  const lum = luminance(hex)
  return lum === null ? '#fff' : lum > 0.6 ? '#000' : '#fff'
}

/**
 * Тёмная тема или светлая. Смотрим на --block-color: полупрозрачные оверлеи
 * (рамки, заливки, ховеры) лежат в первую очередь на блоках, а не на подложке
 * окна; если блок светлый — белая плёнка невидима и нужно переключаться на
 * чёрную. --bg — только запасной сигнал, если blockColor не hex.
 */
const isLightSurface = (s: Snapshot): boolean => {
  const lum = luminance(s.blockColor) ?? luminance(s.bg)
  return lum !== null && lum > 0.6
}

/**
 * Три цвета для превью темы в списке: поверхность / блок под наведением / акцент
 * (кружки селектора, полоски карточек в онбординге).
 *
 * Тоже СЧИТАЮТСЯ от трёх цветов, а не хранятся. Раньше превью лежало в пресете
 * готовым, средний тон был подобран руками, а у созданной темы равнялся цвету
 * блоков — то есть два одинаковых кружка. Тема применялась одинаково, а в списке
 * пресет и кастомная тема с теми же цветами выглядели по-разному.
 */
const PREVIEW_FILM = 0.07
export const themePreview = (
  t: Pick<ThemePreset, 'bg' | 'blockColor' | 'accent'>,
): { bg: string; card: string; accent: string } => {
  const light = (luminance(t.blockColor) ?? luminance(t.bg) ?? 0) > 0.6
  return {
    bg: t.blockColor,
    card: mixHex(t.blockColor, light ? '#000000' : '#ffffff', PREVIEW_FILM),
    accent: t.accent,
  }
}

const applyToRoot = (s: Snapshot): void => {
  const root = document.documentElement
  root.style.setProperty('--bg', s.bg)
  root.style.setProperty('--block-color', s.blockColor)
  root.style.setProperty('--accent', s.accent)
  root.style.setProperty('--accent-rgb', hexToRgb(s.accent))
  root.style.setProperty('--accent-text', contrastTextOn(s.accent))
  root.style.setProperty('--radius', `${s.radius}px`)
  root.style.setProperty('--font', s.fontFamily)
  // Растровые шрифты рисуются иначе, чем векторные: без сглаживания, без
  // поддельного жира, без дробного трекинга. Правила — в pixel-font.css.
  root.classList.toggle('pixel-font', isPixelFont(s.fontFamily))
  // Светлая тема — не отдельный пресет, а режим: класс переключает --ovl-rgb
  // (см. root.css), и вся полупрозрачная плёнка интерфейса становится чёрной.
  const light = isLightSurface(s)
  root.classList.toggle('theme-light', light)
  // Вторичные тона: по умолчанию — формулы от трёх цветов (DERIVED_SECONDARY),
  // одни и те же для пресета, пользовательской темы и ручных пикеров. Явная
  // палитра (старая тема из saveAsPreset) перебивает формулу, но только если не
  // конфликтует с поверхностью по светлоте; недостающие ключи всё равно
  // добираются формулой, поэтому пропусков быть не может.
  const usePalette = !paletteClashes(s.palette, light)
  root.style.setProperty('--accent2', (usePalette && s.palette['--accent2']) || DERIVED_ACCENT2)
  for (const k of SECONDARY_KEYS) {
    // --text — единственный порог, а не формула: на светлой поверхности тёмный,
    // на тёмной светлый. От него уже считаются --text2/--muted.
    const derived = k === '--text' ? (light ? '#111111' : '#ffffff') : DERIVED_SECONDARY[k]!
    root.style.setProperty(k, (usePalette && s.palette[k]) || derived)
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
      // color-mix мини-окнам недоступен (свой :root) — считаем ту же формулу в JS.
      accent2: s.palette['--accent2'] || mixHex(s.accent, s.blockColor, ACCENT2_MIX),
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
    setAutoAccentL: (v) => set((s) => ({ ...persist({ ...s, autoAccentL: clampAccentL(v) }) })),
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
          // Только 3 основных цвета — вторичные считаются формулами (DERIVED_SECONDARY).
          palette: {},
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

/**
 * Светлая ли сейчас поверхность — тот же критерий, что и класс `.theme-light`
 * на <html>. Для React-кода, который считает цвета сам (canvas, SVG-градиенты),
 * где `var(--ovl-rgb)` не помогает: см. WaveCard.
 */
export const useIsLightTheme = (): boolean => useThemeStore(isLightSurface)

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
