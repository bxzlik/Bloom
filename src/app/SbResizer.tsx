import { type PointerEvent as ReactPointerEvent } from 'react'
import {
  useUiPrefsStore,
  SB_ICONS_W,
  SB_FULL_W_MIN,
  SB_FULL_W_MAX,
  SB_FULL_W_DEFAULT,
  SB_EXPAND_AT,
  SB_COLLAPSE_AT,
} from '@features/settings'

/**
 * Ручка растягивания сайдбара приложения — невидимая полоса на зазоре между
 * `.sidebar` и контентом (`.sb-resizer`, base.css). Рендерится сразу за
 * `<Sidebar />` в `.app`.
 *
 * Поведение «как в Spotify»: узкая полоса иконок сама по себе не тянется —
 * потянули вправо, на пороге SB_EXPAND_AT сайдбар переключается в режим
 * «С подписями» и дальше тянется по-настоящему (`--sb-w-full`); потянули
 * обратно, на SB_COLLAPSE_AT возвращается в «Иконки». Пороги разные — гистерезис,
 * чтобы режим не дребезжал на границе.
 *
 * Shift+ЛКМ — сброс ширины к SB_FULL_W_DEFAULT.
 *
 * Ручка не рендерится там, где ширина сайдбара не имеет смысла или тянуть её
 * неудобно: позиция «Сверху» (горизонтальная полоса), плавающий режим (капсула
 * по контенту), авто-скрытие (сайдбар уезжает из-под курсора) — и, конечно, при
 * включённой блокировке.
 *
 * Как и `.sm-nav-resizer` в настройках, во время drag пишем CSS-переменную прямо
 * в DOM, а в стор коммитим один раз на pointerup (там же persist).
 */
export const SbResizer = () => {
  const pos = useUiPrefsStore((s) => s.sidebarPos)
  const floating = useUiPrefsStore((s) => s.sidebarFloating)
  const autohide = useUiPrefsStore((s) => s.sidebarAutohide)
  const locked = useUiPrefsStore((s) => s.sbResizeLock)
  const setPref = useUiPrefsStore((s) => s.set)

  if (locked || floating || autohide || pos === 'top') return null

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (e.shiftKey) {
      setPref('sbFullW', SB_FULL_W_DEFAULT)
      return
    }
    const st = useUiPrefsStore.getState()
    // Сайдбар справа: окно тянется «внутрь», т.е. движение влево = шире.
    const dir = st.sidebarPos === 'right' ? -1 : 1
    const startX = e.clientX
    // Точка отсчёта — фактическая ширина сайдбара сейчас (полоса иконок либо
    // сохранённая ширина full-режима). Дальше raw считается от неё, поэтому
    // переключение режима посреди drag не сбивает координаты.
    const startW = st.sidebarView === 'full' ? st.sbFullW : SB_ICONS_W
    const root = document.documentElement
    let view = st.sidebarView
    let commit = st.sbFullW

    const onMove = (ev: PointerEvent) => {
      const raw = startW + dir * (ev.clientX - startX)
      if (view === 'icons') {
        if (raw >= SB_EXPAND_AT) {
          view = 'full'
          setPref('sidebarView', 'full')
        }
      } else if (raw <= SB_COLLAPSE_AT) {
        view = 'icons'
        setPref('sidebarView', 'icons')
      }
      if (view !== 'full') return
      commit = Math.min(SB_FULL_W_MAX, Math.max(SB_FULL_W_MIN, Math.round(raw)))
      root.style.setProperty('--sb-w-full', `${commit}px`)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('sb-resizing')
      setPref('sbFullW', commit)
    }
    document.body.classList.add('sb-resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return <div className="sb-resizer" onPointerDown={onPointerDown} />
}
