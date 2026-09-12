import { unregister } from '@tauri-apps/plugin-global-shortcut'
import { invoke } from '@shared/tauri'
import { clearLyricsCache } from '@features/lyrics'
import { offlineClearAll } from '@features/offline'
import { clearAppImages } from '@features/customization'
import { folderGet, folderRemove, fileGet, fileRemove } from '@features/library'
import { useSettingsStore } from '../model/settingsStore'
import { useHotkeysStore } from '../model/hotkeysStore'

/**
 * Сброс настроек/данных.
 *
 * - `resetSettings()` — вернуть к умолчаниям ТОЛЬКО то, что есть в разделах
 *   настроек: фронт-префы, текущие картинки кастомизации, горячие клавиши +
 *   Rust AppSettings. Не трогает библиотеку, историю, профиль, авторизации и
 *   всё, что меняется вне настроек: громкость, скорость, эквалайзер/эффекты,
 *   источник поиска, созданные темы, пресеты кастомизации и загруженные шрифты
 *   (сам ВЫБОР шрифта сбрасывается на Inter вместе с `bloom_theme`).
 * - `hardReset()` — стереть ВСЁ: весь localStorage (кроме флага онбординга), все
 *   IndexedDB (`bloom`, `bloom_media`, `bloom_stats`, `bloom_fonts`), Rust AppSettings, локальные
 *   папки и треки (копии в профиле Rust стирает сам), офлайн-кеш, кеш текстов и
 *   вход в Яндекс.
 *
 * Обе перезагружают окно в конце, чтобы сторы пере-инициализировались с дефолтами.
 */

/** Ключи localStorage с настройками из разделов «Настроек». */
const SETTINGS_KEYS = [
  'bloom_theme',
  'bloom_ui_prefs',
  'bloom_lib_sbview', // старый ключ вида сайдбара: без него load() uiPrefs поднял бы значение обратно
  'bloom_view_prefs',
  'bloom_transparency',
  'bloom_opt',
  'bloom_bg_prefs',
  'bloom_accent_badges',
  'bloom_global_hotkeys',
  'bloom_global_hotkeys_enabled',
  'bloom_locale', // без ключа язык снова определится по ОС
  'bloom_grp_side',
  'bloom_audio', // кроссфейд, нормализация, устройство вывода, «Авто похожие»
  'bloom_lyrics_karaoke', // старый ключ оформления текста: load() playerView наследует его
  'bloom_tele_ttl',
  'bloom_settings', // зеркало AppSettings (Rust — источник правды, сбрасываем ниже)
]

/**
 * Поля, которые лежат в ключах настроек, но меняются НЕ в настройках: ширины,
 * растянутые мышью, и закрепление окна кнопкой в тайтлбаре. Сброс их сохраняет.
 */
const KEEP_FIELDS: Record<string, string[]> = {
  bloom_ui_prefs: ['tbPinned', 'sbFullW', 'grpW'],
}

const removeSettingsKey = (key: string): void => {
  try {
    const keep = KEEP_FIELDS[key]
    const raw = keep ? JSON.parse(localStorage.getItem(key) || 'null') : null
    if (!keep || !raw || typeof raw !== 'object') {
      localStorage.removeItem(key)
      return
    }
    const kept = Object.fromEntries(keep.filter((f) => f in raw).map((f) => [f, raw[f]]))
    localStorage.setItem(key, JSON.stringify(kept))
  } catch {
    /* ignore */
  }
}

const deleteDB = (name: string): Promise<void> =>
  new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      // Открытые соединения держат удаление — оно доиграет, когда их закроет
      // перезагрузка, и новая страница откроет базу уже после него.
      req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })

/**
 * Вернуть Rust AppSettings к дефолтам через существующие сеттеры стора.
 * Значения — умолчания самого Rust (`AppSettings::default` в config.rs): их
 * получает чистая установка, а DEFAULTS фронтового стора с ними расходятся.
 */
const resetAppSettings = async (): Promise<void> => {
  const st = useSettingsStore.getState()
  await Promise.allSettled([
    st.setMinimizeToTray(false),
    st.setAutoplay(false),
    // Дефолт восстановления очереди — включено (см. config.rs). От порядка не
    // зависит: setAutoplay(false) снимает только autoplay и restore_queue не трогает.
    st.setRestoreQueue(true),
    st.setChangeTitlebar(true),
    st.setChangeTrayCover(false),
    st.setDiscordRpc(true),
    st.setLyricsDiskCache(false),
    st.setAutostart(false),
    st.setLocalImportMode('inPlace'),
    st.setDiscordSettings({
      discord_show_progress: true,
      discord_custom_artwork: '',
      discord_show_small_img: true,
      discord_small_img_url: '',
      discord_small_img_mode: 'default',
      discord_btn1_mode: '',
      discord_btn1_label: '',
      discord_btn1_url: '',
      discord_btn2_mode: '',
      discord_btn2_label: '',
      discord_btn2_url: '',
    }),
  ])
}

/**
 * Снять системные хоткеи до перезагрузки: cleanup `useGlobalHotkeys` при reload
 * не выполняется, и назначенное пользователем сочетание осталось бы занятым в ОС
 * (без обработчика) до перезапуска приложения. Новая страница зарегистрирует
 * умолчания сама.
 */
const releaseHotkeys = async (): Promise<void> => {
  const accels = Object.values(useHotkeysStore.getState().bindings).filter((a): a is string => !!a)
  await Promise.allSettled(accels.map((a) => unregister(a)))
}

/**
 * Локальные папки и одиночные треки хранит Rust (folders.json / files.json) —
 * без этого скан после перезагрузки вернул бы их в библиотеку. Копии из
 * профиля (режим «В Bloom») Rust при удалении стирает с диска сам.
 */
const removeLocalLibrary = async (): Promise<void> => {
  const [folders, files] = await Promise.all([
    folderGet().catch(() => [] as string[]),
    fileGet().catch(() => [] as string[]),
  ])
  await Promise.allSettled([...folders.map((f) => folderRemove(f)), ...files.map((f) => fileRemove(f))])
}

/**
 * Стереть ключи и перезагрузить окно. Чистим дважды: сразу и на `pagehide` —
 * он срабатывает после всех `beforeunload`, а те дописывают своё (снимок очереди
 * `bloom_resume`, счётчик `bloom_usage`) уже после первой очистки.
 */
const wipeAndReload = (wipe: () => void): void => {
  wipe()
  window.addEventListener('pagehide', wipe)
  location.reload()
}

/**
 * Сброс уже идёт. До перезагрузки проходит секунда-другая (Rust, IndexedDB), и
 * за это время кнопку можно снова «взвести» и нажать — второй прогон шёл бы
 * параллельно первому.
 */
let running = false

export const resetSettings = async (): Promise<void> => {
  if (running) return
  running = true
  await Promise.allSettled([resetAppSettings(), releaseHotkeys(), clearAppImages()])
  wipeAndReload(() => SETTINGS_KEYS.forEach(removeSettingsKey))
}

export const hardReset = async (): Promise<void> => {
  if (running) return
  running = true
  const onboarded = localStorage.getItem('bloom_onboarded')
  await Promise.allSettled([
    resetAppSettings(),
    releaseHotkeys(),
    removeLocalLibrary(),
    offlineClearAll(),
    invoke('ym_logout'),
    clearLyricsCache(),
  ])
  await Promise.allSettled([deleteDB('bloom'), deleteDB('bloom_media'), deleteDB('bloom_stats'), deleteDB('bloom_fonts')])
  wipeAndReload(() => {
    try {
      localStorage.clear()
      if (onboarded) localStorage.setItem('bloom_onboarded', onboarded)
    } catch {
      /* ignore */
    }
  })
}
