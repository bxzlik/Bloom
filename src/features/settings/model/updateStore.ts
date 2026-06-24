import { useEffect } from 'react'
import { create } from 'zustand'
import { invoke, onAppEvent } from '@shared/tauri'
import type { UpdateInfo, UnlistenFn, UpdateNote, UpdateNotePage, UpdateNoteRaw, LocalizedText } from '@shared/tauri'
import { notify } from '@shared/ui'
import { t as i18nT, useI18nStore, type Locale } from '@shared/i18n'

/** Версия, для которой уже добавили уведомление в этой сессии (без дублей). */
let _notifiedVersion = ''

/** Базовый URL папки с картинками заметок (имена файлов из манифеста дополняются им). */
const ASSETS_BASE = 'https://raw.githubusercontent.com/bxzlik/Bloom/main/update-notes/assets/'

/** Выбрать строку под локаль: строка → как есть; {ru,en} → локаль → ru → en. */
const resolveText = (v: LocalizedText | undefined, locale: Locale): string => {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v[locale] ?? v.ru ?? v.en ?? ''
}

/** Имя файла → полный raw-URL; готовый https-URL оставляем как есть. */
const resolveImg = (s: string): string =>
  /^https?:\/\//i.test(s) ? s : ASSETS_BASE + s.replace(/^\/+/, '')

/** Запись манифеста под версию → готовая к показу заметка (или null, если нет). */
const resolveNote = (
  manifest: Record<string, UpdateNoteRaw>,
  version: string,
  locale: Locale,
): UpdateNote | null => {
  const raw = manifest[version]
  if (!raw) return null
  let pages: UpdateNotePage[]
  if (raw.pages?.length) {
    pages = raw.pages.map((p) => ({
      title: resolveText(p.title, locale),
      body: resolveText(p.body, locale),
      image: p.image ? resolveImg(p.image) : null,
      icons: p.icons ?? [],
    }))
  } else {
    // Легаси-формат без pages → одна страница из body + первой картинки.
    pages = [
      {
        title: '',
        body: resolveText(raw.body, locale),
        image: raw.images?.length ? resolveImg(raw.images[0]) : null,
        icons: [],
      },
    ]
  }
  return { version, title: resolveText(raw.title, locale), pages }
}

/** Есть ли на странице что показывать. */
const pageHasContent = (p: UpdateNotePage): boolean =>
  !!p.title || !!p.body || !!p.image || p.icons.length > 0

/** Есть ли в заметке что показывать (иначе модалку «Что нового» не открываем). */
const hasContent = (n: UpdateNote | null): n is UpdateNote =>
  !!n && (!!n.title || n.pages.some(pageHasContent))

/**
 * Манифест тянется один раз за сессию (промис кэшируется). При ошибке кэш
 * сбрасывается — следующая попытка (напр. повторный клик «Подробнее») перезапросит.
 */
let _manifestPromise: Promise<Record<string, UpdateNoteRaw>> | null = null
const loadManifest = (): Promise<Record<string, UpdateNoteRaw>> => {
  if (!_manifestPromise) {
    _manifestPromise = invoke<string>('fetch_update_notes')
      .then((txt) => {
        const parsed = JSON.parse(txt) as unknown
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, UpdateNoteRaw>) : {}
      })
      .catch((e) => {
        _manifestPromise = null
        throw e
      })
  }
  return _manifestPromise
}

/**
 * Общий стор обновлений — единый источник для баннера-уведомления (App) и
 * блока «О приложении» (настройки → Система).
 *
 * Бэкенд: Rust сверяется с GitHub Releases (`check_update`), качает
 * NSIS-установщик (`download_update`, прогресс в `bloom-update-progress`) и
 * запускает его (`install_update`, закрывает приложение).
 *
 * Поведение:
 *   - `init()` — один раз при старте приложения: тянет версию, ставит слушатель
 *     прогресса и делает тихую авто-проверку (без апдейта/при ошибке — молчит).
 *   - `check(manual)` — ручная проверка (по клику в «О приложении») показывает
 *     результат всегда: и «последняя версия», и ошибку сети.
 *   - `dismiss()` — пользователь скрыл баннер для конкретной версии (persist в
 *     localStorage), чтобы не напоминать о ней при следующих запусках.
 */

export type UpdatePhase = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'error'

/** Режим модалки заметок: анонс новой версии vs «Что нового» после обновления. */
export type NotesMode = 'announce' | 'whatsnew'

const LS_DISMISSED = 'bloom_update_dismissed'
/** Версия прошлого запуска — чтобы показать «Что нового» один раз после апдейта. */
const LS_LAST_RUN = 'bloom_last_run_version'

const loadDismissed = (): string => {
  try {
    return localStorage.getItem(LS_DISMISSED) || ''
  } catch {
    return ''
  }
}

interface UpdateState {
  /** Текущая версия сборки (для «О приложении»). */
  version: string
  phase: UpdatePhase
  info: UpdateInfo | null
  /** Прогресс загрузки установщика, 0..100. */
  percent: number
  error: string
  /** Версия, для которой пользователь скрыл баннер (persist). */
  dismissedVersion: string
  /** Заметка для модалки «Подробнее»/«Что нового» (разрешённая под локаль). */
  note: UpdateNote | null
  /** Открыта ли модалка заметок. */
  notesOpen: boolean
  /** Идёт ли загрузка заметки (для спиннера в модалке). */
  notesLoading: boolean
  /** Режим показа модалки. */
  notesMode: NotesMode
  /** Защита от повторного init() (стор — синглтон на всё окно). */
  _started: boolean
  _unlisten: UnlistenFn | null

  init: () => Promise<void>
  check: (manual: boolean) => Promise<void>
  downloadInstall: () => Promise<void>
  dismiss: () => void
  /** Открыть модалку-анонс для доступной версии (кнопка «Подробнее»). */
  openNotes: () => Promise<void>
  /** Загрузить заметку доступной версии в стор БЕЗ открытия модалки (для превью в попапе тайтлбара). */
  ensureNote: () => Promise<void>
  closeNotes: () => void
  /** Показать «Что нового» для текущей версии (один раз после обновления). */
  showWhatsNew: (version: string) => Promise<void>
  /** Открыть «Что нового» для текущей версии вручную (кнопка в «О приложении»). */
  openWhatsNew: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  version: '',
  phase: 'idle',
  info: null,
  percent: 0,
  error: '',
  dismissedVersion: loadDismissed(),
  note: null,
  notesOpen: false,
  notesLoading: false,
  notesMode: 'announce',
  _started: false,
  _unlisten: null,

  init: async () => {
    if (get()._started) return
    set({ _started: true })
    let cur = ''
    try {
      cur = await invoke<string>('app_version')
      set({ version: cur })
    } catch {
      /* игнор */
    }
    try {
      const un = await onAppEvent('bloom-update-progress', (p) => set({ percent: p.percent }))
      set({ _unlisten: un })
    } catch {
      /* игнор */
    }
    // «Что нового» после обновления: версия сменилась с прошлого запуска.
    // Свежая установка (нет записи о прошлой версии) — не показываем (есть онбординг).
    try {
      const lastRun = localStorage.getItem(LS_LAST_RUN)
      if (cur) {
        if (lastRun && lastRun !== cur) void get().showWhatsNew(cur)
        localStorage.setItem(LS_LAST_RUN, cur)
      }
    } catch {
      /* игнор */
    }
    await get().check(false)
  },

  check: async (manual) => {
    if (manual) set({ phase: 'checking', error: '' })
    try {
      const res = await invoke<UpdateInfo>('check_update')
      set({ info: res })
      if (res.available) {
        set({ phase: 'available' })
        // Уведомление о новой версии — один раз на версию за сессию. Кнопка
        // «Подробнее» открывает модалку-анонс с заметкой релиза.
        if (res.latest && res.latest !== _notifiedVersion) {
          _notifiedVersion = res.latest
          notify({
            kind: 'update',
            titleKey: 'notif.update.title',
            body: i18nT('notif.update.body', { v: res.latest }),
            action: () => void get().openNotes(),
            actionLabelKey: 'notif.details',
          })
        }
      } else set({ phase: manual ? 'uptodate' : 'idle' })
    } catch (e) {
      if (manual) set({ error: String(e), phase: 'error' })
    }
  },

  downloadInstall: async () => {
    const { info } = get()
    if (!info) return
    if (!info.download_url) {
      set({ error: 'В релизе не найден установщик (.exe)', phase: 'error' })
      return
    }
    set({ phase: 'downloading', percent: 0, error: '' })
    try {
      const path = await invoke<string>('download_update', {
        url: info.download_url,
        assetName: info.asset_name,
      })
      // Запустит установщик и закроет приложение — дальше код обычно не идёт.
      await invoke('install_update', { path })
    } catch (e) {
      set({ error: String(e), phase: 'error' })
    }
  },

  dismiss: () => {
    const latest = get().info?.latest || ''
    try {
      localStorage.setItem(LS_DISMISSED, latest)
    } catch {
      /* игнор */
    }
    set({ dismissedVersion: latest })
  },

  openNotes: async () => {
    const version = get().info?.latest || get().version
    set({ notesOpen: true, notesMode: 'announce' })
    // Уже загружена нужная заметка — не перезапрашиваем.
    if (get().note?.version === version) return
    set({ notesLoading: true, note: null })
    try {
      const manifest = await loadManifest()
      const locale = useI18nStore.getState().locale
      set({ note: resolveNote(manifest, version, locale) })
    } catch {
      set({ note: null })
    } finally {
      set({ notesLoading: false })
    }
  },

  closeNotes: () => set({ notesOpen: false }),

  ensureNote: async () => {
    const version = get().info?.latest || get().version
    if (!version || get().note?.version === version) return
    set({ notesLoading: true })
    try {
      const manifest = await loadManifest()
      const locale = useI18nStore.getState().locale
      set({ note: resolveNote(manifest, version, locale) })
    } catch {
      /* офлайн/нет манифеста — превью без карусели */
    } finally {
      set({ notesLoading: false })
    }
  },

  showWhatsNew: async (version) => {
    try {
      const manifest = await loadManifest()
      const locale = useI18nStore.getState().locale
      const note = resolveNote(manifest, version, locale)
      // Пустую запись (нет текста/фото) не показываем — не дёргаем пользователя.
      if (hasContent(note)) set({ note, notesOpen: true, notesMode: 'whatsnew' })
    } catch {
      /* офлайн/нет манифеста — молча */
    }
  },

  openWhatsNew: async () => {
    const version = get().version
    set({ notesOpen: true, notesMode: 'whatsnew' })
    if (get().note?.version === version) return
    set({ notesLoading: true, note: null })
    try {
      const manifest = await loadManifest()
      const locale = useI18nStore.getState().locale
      set({ note: resolveNote(manifest, version, locale) })
    } catch {
      set({ note: null })
    } finally {
      set({ notesLoading: false })
    }
  },
}))

/** Старт авто-проверки обновлений при монтировании App (идемпотентно). */
export const useUpdateBootstrap = (): void => {
  useEffect(() => {
    void useUpdateStore.getState().init()
  }, [])
}
