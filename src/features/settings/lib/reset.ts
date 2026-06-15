import { clearLyricsCache } from '@features/lyrics'
import { useSettingsStore } from '../model/settingsStore'

/**
 * Сброс настроек/данных.
 *
 * - `resetSettings()` — вернуть НАСТРОЙКИ к значениям по умолчанию: фронт-префы
 *   оформления/плеера/поведения + Rust AppSettings. Библиотеку, историю, профиль
 *   и авторизации НЕ трогает.
 * - `hardReset()` — стереть ВСЁ: весь localStorage (кроме флага онбординга), обе
 *   IndexedDB (`bloom` + `bloom_media`) и дисковый кеш текстов.
 *
 * Обе перезагружают окно в конце, чтобы сторы пере-инициализировались с дефолтами.
 */

/** Ключи localStorage-префов (оформление/плеер/поведение). НЕ библиотека/история/профиль. */
const SETTINGS_KEYS = [
  'bloom_theme',
  'bloom_custom_themes',
  'bloom_ui_prefs',
  'bloom_view_prefs',
  'bloom_transparency',
  'bloom_opt',
  'bloom_bg_prefs',
  'bloom_presets',
  'bloom_grp_side',
  'bloom_volume',
  'bloom_speed_idx',
  'bloom_lyrics_karaoke',
  'bloom_tele_ttl',
  'bloom_search_source',
  'bloom_settings', // зеркало AppSettings (Rust — источник правды, сбрасываем ниже)
]

const deleteDB = (name: string): Promise<void> =>
  new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })

/** Вернуть Rust AppSettings к дефолтам через существующие сеттеры стора. */
const resetAppSettings = async (): Promise<void> => {
  const st = useSettingsStore.getState()
  await Promise.allSettled([
    st.setMinimizeToTray(false),
    st.setAutoplay(false),
    st.setChangeTitlebar(false),
    st.setChangeTrayCover(false),
    st.setDiscordRpc(false),
    st.setLyricsDiskCache(false),
    st.setAutostart(false),
    st.setDiscordSettings({
      discord_show_progress: true,
      discord_custom_artwork: '',
      discord_show_small_img: false,
      discord_small_img_url: '',
      discord_btn1_mode: '',
      discord_btn1_label: '',
      discord_btn1_url: '',
      discord_btn2_mode: '',
      discord_btn2_label: '',
      discord_btn2_url: '',
    }),
  ])
}

export const resetSettings = async (): Promise<void> => {
  await resetAppSettings()
  for (const k of SETTINGS_KEYS) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
  location.reload()
}

export const hardReset = async (): Promise<void> => {
  const onboarded = localStorage.getItem('bloom_onboarded')
  try {
    localStorage.clear()
    if (onboarded) localStorage.setItem('bloom_onboarded', onboarded)
  } catch {
    /* ignore */
  }
  await Promise.allSettled([deleteDB('bloom'), deleteDB('bloom_media'), clearLyricsCache()])
  location.reload()
}
