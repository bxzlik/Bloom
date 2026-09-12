import { useEffect } from 'react'
import { create } from 'zustand'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@shared/tauri'

/**
 * UI-предпочтения раздела «Интерфейс» (расположение/навигация/рамки), которые
 * применяются классами на `.app` и CSS-переменными. Persist в
 * `localStorage['bloom_ui_prefs']`.
 *
 * Методы: setSidebarPos/setSidebarCompact/toggleSbSep
 * (`.app.sidebar-top|sidebar-right|sidebar-compact|no-sb-sep`),
 * setBorderAlpha
 * (`--wb`/`--wb2`), toggleTitlebarLabel (`#winTitleCenter`), toggleNavBtn
 * (видимость кнопки PiP-окна в сайдбаре).
 *
 * Классы `.app` навешивает App.tsx (реактивно из этого стора); `--wb` — этот
 * стор (глобальная CSS-переменная). Sidebar/TitleBar читают флаги напрямую.
 *
 * libView (список/сетка) — persist-флаг, его читает features/library
 * (LibPage/LibContent) для альтернативной grid-раскладки.
 *
 * home* (homeWave/homeContinue/…) — набор видимых секций главной страницы
 * («Настройки → Страницы → Главная»), читается напрямую в HomePage/DiscoverSections.
 */

export type SidebarPos = 'left' | 'top' | 'right'
/**
 * Вид сайдбара приложения (ось, независимая от позиции и от обычный/компактный/
 * плавающий):
 * - `icons` — только иконки, узкая полоса (`--sb-w`, по умолчанию)
 * - `full`  — иконка + подпись вкладки, широкий сайдбар (`--sb-w-full`)
 */
export type SidebarView = 'icons' | 'full'
export type LibView = 'list' | 'grid'
/**
 * Раскладка ряда действий в шапке библиотеки (`.lib-content-hero`):
 * - `right` — «Играть все» и капсулы иконок справа, в одну строку с названием
 *             (по умолчанию, исторический вид)
 * - `below` — кнопки уезжают под название/подпись, внутрь текстовой колонки
 */
export type LibHeroBtns = 'right' | 'below'
export type LibDensity = 'comfortable' | 'compact'
/**
 * Вид строк сайдбара библиотеки (раньше циклился кнопкой `libSbCompactBtn`,
 * теперь настраивается в «Настройки → Библиотека»):
 * - `full`   — обложка + название + подпись + play (по умолчанию)
 * - `text`   — только текст, без обложек (компактный)
 * - `covers` — только обложки крупным столбиком, без текста
 */
export type SbView = 'full' | 'text' | 'covers'
/**
 * Сторона, с которой выезжают боковые панели-drawer (`.spanel` — теги/«Добавить
 * треки»/авто-обновление/объединение, `#peditModal` — редактор плейлиста и
 * профиля). Применяется body-классом `drawer-left` (App.tsx → modals.css).
 */
export type DrawerSide = 'right' | 'left'

export interface UiPrefs {
  sidebarPos: SidebarPos
  /** Только иконки / иконки с подписями (`.app.sidebar-full`). */
  sidebarView: SidebarView
  sidebarCompact: boolean
  /** Плавающий сайдбар — капсула overlay поверх контента (взаимоисключим с compact). */
  sidebarFloating: boolean
  /**
   * «Полный» режим — сайдбар без рамки: ни бордера, ни скругления, ни своего
   * фона/блюра, поэтому иконки висят прямо на фоне окна (`.app.sidebar-plain`).
   * Четвёртый пункт ряда режимов → взаимоисключим с compact и floating.
   */
  sidebarPlain: boolean
  /** Авто-скрытие сайдбара — спрятан за краем, выезжает при наведении на край. */
  sidebarAutohide: boolean
  /** Авто-скрытие тайтлбара — спрятан за верхним краем, выезжает при наведении. */
  titlebarAutohide: boolean
  /** Фон панели окна: своя плашка цвета блоков вместо прозрачного тайтлбара. */
  titlebarBg: boolean
  sbSep: boolean
  /** Вид библиотеки: список (сайдбар) или сетка карточек. */
  libView: LibView
  /** Раскладка кнопок шапки библиотеки: справа от названия или под ним. */
  libHeroBtns: LibHeroBtns
  /** Вид строк сайдбара библиотеки: полный / только текст / только обложки. */
  sbView: SbView
  /** Скрывать сайдбар библиотеки и разворачивать его при наведении на левый край. */
  libSbHover: boolean
  /** Плотность строк треклиста библиотеки: просторно / компактно. */
  libDensity: LibDensity
  /** Показывать колонку «Альбом» в треклисте (на широком окне). */
  libColAlbum: boolean
  // ── Секции главной страницы (что показывать на «Главной») ──
  /** Блок «Моя волна». */
  homeWave: boolean
  /** Карточка «Продолжить». */
  homeContinue: boolean
  /** Быстрая карточка «Любимые треки». */
  homeFav: boolean
  /** Быстрая карточка «История». */
  homeHistory: boolean
  /** Витрина «Новинки». */
  homeNew: boolean
  /** Витрина «Чарты». */
  homeCharts: boolean
  /** Витрина «Для вас» — похожие на самое слушаемое. */
  homeForYou: boolean
  /** Витрина «Похожие на…» — треки и артисты, похожие на один сид из топа. */
  homeSimilar: boolean
  /** Секция «Недавно слушали». */
  homeRecent: boolean
  /** Секция «Плейлисты». */
  homePlaylists: boolean
  /** С какой стороны выезжают боковые панели-drawer (`body.drawer-left`). */
  drawerSide: DrawerSide
  /** Название текущей вкладки по центру тайтлбара (`#winTitleCenter`). */
  titlebarLabel: boolean
  navFloatBtn: boolean
  /** Вместо иконки «Главная» в сайдбаре — знак Bloom (маска по /logo.png). */
  navHomeLogo: boolean
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
  /** Ширина сайдбара приложения в режиме «С подписями», px (тянется мышью). */
  sbFullW: number
  /** Запретить растягивание сайдбара приложения мышью. */
  sbResizeLock: boolean
  /** Ширина глобальной боковой панели (очередь/текст), px (тянется мышью). */
  grpW: number
  /** Запретить растягивание боковой панели мышью. */
  grpResizeLock: boolean
}

/**
 * Растягивание сайдбара приложения (`SbResizer`).
 *
 * Режим «Иконки» — фиксированная полоса SB_ICONS_W (= `--sb-w` в base.css), она
 * не тянется; тянется только режим «С подписями» (`--sb-w-full`). Переход между
 * режимами — на порогах с гистерезисом (как в Spotify): тянем вправо → на
 * SB_EXPAND_AT включается `full`, тянем обратно → на SB_COLLAPSE_AT возвращается
 * `icons`. Разные пороги не дают режиму дребезжать на границе.
 */
export const SB_ICONS_W = 70
export const SB_FULL_W_MIN = 140
export const SB_FULL_W_MAX = 340
export const SB_FULL_W_DEFAULT = 190
export const SB_EXPAND_AT = 120
export const SB_COLLAPSE_AT = 105

/** Границы ширины глобальной боковой панели (px). */
export const GRP_W_MIN = 260
export const GRP_W_MAX = 560
export const GRP_W_DEFAULT = 320

const DEFAULTS: UiPrefs = {
  sidebarPos: 'left',
  sidebarView: 'icons',
  sidebarCompact: false,
  sidebarFloating: false,
  sidebarPlain: false,
  sidebarAutohide: false,
  titlebarAutohide: false,
  titlebarBg: false,
  sbSep: true,
  libView: 'list',
  libHeroBtns: 'right',
  sbView: 'full',
  libSbHover: false,
  libDensity: 'comfortable',
  libColAlbum: true,
  homeWave: true,
  homeContinue: true,
  homeFav: true,
  homeHistory: true,
  homeNew: true,
  homeCharts: true,
  homeForYou: true,
  homeSimilar: true,
  homeRecent: true,
  homePlaylists: true,
  drawerSide: 'right',
  titlebarLabel: true,
  navFloatBtn: true,
  navHomeLogo: false,
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
  sbFullW: SB_FULL_W_DEFAULT,
  sbResizeLock: false,
  grpW: GRP_W_DEFAULT,
  grpResizeLock: false,
}

const clampNum = (v: unknown, min: number, max: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt

const LS_KEY = 'bloom_ui_prefs'

const load = (): UiPrefs => {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (!p || typeof p !== 'object') return { ...DEFAULTS }
    return {
      sidebarPos: p.sidebarPos === 'top' || p.sidebarPos === 'right' ? p.sidebarPos : 'left',
      sidebarView: p.sidebarView === 'full' ? 'full' : 'icons',
      sidebarCompact: !!p.sidebarCompact,
      sidebarFloating: !!p.sidebarFloating,
      sidebarPlain: !!p.sidebarPlain,
      sidebarAutohide: !!p.sidebarAutohide,
      titlebarAutohide: !!p.titlebarAutohide,
      titlebarBg: !!p.titlebarBg,
      sbSep: p.sbSep !== false,
      libView: p.libView === 'grid' ? 'grid' : 'list',
      libHeroBtns: p.libHeroBtns === 'below' ? 'below' : 'right',
      // Миграция: раньше вид сайдбара жил в отдельном ключе `bloom_lib_sbview`.
      sbView:
        p.sbView === 'text' || p.sbView === 'covers'
          ? p.sbView
          : ((localStorage.getItem('bloom_lib_sbview') as SbView | null) === 'text' ||
              localStorage.getItem('bloom_lib_sbview') === 'covers')
            ? (localStorage.getItem('bloom_lib_sbview') as SbView)
            : 'full',
      libSbHover: !!p.libSbHover,
      libDensity: p.libDensity === 'compact' ? 'compact' : 'comfortable',
      libColAlbum: p.libColAlbum !== false,
      homeWave: p.homeWave !== false,
      homeContinue: p.homeContinue !== false,
      homeFav: p.homeFav !== false,
      homeHistory: p.homeHistory !== false,
      homeNew: p.homeNew !== false,
      homeCharts: p.homeCharts !== false,
      homeForYou: p.homeForYou !== false,
      homeSimilar: p.homeSimilar !== false,
      homeRecent: p.homeRecent !== false,
      homePlaylists: p.homePlaylists !== false,
      drawerSide: p.drawerSide === 'left' ? 'left' : 'right',
      titlebarLabel: p.titlebarLabel !== false,
      navFloatBtn: p.navFloatBtn !== false,
      navHomeLogo: !!p.navHomeLogo,
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
      sbFullW: clampNum(p.sbFullW, SB_FULL_W_MIN, SB_FULL_W_MAX, SB_FULL_W_DEFAULT),
      sbResizeLock: !!p.sbResizeLock,
      grpW: clampNum(p.grpW, GRP_W_MIN, GRP_W_MAX, GRP_W_DEFAULT),
      grpResizeLock: !!p.grpResizeLock,
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

/**
 * Ширины растягиваемых панелей — глобальные CSS-переменные на `:root`.
 * `--sb-w-full` подменяет `--sb-w` в режиме «С подписями» (base.css),
 * `--grp-w` — ширина `#globalRightPanel`/`#grpInner`.
 */
const applySbFullW = (v: number): void => {
  document.documentElement.style.setProperty('--sb-w-full', `${v}px`)
}
const applyGrpW = (v: number): void => {
  document.documentElement.style.setProperty('--grp-w', `${v}px`)
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
        sidebarView: s.sidebarView,
        sidebarCompact: s.sidebarCompact,
        sidebarFloating: s.sidebarFloating,
        sidebarPlain: s.sidebarPlain,
        sidebarAutohide: s.sidebarAutohide,
        titlebarAutohide: s.titlebarAutohide,
        titlebarBg: s.titlebarBg,
        sbSep: s.sbSep,
        libView: s.libView,
        libHeroBtns: s.libHeroBtns,
        sbView: s.sbView,
        libSbHover: s.libSbHover,
        libDensity: s.libDensity,
        libColAlbum: s.libColAlbum,
        homeWave: s.homeWave,
        homeContinue: s.homeContinue,
        homeFav: s.homeFav,
        homeHistory: s.homeHistory,
        homeNew: s.homeNew,
        homeCharts: s.homeCharts,
        homeForYou: s.homeForYou,
        homeSimilar: s.homeSimilar,
        homeRecent: s.homeRecent,
        homePlaylists: s.homePlaylists,
        drawerSide: s.drawerSide,
        titlebarLabel: s.titlebarLabel,
        navFloatBtn: s.navFloatBtn,
        navHomeLogo: s.navHomeLogo,
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
        sbFullW: s.sbFullW,
        sbResizeLock: s.sbResizeLock,
        grpW: s.grpW,
        grpResizeLock: s.grpResizeLock,
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
    else if (key === 'sbFullW') applySbFullW(s.sbFullW)
    else if (key === 'grpW') applyGrpW(s.grpW)
  },
  reset: () => {
    set({ ...DEFAULTS })
    persist({ ...DEFAULTS })
    applyBorderAlpha(DEFAULTS.borderAlpha)
    applyFullZoom(DEFAULTS.fullZoom)
    applyWinZoom(DEFAULTS.winZoom)
    applyPinned(DEFAULTS.tbPinned)
    applySbFullW(DEFAULTS.sbFullW)
    applyGrpW(DEFAULTS.grpW)
  },
}))

/** Список классов для `.app` из текущих префов (навешивает App.tsx). */
export const appClassesFromPrefs = (p: UiPrefs): string[] => {
  const out: string[] = []
  if (p.sidebarPos === 'top') out.push('sidebar-top')
  else if (p.sidebarPos === 'right') out.push('sidebar-right')
  // Подписи вкладок — независимая ось: работает и с compact, и с floating,
  // и в любой позиции (расширяет `--sb-w`, см. base.css «SIDEBAR FULL MODE»).
  if (p.sidebarView === 'full') out.push('sidebar-full')
  // Плавающий, компактный и полный взаимоисключимы (один ряд кнопок) — порядок
  // здесь задаёт приоритет на случай, если из старого persist пришло несколько.
  if (p.sidebarFloating) out.push('sidebar-floating')
  else if (p.sidebarCompact) out.push('sidebar-compact')
  else if (p.sidebarPlain) out.push('sidebar-plain')
  // Авто-скрытие совместимо с обычным/компактным/плавающим режимом — CSS
  // разруливает позиционирование для каждого случая.
  if (p.sidebarAutohide) out.push('sidebar-autohide')
  if (!p.sbSep) out.push('no-sb-sep')
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
    applySbFullW(s.sbFullW)
    applyGrpW(s.grpW)
    if (s.fullZoom !== 100) applyFullZoom(s.fullZoom)
    if (s.winZoom !== 100) applyWinZoom(s.winZoom)
    if (s.tbPinned) applyPinned(true)
  }, [])
}
