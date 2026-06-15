/**
 * Низкоуровневые ре-экспорты Tauri API.
 *
 * Доменные обёртки (например `playPause()`, `getAppSettings()`) живут
 * в `features/<x>/api/`, а не здесь.
 */

export { invoke } from '@tauri-apps/api/core'
export { emit } from '@tauri-apps/api/event'
export type { UnlistenFn, EventCallback } from '@tauri-apps/api/event'
