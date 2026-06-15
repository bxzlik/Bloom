import { useEffect } from 'react'
import { useTauriEvent } from '@shared/hooks'
import { usePlayerStore } from '../model'
import { miniplayerGetState } from '../api'

/**
 * Используется в зеркальных окнах (tray-popup, miniplayer).
 * Делает три вещи:
 * 1. Запрашивает текущий `MpState` у Rust при монтировании.
 * 2. Подписывается на `bloom-mp-state` и заливает в store.
 * 3. Подписывается на `bloom-mp-volume` (волюм может прийти из другого окна).
 *
 * В main окне (источник правды) НЕ используется — там аудио драйвит state наоборот.
 */
export const usePlayerBridge = () => {
  const setFromMpState = usePlayerStore((s) => s.setFromMpState)
  const setVolume = usePlayerStore((s) => s.setVolume)

  // Стартовый запрос состояния. Rust возвращает дефолт, если ничего не играло.
  useEffect(() => {
    let cancelled = false
    miniplayerGetState()
      .then((state) => {
        if (!cancelled) setFromMpState(state)
      })
      .catch(() => {
        // Окно могло открыться до того, как mp_state инициализировался — игнор.
      })
    return () => {
      cancelled = true
    }
  }, [setFromMpState])

  useTauriEvent('bloom-mp-state', (state) => setFromMpState(state))
  useTauriEvent('bloom-mp-volume', (volume) => setVolume(volume))
}
