import { useEffect } from 'react'
import { usePlayerStore } from '@features/player'
import { useThemeStore } from './themeStore'
import { accentHexFromHsl, extractCoverHsl } from '../lib/coverAccent'

/**
 * Мост авто-акцента: когда включён `autoAccent`, при смене обложки трека
 * извлекаем доминирующий HSL и применяем как акцент с учётом настройки яркости
 * (`autoAccentL`, см. coverAccent.ts). Монтируется в App.tsx.
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
    // HSL последней просканированной обложки: движение ползунка «Яркость акцента»
    // пересчитывает цвет из него, без повторного скана canvas на каждый ввод.
    let lastHsl: { h: number; s: number; l: number } | null = null
    const apply = (hsl: { h: number; s: number; l: number }) => {
      const { autoAccentL } = useThemeStore.getState()
      useThemeStore.getState().applyAutoAccent(accentHexFromHsl(hsl, autoAccentL))
    }
    const run = () => {
      const { autoAccent } = useThemeStore.getState()
      const ps = usePlayerStore.getState()
      // Акцент берём с ОТОБРАЖАЕМОЙ обложки: кастом-override (в т.ч. гифка) важнее
      // оригинала трека. frozenCover (снимок оптимизации) игнорируем — он временный.
      const cover = ps.coverOverride ?? ps.artwork
      if (!autoAccent || !cover) return
      const my = ++token
      void extractCoverHsl(cover).then((hsl) => {
        if (my !== token || !hsl) return
        lastHsl = hsl
        apply(hsl)
      })
    }
    // Реагируем на смену autoAccent (тоггл), яркости, обложки трека и кастом-override.
    const unTheme = useThemeStore.subscribe((s, p) => {
      if (s.autoAccent !== p.autoAccent) run()
      else if (s.autoAccentL !== p.autoAccentL && s.autoAccent) {
        if (lastHsl) apply(lastHsl)
        else run()
      }
    })
    const unPlayer = usePlayerStore.subscribe((s, p) => {
      if (s.artwork !== p.artwork || s.coverOverride !== p.coverOverride) run()
    })
    run()
    return () => {
      unTheme()
      unPlayer()
    }
  }, [])
}
