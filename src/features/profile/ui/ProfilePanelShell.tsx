import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useProfilePanelStore, type ProfilePanel } from '../model/profilePanelStore'

/**
 * Каркас боковых шторок профиля («Статистика» / «Достижения»).
 *
 * Панель — общий `.spanel` (тот же, что у редактора профиля и панели тегов):
 * затемнение + панель, выезжающая справа на всю высоту (влево — если включена
 * настройка `drawerSide`). Что показывать, решает `profilePanelStore`: открыта
 * ровно одна шторка, поэтому обе монтируют этот каркас и сравнивают свой `kind`
 * с текущим значением.
 *
 * Шапки у панели нет — ни заголовка, ни крестика: что открыто, видно по самому
 * содержимому, а закрывают шторку кликом по фону или Esc. Тело скроллится (без
 * видимой полосы прокрутки), футер с действиями необязателен.
 */

// Длительность slide-out (.spanel transform .42s) перед демонтажем.
const ANIM_MS = 440

interface Props {
  kind: ProfilePanel
  footer?: ReactNode
  children: ReactNode
}

export const ProfilePanelShell = ({ kind, footer, children }: Props) => {
  const open = useProfilePanelStore((s) => s.panel === kind)
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
      className={`spanel-backdrop${opening ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="spanel">
        <div className="ppnl-body">{children}</div>
        {footer && <div className="ppnl-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
