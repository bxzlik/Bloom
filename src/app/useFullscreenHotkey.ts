import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * F11 — переключение полноэкранного режима окна. Делаем напрямую через
 * `setFullscreen` и сами синхронизируем класс `body.fullscreen`
 * (CSS прячет #winTitlebar — см. soundcloud-system.css).
 *
 * Отдельный фиксированный хоткей, не из useHotkeysStore: работает всегда (в т.ч.
 * в полях ввода), (capture-фаза + preventDefault).
 */
export const useFullscreenHotkey = (): void => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F11') return
      e.preventDefault()
      const win = getCurrentWindow()
      void win
        .isFullscreen()
        .then((cur) => win.setFullscreen(!cur).then(() => !cur))
        .then((isFs) => {
          document.body.classList.toggle('fullscreen', isFs)
        })
        .catch(() => {})
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])
}
