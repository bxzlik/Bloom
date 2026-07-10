import { useEffect } from 'react'
import { create } from 'zustand'
import type { AppSettings, LocalImportMode } from '@shared/tauri'
import { invoke } from '@shared/tauri'

/**
 * Зеркало Rust `AppSettings` + флаги вне AppSettings (autostart).
 * Бэк хранит большинство флагов в config.json, autostart — в Windows registry.
 *
 * Поля AppSettings (`commands.get_app_settings`):
 *   - minimize_to_tray, autoplay
 *   - change_titlebar, change_tray_cover
 *   - discord_rpc + 9 discord_* (для полной конфигурации в шаге 15)
 *   - lyrics_disk_cache
 *
 * Вне AppSettings (отдельные команды get* / set*):
 *   - autostart (Windows registry)
 */

const DEFAULTS: AppSettings = {
  minimize_to_tray: false,
  autoplay: false,
  discord_rpc: false,
  change_titlebar: false,
  change_tray_cover: false,
  lyrics_disk_cache: false,
  local_import_mode: 'inPlace',
  discord_show_progress: true,
  discord_custom_artwork: '',
  discord_show_small_img: false,
  discord_small_img_url: '',
  discord_small_img_mode: 'default',
  discord_btn1_mode: '',
  discord_btn1_label: '',
  discord_btn1_url: '',
  discord_btn2_mode: '',
  discord_btn2_label: '',
  discord_btn2_url: '',
}

export interface SettingsState extends AppSettings {
  /** true когда стор уже подтянул AppSettings из Rust. */
  loaded: boolean
  /** Windows-автозапуск (registry). null = ещё не подтянули. */
  autostart: boolean | null
  setMinimizeToTray: (v: boolean) => Promise<void>
  setAutoplay: (v: boolean) => Promise<void>
  setChangeTitlebar: (v: boolean) => Promise<void>
  setChangeTrayCover: (v: boolean) => Promise<void>
  setDiscordRpc: (v: boolean) => Promise<void>
  /**
   * Обновить расширенные настройки Discord RPC (обложка/иконка/прогресс/кнопки)
   * — мержит patch в стор и шлёт ВСЕ 10 полей в Rust `set_discord_settings`
   *. Tauri конвертит camelCase→snake_case.
   */
  setDiscordSettings: (patch: Partial<DiscordFields>) => Promise<void>
  setLyricsDiskCache: (v: boolean) => Promise<void>
  /** Куда класть файлы добавляемой папки. Влияет только на новые папки. */
  setLocalImportMode: (v: LocalImportMode) => Promise<void>
  setAutostart: (v: boolean) => Promise<void>
}

/** Подмножество AppSettings — расширенные поля Discord RPC. */
type DiscordFields = Pick<
  AppSettings,
  | 'discord_show_progress'
  | 'discord_custom_artwork'
  | 'discord_show_small_img'
  | 'discord_small_img_url'
  | 'discord_small_img_mode'
  | 'discord_btn1_mode'
  | 'discord_btn1_label'
  | 'discord_btn1_url'
  | 'discord_btn2_mode'
  | 'discord_btn2_label'
  | 'discord_btn2_url'
>

const wrap = async (name: string, action: () => Promise<unknown>) => {
  try {
    await action()
  } catch (e) {
    console.warn(`${name} failed`, e)
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  autostart: null,
  setMinimizeToTray: async (v) => {
    set({ minimize_to_tray: v })
    await wrap('setminimize_to_tray', () => invoke('setminimize_to_tray', { enabled: v }))
  },
  setAutoplay: async (v) => {
    set({ autoplay: v })
    await wrap('setautoplay', () => invoke('setautoplay', { enabled: v }))
  },
  setChangeTitlebar: async (v) => {
    set({ change_titlebar: v })
    await wrap('setchangetitlebar', () => invoke('setchangetitlebar', { enabled: v }))
  },
  setChangeTrayCover: async (v) => {
    set({ change_tray_cover: v })
    await wrap('setchangetray_cover', () => invoke('setchangetray_cover', { enabled: v }))
  },
  setDiscordRpc: async (v) => {
    set({ discord_rpc: v })
    await wrap('setdiscordrpc', () => invoke('setdiscordrpc', { enabled: v }))
  },
  setDiscordSettings: async (patch) => {
    set(patch)
    const s = get()
    await wrap('set_discord_settings', () =>
      invoke('set_discord_settings', {
        showProgress: s.discord_show_progress,
        customArtwork: s.discord_custom_artwork,
        showSmallImg: s.discord_show_small_img,
        smallImgUrl: s.discord_small_img_url,
        smallImgMode: s.discord_small_img_mode,
        btn1Mode: s.discord_btn1_mode,
        btn1Label: s.discord_btn1_label,
        btn1Url: s.discord_btn1_url,
        btn2Mode: s.discord_btn2_mode,
        btn2Label: s.discord_btn2_label,
        btn2Url: s.discord_btn2_url,
      }),
    )
  },
  setLyricsDiskCache: async (v) => {
    set({ lyrics_disk_cache: v })
    await wrap('set_lyrics_cache', () => invoke('set_lyrics_cache', { enabled: v }))
  },
  setLocalImportMode: async (v) => {
    set({ local_import_mode: v })
    await wrap('set_local_import_mode', () => invoke('set_local_import_mode', { mode: v }))
  },
  setAutostart: async (v) => {
    set({ autostart: v })
    await wrap('setautostart', () => invoke('setautostart', { enabled: v }))
  },
}))

/** Стартовая подгрузка: AppSettings + autostart. Вызывается в App.tsx один раз. */
export const useSettingsBootstrap = (): void => {
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      invoke<AppSettings>('get_app_settings').catch((e) => {
        console.warn('get_app_settings failed', e)
        return null
      }),
      invoke<boolean>('getautostart').catch((e) => {
        console.warn('getautostart failed', e)
        return null
      }),
    ]).then(([app, autostart]) => {
      if (cancelled) return
      useSettingsStore.setState({
        ...(app ?? {}),
        autostart,
        loaded: true,
      })
    })
    return () => {
      cancelled = true
    }
  }, [])
}
