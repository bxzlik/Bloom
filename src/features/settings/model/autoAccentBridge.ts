import { useEffect } from 'react'
import { usePlayerStore } from '@features/player'
import { useThemeStore } from './themeStore'
import { extractAccentFromCover } from '../lib/coverAccent'

/**
 * Мост авто-акцента: когда включён `autoAccent`, при смене обложки трека
 * извлекаем доминирующий цвет и применяем как акцент. хука в
 * updUI/`extractAccentFromCover(t.cover)`. Монтируется в App.tsx.
 *
 * ВАЖНО (производительность): подписываемся ИМПЕРАТИВНО через `store.subscribe`
 * внутри effect, а НЕ реактивными селекторами в рендере App. Иначе тоггл
 * авто-акцента (и вообще КАЖДАЯ смена обложки) перерисовывал бы весь App
 * (все страницы смонтированы разом) → ощутимая «задержка» тоггла. См.
 * [[feedback_app_root_rerender]].
 */
export const useAutoAccentBridge = (): void => {
  useEffect(() => {
    let token = 0
    const run = () => {
      const { autoAccent } = useThemeStore.getState()
      const { artwork } = usePlayerStore.getState()
      if (!autoAccent || !artwork) return
      const my = ++token
      void extractAccentFromCover(artwork).then((hex) => {
        if (my === token && hex) useThemeStore.getState().applyAutoAccent(hex)
      })
    }
    // Реагируем на смену autoAccent (тоггл) и artwork (новый трек) без ре-рендера.
    const unTheme = useThemeStore.subscribe((s, p) => {
      if (s.autoAccent !== p.autoAccent) run()
    })
    const unPlayer = usePlayerStore.subscribe((s, p) => {
      if (s.artwork !== p.artwork) run()
    })
    run()
    return () => {
      unTheme()
      unPlayer()
    }
  }, [])
}
