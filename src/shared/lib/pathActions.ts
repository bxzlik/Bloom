import { invoke } from '@shared/tauri'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { t } from '@shared/i18n'
// Напрямую из модуля, а не из барреля `@shared/ui`: PathLine лежит в нём и
// импортирует этот файл — через баррель получилось бы кольцо.
import { toast } from '@shared/ui/GlobalToast'

/**
 * Действия над путём локального файла/папки: показать в проводнике и скопировать.
 * Используются шапкой папки (LibContent) и модалкой «Инфо о треке».
 *
 * Файл и папку открываем РАЗНЫМИ путями:
 * - `revealItemInDir` открывает родительскую папку и выделяет элемент. Scope
 *   плагина она не проверяет, поэтому для mp3 работает «из коробки»;
 * - папку саму открывает Rust-команда `open_folder`. Плагинную `openPath`
 *   использовать нельзя: она сверяется со scope, а `opener:allow-open-path`
 *   включает её «without any pre-configured scope» → ForbiddenPath на любом
 *   пути. Scope `**` открыл бы вебвью запуск любого файла (в т.ч. `.exe`),
 *   поэтому команда сама сужает себя до директорий (см. commands.rs).
 */
export const revealPath = (path: string, kind: 'file' | 'folder'): void => {
  const run =
    kind === 'folder' ? invoke<void>('open_folder', { path }) : revealItemInDir(path)
  run.catch((e) => {
    // Диск отключили / папку унесли вместе с флешкой — путь в UI ещё висит.
    console.warn('revealPath failed', path, e)
    toast(t('lib.path.revealFailed'), null, 'error')
  })
}

export const copyPath = (path: string): void => {
  navigator.clipboard
    ?.writeText(path)
    .then(() => toast(t('lib.path.copied'), null, 'success'))
    .catch((e) => console.warn('copyPath failed', e))
}
