import { useEffect } from 'react'
import { create } from 'zustand'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@shared/tauri'

/**
 * UI-предпочтения раздела «Интерфейс» (расположение/навигация/рамки), которые
 * применяются классами на `.app` и CSS-переменными. Persist в
 * `localStorage['bloom_ui_prefs']`.
 *
 * Методы: setSidebarPos/setSidebarCompact/toggleSbSep/setLibSysStyle
 * (`.app.sidebar-top|sidebar-right|sidebar-compact|no-sb-sep|lib-sys-classic`),
 * toggleNavIndicator (`.app.no-nav-indicator`), setBorderAlpha
 * (`--wb`/`--wb2`), toggleTitlebarLabel (`#winTitleCenter`), toggleNavBtn
 * (видимость кнопок мини-плеера/хоткеев в сайдбаре).
 *
 * Классы `.app` навешивает App.tsx (реактивно из этого стора); `--wb` — этот
 * стор (глобальная CSS-переменная). Sidebar/TitleBar читают флаги напрямую.
 *
 * libView (список/сетка) — persist-флаг, его читает features/library
 * (LibPage/LibContent) для альтернативной grid-раскладки.
 */

export type SidebarPos = 'left' | 'top' | 'right'
export type LibSysStyle = 'accent' | 'classic'
export type LibView = 'list' | 'grid'

export interface UiPrefs {
  sidebarPos: SidebarPos
  sidebarCompact: boolean
  /** Плавающий сайдбар — капсула overlay поверх контента (взаимоисключим с compact). */
  sidebarFloating: boolean
  /** Авто-скрытие сайдбара — спрятан за краем, выезжает при наведении на край. */
  sidebarAutohide: boolean
  /** Авто-скрытие тайтлбара — спрятан за верхним краем, выезжает при наведении. */
  titlebarAutohide: boolean
  sbSep: boolean
  libSysStyle: LibSysStyle
  /** Вид библиотеки: список (сайдбар) или сетка карточек. */
  libView: LibView
  navIndicator: boolean
  /** Название текущей вкладки по центру тайтлбара (`#winTitleCenter`). */
  titlebarLabel: boolean
  navFloatBtn: boolean
  // ── Элементы тайтлбара (что показывать на панели окна) ──
  /** Логотип Bloom слева (`.win-icon`). */
  tbLogo: boolean
  /** Версия приложения рядом с названием. */
  tbVersion: boolean
  /** Кнопка «Свернуть». */
  tbMin: boolean
  /** Кнопка «Развернуть/Восстановить». */
  tbMax: boolean
  /** Кнопка «Закрепить окно поверх остальных». */
  tbPin: boolean
  /** Колокольчик уведомлений (центр уведомлений). */
  tbBell: boolean
  /** Кнопка «Закрыть». */
  tbClose: boolean
  /** Текущее состояние закрепления окна (always-on-top), применяется на старте. */
  tbPinned: boolean
  /** 0..6. */
  borderAlpha: number
  /** Полноэкранный зум (webview), % 70..130. */
  fullZoom: number
  /** Оконный зум (масштаб окна), % 70..130. */
  winZoom: number
}

const DEFAULTS: UiPrefs = {
  sidebarPos: 'left',
  sidebarCompact: false,
  sidebarFloating: false,
  sidebarAutohide: false,
  titlebarAutohide: false,
  sbSep: true,
  libSysStyle: 'accent',
  libView: 'list',
  navIndicator: true,
  titlebarLabel: true,
  navFloatBtn: true,
  tbLogo: true,
  tbVersion: true,
  tbMin: true,
  tbMax: true,
  tbPin: true,
  tbBell: true,
  tbClose: true,
  tbPinned: false,
  borderAlpha: 6,
  fullZoom: 100,
  winZoom: 100,
}

const LS_KEY = 'bloom_ui_prefs'

const load = (): UiPrefs => {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (!p || typeof p !== 'object') return { ...DEFAULTS }
    return {
      sidebarPos: p.sidebarPos === 'top' || p.sidebarPos === 'right' ? p.sidebarPos : 'left',
      sidebarCompact: !!p.sidebarCompact,
      sidebarFloating: !!p.sidebarFloating,
      sidebarAutohide: !!p.sidebarAutohide,
      titlebarAutohide: !!p.titlebarAutohide,
      sbSep: p.sbSep !== false,
      libSysStyle: p.libSysStyle === 'classic' ? 'classic' : 'accent',
      libView: p.libView === 'grid' ? 'grid' : 'list',
      navIndicator: p.navIndicator !== false,
      titlebarLabel: p.titlebarLabel !== false,
      navFloatBtn: p.navFloatBtn !== false,
      tbLogo: p.tbLogo !== false,
      tbVersion: p.tbVersion !== false,
      tbMin: p.tbMin !== false,
      tbMax: p.tbMax !== false,
      tbPin: p.tbPin !== false,
      tbBell: p.tbBell !== false,
      tbClose: p.tbClose !== false,
      tbPinned: !!p.tbPinned,
      borderAlpha: typeof p.borderAlpha === 'number' ? p.borderAlpha : 6,
      fullZoom: typeof p.fullZoom === 'number' ? p.fullZoom : 100,
      winZoom: typeof p.winZoom === 'number' ? p.winZoom : 100,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const applyBorderAlpha = (v: number): void => {
  const root = document.documentElement
  root.style.setProperty('--wb', String(v / 100))
  root.style.setProperty('--wb2', String((v * 13) / 6 / 100))
}

/** Полноэкранный зум — webview zoom через Rust. */
const applyFullZoom = (pct: number): void => {
  void invoke('setzoom', { zoom: pct / 100 }).catch(() => {})
}
/** Оконный зум — масштаб окна через Rust. */
const applyWinZoom = (pct: number): void => {
  void invoke('setwinzoom', { zoom: pct / 100 }).catch(() => {})
}
/** Закрепление окна поверх остальных (always-on-top). */
const applyPinned = (on: boolean): void => {
  getCurrentWindow().setAlwaysOnTop(on).catch(() => {})
}

interface UiPrefsState extends UiPrefs {
  set: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void
  reset: () => void
}

const persist = (s: UiPrefs): void => {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        sidebarPos: s.sidebarPos,
        sidebarCompact: s.sidebarCompact,
        sidebarFloating: s.sidebarFloating,
        sidebarAutohide: s.sidebarAutohide,
        titlebarAutohide: s.titlebarAutohide,
        sbSep: s.sbSep,
        libSysStyle: s.libSysStyle,
        libView: s.libView,
        navIndicator: s.navIndicator,
        titlebarLabel: s.titlebarLabel,
        navFloatBtn: s.navFloatBtn,
        tbLogo: s.tbLogo,
        tbVersion: s.tbVersion,
        tbMin: s.tbMin,
        tbMax: s.tbMax,
        tbPin: s.tbPin,
        tbBell: s.tbBell,
        tbClose: s.tbClose,
        tbPinned: s.tbPinned,
        borderAlpha: s.borderAlpha,
        fullZoom: s.fullZoom,
        winZoom: s.winZoom,
      }),
    )
  } catch {
    /* full → ignore */
  }
}

export const useUiPrefsStore = create<UiPrefsState>((set, get) => ({
  ...load(),
  set: (key, value) => {
    set({ [key]: value } as Partial<UiPrefsState>)
    const s = get()
    persist(s)
    if (key === 'borderAlpha') applyBorderAlpha(s.borderAlpha)
    else if (key === 'fullZoom') applyFullZoom(s.fullZoom)
    else if (key === 'winZoom') applyWinZoom(s.winZoom)
    else if (key === 'tbPinned') applyPinned(s.tbPinned)
  },
  reset: () => {
    set({ ...DEFAULTS })
    persist({ ...DEFAULTS })
    applyBorderAlpha(DEFAULTS.borderAlpha)
    applyFullZoom(DEFAULTS.fullZoom)
    applyWinZoom(DEFAULTS.winZoom)
    applyPinned(DEFAULTS.tbPinned)
  },
}))

/** Список классов для `.app` из текущих префов (навешивает App.tsx). */
export const appClassesFromPrefs = (p: UiPrefs): string[] => {
  const out: string[] = []
  if (p.sidebarPos === 'top') out.push('sidebar-top')
  else if (p.sidebarPos === 'right') out.push('sidebar-right')
  // Плавающий и компактный взаимоисключимы — floating имеет приоритет в рендере,
  // даже если оба флага оказались true (старый persist).
  if (p.sidebarFloating) out.push('sidebar-floating')
  else if (p.sidebarCompact) out.push('sidebar-compact')
  // Авто-скрытие совместимо с обычным/компактным/плавающим режимом — CSS
  // разруливает позиционирование для каждого случая.
  if (p.sidebarAutohide) out.push('sidebar-autohide')
  if (!p.sbSep) out.push('no-sb-sep')
  if (p.libSysStyle === 'classic') out.push('lib-sys-classic')
  if (!p.navIndicator) out.push('no-nav-indicator')
  return out
}

/**
 * Применить CSS-переменные (border alpha) + зум на старте. Вызывается в App.tsx.
 *
 * ВАЖНО: только на маунте (НЕ реактивно). Живые изменения borderAlpha/zoom уже
 * применяет `set`/`reset` стора, поэтому реактивная подписка тут была бы
 * избыточной и ре-рендерила бы весь App на каждом шаге слайдера рамок →
 * «задержка». См. [[feedback_app_root_rerender]].
 */
export const useUiPrefsBootstrap = (): void => {
  useEffect(() => {
    const s = useUiPrefsStore.getState()
    applyBorderAlpha(s.borderAlpha)
    if (s.fullZoom !== 100) applyFullZoom(s.fullZoom)
    if (s.winZoom !== 100) applyWinZoom(s.winZoom)
    if (s.tbPinned) applyPinned(true)
  }, [])
}
