import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useProfilePanelStore } from '../model/profilePanelStore'

/**
 * Каркас модалки «Статистика» (`.smodal`).
 *
 * Своя пара классов, а не боковая шторка `.spanel` с модификатором: карточка
 * стоит по центру окна и шире, чем панель у кромки. От шторки унаследован только
 * характер анимации — выезд из-за правого края (при `body.drawer-left` — из-за
 * левого), поэтому и время демонтажа то же.
 *
 * Открытость берётся из `profilePanelStore` (там же живут «Достижения») — чтобы
 * статистику можно было открыть ИЗВНЕ, например кликом по бару на главной.
 * Шапки нет: что открыто, видно по содержимому, а закрывают кликом по фону или
 * Esc. Тело скроллится без видимой полосы, футер — кнопки действий.
 */

// Длительность slide-out (.smodal transform .42s) перед демонтажем.
const ANIM_MS = 440

interface Props {
  footer?: ReactNode
  children: ReactNode
}

export const StatsModalShell = ({ footer, children }: Props) => {
  const open = useProfilePanelStore((s) => s.panel === 'stats')
  const close = useProfilePanelStore((s) => s.closePanel)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const closeTimer = useRef<number | null>(null)

  // open/close: enter-анимация `.open` + отложенный демонтаж под slide-out.
  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
    closeTimer.current = window.setTimeout(() => {
      setMounted(false)
      closeTimer.current = null
    }, ANIM_MS)
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!mounted) return null

  return createPortal(
    <div
      className={`smodal-backdrop${opening ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="smodal">
        <div className="smodal-body">{children}</div>
        {footer && <div className="smodal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
