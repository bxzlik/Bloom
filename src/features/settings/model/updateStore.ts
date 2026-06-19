import { useEffect } from 'react'
import { create } from 'zustand'
import { invoke, onAppEvent } from '@shared/tauri'
import type { UpdateInfo, UnlistenFn } from '@shared/tauri'
import { notify } from '@shared/ui'
import { t as i18nT } from '@shared/i18n'

/** Версия, для которой уже добавили уведомление в этой сессии (без дублей). */
let _notifiedVersion = ''

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

const LS_DISMISSED = 'bloom_update_dismissed'

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
  /** Защита от повторного init() (стор — синглтон на всё окно). */
  _started: boolean
  _unlisten: UnlistenFn | null

  init: () => Promise<void>
  check: (manual: boolean) => Promise<void>
  downloadInstall: () => Promise<void>
  dismiss: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  version: '',
  phase: 'idle',
  info: null,
  percent: 0,
  error: '',
  dismissedVersion: loadDismissed(),
  _started: false,
  _unlisten: null,

  init: async () => {
    if (get()._started) return
    set({ _started: true })
    try {
      set({ version: await invoke<string>('app_version') })
    } catch {
      /* игнор */
    }
    try {
      const un = await onAppEvent('bloom-update-progress', (p) => set({ percent: p.percent }))
      set({ _unlisten: un })
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
        // Уведомление о новой версии — один раз на версию за сессию.
        if (res.latest && res.latest !== _notifiedVersion) {
          _notifiedVersion = res.latest
          notify({
            kind: 'update',
            titleKey: 'notif.update.title',
            body: i18nT('notif.update.body', { v: res.latest }),
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
}))

/** Старт авто-проверки обновлений при монтировании App (идемпотентно). */
export const useUpdateBootstrap = (): void => {
  useEffect(() => {
    void useUpdateStore.getState().init()
  }, [])
}
