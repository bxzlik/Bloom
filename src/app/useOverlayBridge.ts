import { useEffect } from 'react'
import { invoke } from '@shared/tauri'
import { usePlayerViewStore } from '@features/settings'
import { usePlayerStore } from '@features/player/model/store'

/**
 * Мост оверлея-«острова» (только в main-окне):
 *   1. Зеркалит конфиг оверлея (режим/якорь/масштаб) в Rust — при старте и смене
 *      настроек. Прозрачность/длительность/масштаб плашка читает сама из
 *      `bloom_view_prefs` (storage-событие), поэтому в Rust шлём лишь то, что
 *      влияет на OS-окно (видимость + позиция/размер).
 *   2. На смену трека (title/artist) дёргает `overlay_flash`, если включён режим
 *      «остров» и авто-показ при смене трека.
 *
 * Подключается ОДИН раз в App.tsx (рядом с useMainPlayerBridge).
 */
export const useOverlayBridge = (): void => {
  // Конфиг → Rust (старт + изменения режима/позиции/масштаба).
  // preview=true для пользовательских изменений → плашка сразу всплывает
  // (живой предпросмотр); на старте (preview=false) не всплываем.
  useEffect(() => {
    const push = (preview: boolean): void => {
      const p = usePlayerViewStore.getState()
      void invoke('overlay_set_config', {
        enabled: p.overlayMode === 'island',
        anchor: p.overlayPos,
        size: p.overlaySize / 100,
        preview,
      }).catch(() => {})
    }
    push(false)
    return usePlayerViewStore.subscribe((s, prev) => {
      if (
        s.overlayMode !== prev.overlayMode ||
        s.overlayPos !== prev.overlayPos ||
        s.overlaySize !== prev.overlaySize ||
        s.overlayOpacity !== prev.overlayOpacity ||
        s.overlayDuration !== prev.overlayDuration
      ) {
        push(true)
      }
    })
  }, [])

  // Всплытие на смену трека.
  useEffect(() => {
    return usePlayerStore.subscribe((s, prev) => {
      if (s.title === prev.title && s.artist === prev.artist) return
      if (!s.title) return
      const p = usePlayerViewStore.getState()
      if (p.overlayMode !== 'island' || !p.overlayOnTrackChange) return
      void invoke('overlay_flash').catch(() => {})
    })
  }, [])
}
