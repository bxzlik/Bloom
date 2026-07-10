import { invoke } from '@shared/tauri'
import type { FolderScanResult, LocalTrackInfo } from '@shared/tauri'
import { open as openDialog } from '@tauri-apps/plugin-dialog'

/** Расширения, которые понимает Rust (`folder_watcher::AUDIO_EXTS`). */
const AUDIO_EXTS = [
  'mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'opus', 'wma',
  'aiff', 'aif', 'webm', 'wv', 'ape', 'tta', 'alac', 'dsf', 'dff',
]

/**
 * Library API: обёртки над Rust-командами folder_*.
 *
 * Первичная загрузка треков — ОТВЕТ `folderScanAll`, а не событие: скан на
 * старте успевал отстреляться раньше, чем React подпишется, и треки терялись.
 * Событиями (`bloom-folder-tracks`, `bloom-folder-removed`,
 * `bloom-folder-track-removed`, см. shared/tauri/events.ts) приходят только
 * живые изменения ФС.
 */

export const folderGet = (): Promise<string[]> => invoke('folder_get')

/**
 * Добавить папку в watch-список. Если `path` не задан — откроется
 * системный диалог выбора директории (через @tauri-apps/plugin-dialog).
 * При отмене ничего не делает.
 *
 * `onStart` зовётся уже после выбора папки, перед самой командой: в режиме
 * `local_import_mode: 'copy'` Rust копирует файлы и это может занять минуты.
 */
export const folderAdd = async (path?: string, onStart?: () => void): Promise<void> => {
  let target = path
  if (!target) {
    const result = await openDialog({ directory: true, multiple: false })
    if (typeof result !== 'string') return
    target = result
  }
  onStart?.()
  return invoke('folder_add', { path: target })
}

/**
 * Отвязать папку. Если это копия внутри профиля («В Bloom»), Rust удалит её
 * файлы с диска — спрашивайте подтверждение соответствующим текстом.
 */
export const folderRemove = (path: string): Promise<void> => invoke('folder_remove', { path })

/** Папка является копией внутри профиля Bloom (режим «В Bloom»)? */
export const folderIsCopy = (path: string): Promise<boolean> =>
  invoke('folder_is_copy', { path })

/** Пере-скан одной папки (ручное «Обновить»). */
export const folderScan = (path: string): Promise<FolderScanResult> =>
  invoke('folder_scan', { path })

/** Скан всех папок из folders.json — первичная загрузка локальной библиотеки. */
export const folderScanAll = (): Promise<FolderScanResult> => invoke('folder_scan_all')

/**
 * Добавить одиночные треки по путям. Без `paths` откроется системный диалог
 * выбора файлов. Куда лягут файлы — решает настройка `local_import_mode`.
 *
 * `null` — диалог отменили. Пустой массив — файлы выбрали, но все оказались
 * дубликатами или не-аудио: Rust отсеивает их молча, а вызывающий должен это
 * различать, иначе отмена и «ничего не добавилось» выглядят одинаково.
 */
export const fileAdd = async (paths?: string[]): Promise<LocalTrackInfo[] | null> => {
  let targets = paths
  if (!targets) {
    const result = await openDialog({
      multiple: true,
      filters: [{ name: 'Audio', extensions: AUDIO_EXTS }],
    })
    if (!Array.isArray(result) || !result.length) return null
    targets = result
  }
  if (!targets.length) return null
  return invoke('file_add', { paths: targets })
}

/** Убрать одиночный трек. Копию из профиля Rust сотрёт с диска. */
export const fileRemove = (path: string): Promise<void> => invoke('file_remove', { path })

/** Первичная загрузка одиночных треков из files.json. */
export const fileScanAll = (): Promise<LocalTrackInfo[]> => invoke('file_scan_all')

export const exportPlaylistFile = (
  content: string,
  defaultName: string,
): Promise<boolean> =>
  invoke('export_playlist_file', { content, defaultName })

export const importPlaylistFile = (): Promise<string | null> =>
  invoke('import_playlist_file')
