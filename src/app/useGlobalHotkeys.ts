import { useEffect } from 'react'
import { useHotkeysStore, type HotkeyAction } from '@features/settings'
import {
  usePlayerStore,
  togglePlay,
  seek,
  setVol,
  toggleMuteMain,
  nextTr,
  prevTr,
  toggleShuffleMain,
  cycleRepeatMain,
} from '@features/player'
import { useNavStore } from './navigationStore'

/**
 * Глобальный keydown-диспетчер локальных горячих клавиш. Сопоставляет `code`+модификатор с конфигом
 * из `useHotkeysStore` и вызывает действия плеера. Игнорирует ввод в полях и
 * режим перехвата (редактирование клавиши). Живёт в app, чтобы не плодить цикл
 * settings↔player. Медиаклавиши (Play/Next/Prev) уже обрабатывает mediaSession
 * в плеер-мосте — здесь не дублируем.
 */
const dispatch = (action: HotkeyAction): void => {
  const ps = usePlayerStore.getState()
  switch (action) {
    case 'play': togglePlay(); break
    case 'seekBack': seek(ps.position - 5); break
    case 'seekFwd': seek(ps.position + 5); break
    case 'prev': prevTr(); break
    case 'next': nextTr(); break
    case 'volUp': setVol(Math.min(100, ps.volume + 5)); break
    case 'volDown': setVol(Math.max(0, ps.volume - 5)); break
    case 'mute': toggleMuteMain(); break
    case 'loop': cycleRepeatMain(); break
    case 'shuffle': toggleShuffleMain(); break
    case 'search': useNavStore.getState().goNav('search'); break
  }
}

export const useGlobalHotkeys = (): void => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useHotkeysStore.getState()
      if (!st.enabled || st.capturing) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const eMod = e.ctrlKey ? 'Ctrl' : e.shiftKey ? 'Shift' : e.altKey ? 'Alt' : null
      let action: HotkeyAction | null = null
      for (const [k, h] of Object.entries(st.hotkeys)) {
        if (h.code === e.code && (h.mod ?? null) === eMod) {
          action = k as HotkeyAction
          break
        }
      }
      if (!action) return
      e.preventDefault()
      dispatch(action)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
