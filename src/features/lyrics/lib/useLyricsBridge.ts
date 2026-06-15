import { useEffect } from 'react'
import { useTauriEvent } from '@shared/hooks'
import { usePlayerStore } from '@features/player'
import { useLyricsStore } from '../model/lyricsStore'

/**
 * Мост текста в main окне. Подключается ОДИН раз в App.tsx.
 *
 *   - принимает результат запроса из Rust (`bloom-lyrics`) → applyResult;
 *   - синхронизирует активную строку с позицией воспроизведения (setTime).
 *
 * Сам запрос текста инициирует плеер при смене трека (`loadPlay` → requestLyrics),
 * хука `updUI`.
 */
export const useLyricsBridge = () => {
  useTauriEvent('bloom-lyrics', (r) => {
    useLyricsStore.getState().applyResult(r)
  })

  // position → активная строка. Подписка вне React-рендера: setTime сам решает,
  // менять ли curLine (стор обновится только при смене строки, не каждый тик).
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((s, prev) => {
      if (s.position === prev.position) return
      useLyricsStore.getState().setTime(s.position)
    })
    return unsub
  }, [])
}
