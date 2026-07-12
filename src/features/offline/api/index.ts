import { invoke } from '@shared/tauri'

/** Запись офлайн-кеша: сквозной id трека → путь к скачанной копии. */
export interface OfflineEntry {
  id: string
  path: string
}

export interface OfflineDownloadArgs {
  id: string
  url: string
  filename: string
  coverUrl: string | null
  title: string
  artist: string
  referer: string | null
}

/**
 * Offline API: обёртки над Rust-командами `offline_*`.
 *
 * В отличие от `download.ts` (экспорт файла на диск через диалог) офлайн-загрузка
 * кладёт трек в невидимый кеш профиля (`offline/`) и запоминает связь `id → путь`
 * в offline.json — потом трек играется из этой копии (см. offline source-resolver).
 */

/** Скачать трек площадки в офлайн-кеш. Возвращает путь к файлу. Идемпотентна. */
export const offlineDownload = (args: OfflineDownloadArgs): Promise<string> =>
  invoke('offline_download', { ...args })

/** Убрать трек из офлайн-кеша (стирает файл и запись). */
export const offlineRemove = (id: string): Promise<void> => invoke('offline_remove', { id })

/** Первичная загрузка кеша из offline.json (только существующие файлы). */
export const offlineScanAll = (): Promise<OfflineEntry[]> => invoke('offline_scan_all')

/** Статистика офлайн-кеша: число существующих файлов + суммарный размер в байтах. */
export interface OfflineCacheStats {
  count: number
  bytes: number
}

export const offlineCacheStats = (): Promise<OfflineCacheStats> =>
  invoke<OfflineCacheStats>('offline_cache_stats').catch(() => ({ count: 0, bytes: 0 }))

/** Стереть весь офлайн-кеш (файлы + offline.json). Возвращает число удалённых файлов. */
export const offlineClearAll = (): Promise<number> =>
  invoke<number>('offline_clear_all').catch(() => 0)
