import { useEffect } from 'react'
import { usePlayerStore } from '@features/player'
import { useThemeStore } from './themeStore'
import { accentHexFromHsl, autoThemeFromHsl, extractCoverHsl } from '../lib/coverAccent'

/**
 * Мост авто-акцента: когда включён `autoAccent`, при смене обложки трека
 * извлекаем доминирующий HSL и применяем как акцент с учётом настройки яркости
 * (`autoAccentL`, см. coverAccent.ts). Монтируется в App.tsx.
 *
 * Тот же мост обслуживает `autoTheme` (авто-тема в списке тем): скан обложки
 * один и тот же, отличается только то, что из HSL собирается — один акцент или
 * все три цвета темы. Режимы взаимоисключающие (см. themeStore).
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
      const st = useThemeStore.getState()
      if (st.autoTheme) st.applyAutoTheme(autoThemeFromHsl(hsl, st.autoAccentL))
      else st.applyAutoAccent(accentHexFromHsl(hsl, st.autoAccentL))
    }
    const run = () => {
      const { autoAccent, autoTheme } = useThemeStore.getState()
      const ps = usePlayerStore.getState()
      // Акцент берём с ОТОБРАЖАЕМОЙ обложки: кастом-override (в т.ч. гифка) важнее
      // оригинала трека. frozenCover (снимок оптимизации) игнорируем — он временный.
      const cover = ps.coverOverride ?? ps.artwork
      if ((!autoAccent && !autoTheme) || !cover) return
      const my = ++token
      void extractCoverHsl(cover).then((hsl) => {
        if (my !== token || !hsl) return
        lastHsl = hsl
        apply(hsl)
      })
    }
    // Реагируем на смену autoAccent/autoTheme (тоггл и выбор темы), яркости,
    // обложки трека и кастом-override.
    const unTheme = useThemeStore.subscribe((s, p) => {
      if (s.autoAccent !== p.autoAccent || s.autoTheme !== p.autoTheme) run()
      else if (s.autoAccentL !== p.autoAccentL && (s.autoAccent || s.autoTheme)) {
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
