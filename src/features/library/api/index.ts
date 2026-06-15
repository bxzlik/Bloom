import { invoke } from '@shared/tauri'
import { open as openDialog } from '@tauri-apps/plugin-dialog'

/**
 * Library API: обёртки над Rust-командами folder_*.
 * Реальные данные приходят через события `bloom-folder-list`,
 * `bloom-folder-tracks`, `bloom-folder-removed`, `bloom-folder-track-removed`
 * (см. shared/tauri/events.ts).
 */

export const folderGet = (): Promise<string[]> => invoke('folder_get')

/**
 * Добавить папку в watch-список. Если `path` не задан — откроется
 * системный диалог выбора директории (через @tauri-apps/plugin-dialog).
 * При отмене ничего не делает.
 */
export const folderAdd = async (path?: string): Promise<void> => {
  let target = path
  if (!target) {
    const result = await openDialog({ directory: true, multiple: false })
    if (typeof result !== 'string') return
    target = result
  }
  return invoke('folder_add', { path: target })
}

export const folderRemove = (path: string): Promise<void> => invoke('folder_remove', { path })
export const folderScan = (path: string): Promise<void> => invoke('folder_scan', { path })

export const exportPlaylistFile = (
  content: string,
  defaultName: string,
): Promise<boolean> =>
  invoke('export_playlist_file', { content, defaultName })

export const importPlaylistFile = (): Promise<string | null> =>
  invoke('import_playlist_file')
