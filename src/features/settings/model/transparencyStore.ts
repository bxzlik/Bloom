import { useEffect } from 'react'
import { create } from 'zustand'
import { useThemeStore } from './themeStore'
import { usePlayerViewStore } from './playerViewStore'

/**
 * Прозрачность / стекло для блоков интерфейса (категория ПРОЗРАЧНОСТЬ раздела
 * «Интерфейс», `setTransparencyMode`/`_applyTransparency`).
 *
 * РАЗЛИЧИЕ С ЛЕГАСИ (важно): в движок раскрашивал каждый блок инлайном
 * (`el.style.background = ...`). В bloom блоки получают
 * `background: var(--block-color) !important` из overrides-main.css — инлайн без
 * `!important` их не перебьёт. Поэтому реализуем стекло через CSS:
 *   - стор ставит на :root две переменные — `--glass-block-bg` (rgba цвета блока
 *     с альфой blockOpacity) и `--glass-filter` (blur + brightness);
 *   - класс `glass-mode` на <body> включает правила в transparency.css, которые
 *     дают внешним контейнерам (sidebar/main/правые панели) стекло + полу-
 *     прозрачный фон, а внутренним блокам — `transparent` (родительское стекло
 *     просвечивает). Ровно та же логика outer/inner, что в _glassOuter/_glassInner.
 *
 * Мини-плеер (#miniPlayer) получает стекло только в режиме фона «Тема»
 * (mpBgMode==='theme') — с легаси, где он добавлялся в _glassOuter лишь при
 * `_mpBgMode==='theme'`. Гейт — через body-класс `mp-bg-theme`.
 *
 * blockOpacity влияет на вид ТОЛЬКО при включённой прозрачности (в легаси
 * blockAlpha применялся лишь при `_trMode==='on'`), поэтому отдельной настройки
 * непрозрачности вне стекла здесь нет.
 */

export type TrMode = 'off' | 'on'

export interface TransparencyState {
  /** Режим: off — обычные непрозрачные блоки; on — стекло. */
  trMode: TrMode
  /**
   * Стекло на всплывающих поверхностях: контекстные меню, модалки, боковые
   * drawer'ы, попапы. Независим от `trMode` — можно включить стекло только на
   * оверлеях, оставив основные блоки непрозрачными (и наоборот). Использует те
   * же параметры blockOpacity/glassStr/glassBlur.
   */
  overlayGlass: boolean
  /** Прозрачность блоков, 0–100 (% → альфа фона внешних контейнеров). */
  blockOpacity: number
  /** Яркость стекла, 0–100 (50 = нейтрально, <50 темнее, >50 светлее). */
  glassStr: number
  /** Размытие стекла, 0–40 px. */
  glassBlur: number
  setMode: (m: TrMode) => void
  setOverlayGlass: (v: boolean) => void
  setBlockOpacity: (v: number) => void
  setGlassStr: (v: number) => void
  setGlassBlur: (v: number) => void
}

const DEFAULTS = {
  trMode: 'off' as TrMode,
  overlayGlass: false,
  blockOpacity: 100,
  glassStr: 50,
  glassBlur: 12,
}

const LS_KEY = 'bloom_transparency'

const loadFromLs = (): typeof DEFAULTS => {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw)
    return {
      trMode: p.trMode === 'on' ? 'on' : 'off',
      overlayGlass: typeof p.overlayGlass === 'boolean' ? p.overlayGlass : DEFAULTS.overlayGlass,
      blockOpacity: typeof p.blockOpacity === 'number' ? p.blockOpacity : DEFAULTS.blockOpacity,
      glassStr: typeof p.glassStr === 'number' ? p.glassStr : DEFAULTS.glassStr,
      glassBlur: typeof p.glassBlur === 'number' ? p.glassBlur : DEFAULTS.glassBlur,
    }
  } catch {
    return DEFAULTS
  }
}

const saveToLs = (s: typeof DEFAULTS): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch {
    /* full → ignore */
  }
}

const hexToRgbTriplet = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return [15, 15, 15]
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)]
}

/**
 * Применить текущее состояние прозрачности к :root / <body>.
 * Читает blockColor из themeStore и mpBgMode из playerViewStore (для гейта
 * мини-плеера). Идемпотентна — вызывается при любом изменении любого из стора.
 */
export const applyTransparency = (): void => {
  const root = document.documentElement
  const body = document.body
  const { trMode, overlayGlass, blockOpacity, glassStr, glassBlur } = useTransparencyStore.getState()

  // Стекло оверлеев — ПОДРЕЖИМ основного: работает только когда включена
  // «Прозрачность» блоков (trMode==='on'). При выключенной прозрачности всё
  // стекло (и блоков, и оверлеев) выключено.
  if (trMode !== 'on') {
    body.classList.remove('glass-mode')
    body.classList.remove('glass-overlays')
    body.classList.remove('mp-bg-theme')
    root.style.removeProperty('--glass-block-bg')
    root.style.removeProperty('--glass-filter')
    return
  }

  const [r, g, b] = hexToRgbTriplet(useThemeStore.getState().blockColor)
  // str: 0 = тёмное стекло (0.4), 50 = нейтрально (1.0), 100 = светлое (1.8) — легаси.
  const brightness = glassStr < 50 ? 0.4 + (glassStr / 50) * 0.6 : 1 + ((glassStr - 50) / 50) * 0.8
  const filter = `${glassBlur > 0 ? `blur(${glassBlur}px) ` : ''}brightness(${brightness.toFixed(2)})`

  root.style.setProperty('--glass-block-bg', `rgba(${r},${g},${b},${(blockOpacity / 100).toFixed(2)})`)
  root.style.setProperty('--glass-filter', filter)
  body.classList.add('glass-mode')
  body.classList.toggle('glass-overlays', overlayGlass)
  // Мини-плеер: стекло только при фоне «Тема».
  body.classList.toggle('mp-bg-theme', usePlayerViewStore.getState().mpBgMode === 'theme')
}

export const useTransparencyStore = create<TransparencyState>((set, get) => {
  const persist = () => {
    const { trMode, overlayGlass, blockOpacity, glassStr, glassBlur } = get()
    saveToLs({ trMode, overlayGlass, blockOpacity, glassStr, glassBlur })
    applyTransparency()
  }
  return {
    ...loadFromLs(),
    setMode: (m) => { set({ trMode: m }); persist() },
    setOverlayGlass: (v) => { set({ overlayGlass: v }); persist() },
    setBlockOpacity: (v) => { set({ blockOpacity: v }); persist() },
    setGlassStr: (v) => { set({ glassStr: v }); persist() },
    setGlassBlur: (v) => { set({ glassBlur: v }); persist() },
  }
})

/**
 * Применить прозрачность при маунте + переприменять при смене цвета блоков
 * (themeStore) и режима фона мини-плеера (playerViewStore). Подключается в App.
 */
export const useTransparencyBootstrap = (): void => {
  useEffect(() => {
    applyTransparency()
    const un1 = useThemeStore.subscribe(applyTransparency)
    const un2 = usePlayerViewStore.subscribe(applyTransparency)
    return () => {
      un1()
      un2()
    }
  }, [])
}
