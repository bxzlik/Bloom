import { useEffect } from 'react'
import { onAppEvent, type AppEventName, type AppEvents } from '@shared/tauri'

/**
 * Подписаться на типизированное событие из Rust на время жизни компонента.
 *
 * @example
 * useTauriEvent('bloom-mp-state', (state) => {
 *   playerStore.setState(state) // state: MpState
 * })
 */
export const useTauriEvent = <K extends AppEventName>(
  name: K,
  handler: (payload: AppEvents[K]) => void,
) => {
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    onAppEvent(name, handler).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])
}
