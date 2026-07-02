import { useEffect } from 'react'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { invoke } from '@shared/tauri'
import { useHotkeysStore, type HotkeyAction } from '@features/settings'
import {
  usePlayerStore,
  togglePlay,
  setVol,
  nextTr,
  prevTr,
  toggleCurFav,
} from '@features/player'

/**
 * Мост СИСТЕМНЫХ (OS-global) горячих клавиш. Регистрирует привязки из
 * `useHotkeysStore` через `@tauri-apps/plugin-global-shortcut` (работают даже
 * когда окно не в фокусе) и на срабатывание вызывает действие плеера. При смене
 * конфига перерегистрирует. Живёт в app, чтобы не плодить цикл settings↔player.
 *
 * Локальных (in-app keydown) хоткеев больше нет. Медиаклавиши (Play/Next/Prev на
 * клавиатуре/гарнитуре) по-прежнему обрабатывает SMTC в Rust — здесь не дублируем.
 * Win+Shift+X (показать/скрыть окно) регистрирует Rust отдельно.
 */
const dispatch = (action: HotkeyAction): void => {
  const ps = usePlayerStore.getState()
  switch (action) {
    case 'play': togglePlay(); break
    case 'next': nextTr(); break
    case 'prev': prevTr(); break
    case 'like': toggleCurFav(); break
    case 'volUp': setVol(Math.min(100, ps.volume + 5)); break
    case 'volDown': setVol(Math.max(0, ps.volume - 5)); break
    case 'toggleOverlay': void invoke('overlay_toggle').catch(() => {}); break
  }
}

export const useGlobalHotkeys = (): void => {
  useEffect(() => {
    // Снимаем ТОЛЬКО свои акселераторы (не unregisterAll — иначе снесли бы
    // Win+Shift+X, зарегистрированный из Rust). При каждом изменении полностью
    // пере-регистрируем, чтобы не тащить устаревшие замыкания на действие.
    let owned: string[] = []
    let seq = 0

    const apply = async (): Promise<void> => {
      const my = ++seq
      const st = useHotkeysStore.getState()
      const want: Array<[string, HotkeyAction]> = []
      const seen = new Set<string>()
      // Ничего не регистрируем, если мастер-тумблер выключен ИЛИ идёт захват новой
      // клавиши: во время захвата все наши глобальные хоткеи должны быть сняты,
      // иначе ОС перехватит нажатие занятого комбо и окно захвата его не увидит
      // (нельзя было бы переназначить/вернуть уже используемое сочетание).
      if (st.enabled && !st.capturing) {
        for (const [action, accel] of Object.entries(st.bindings)) {
          if (accel && !seen.has(accel)) {
            seen.add(accel)
            want.push([accel, action as HotkeyAction])
          }
        }
      }

      for (const accel of owned) {
        try { await unregister(accel) } catch { /* ignore */ }
      }
      owned = []
      if (my !== seq) return // перебит более свежим apply

      for (const [accel, action] of want) {
        // Снимаем возможную ПРОТУХШУЮ регистрацию с прошлой загрузки страницы
        // (её обработчик умер вместе со старым webview, но в ОС акселератор
        // остаётся занятым — тогда register упал бы с «already registered»,
        // и клавиша висела бы «вживую», но ничего не делала).
        try { await unregister(accel) } catch { /* не был зарегистрирован — ок */ }
        try {
          await register(accel, (ev) => {
            if (ev.state === 'Pressed') dispatch(action)
          })
          owned.push(accel)
        } catch {
          // Акселератор занят другим приложением/ОС — тихо пропускаем.
        }
      }
    }

    void apply()
    const unsub = useHotkeysStore.subscribe((s, prev) => {
      if (
        s.bindings !== prev.bindings ||
        s.enabled !== prev.enabled ||
        s.capturing !== prev.capturing
      )
        void apply()
    })

    return () => {
      unsub()
      for (const accel of owned) void unregister(accel).catch(() => {})
    }
  }, [])
}
