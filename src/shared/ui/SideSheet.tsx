import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { runEnterAnimation } from '@shared/lib/enterAnimation'

/**
 * Боковая панель «в полокна» — единый каркас всех выезжающих шторок.
 *
 * Панель прижата к краю окна впритык (без отступов и радиуса), во всю высоту под
 * тайтлбаром; приложение при этом уменьшается, отъезжает в сторону от панели,
 * приглушается и перестаёт быть кликабельным — клик по нему возвращает назад.
 * Стороны фиксированы ролью, а не настройкой: drawer'ы — справа, настройки —
 * слева (`side` + `wide`). Стили и ручки — `shared/styles/side-sheet.css`.
 *
 * Шапки нет: ни заголовка, ни крестика. Закрывают кликом по фону или Esc.
 *
 * Открытием управляет вызывающий (`open`), компонент лишь доигрывает выезд и
 * держит себя смонтированным до конца ухода.
 */

/** Длительность выезда (`--sheet-dur`) — через неё демонтируем содержимое. */
const ANIM_MS = 440

/* «Уход в глубину» — состояние ГЛОБАЛЬНОЕ (классы на body), а панелей в дереве
   несколько, и во время закрытия одной может открыться другая. Поэтому не
   toggle, а счётчик: body-классы снимаются, когда закрылась последняя. */
let stageCount = 0

function acquireStage(side: 'left' | 'right', wide: boolean): () => void {
  stageCount += 1
  const { classList } = document.body
  classList.add('sheet-open')
  classList.toggle('sheet-from-right', side === 'right')
  classList.toggle('sheet-from-left', side === 'left')
  classList.toggle('sheet-wide', wide)
  return () => {
    stageCount -= 1
    if (stageCount > 0) return
    classList.remove('sheet-open', 'sheet-from-right', 'sheet-from-left', 'sheet-wide')
  }
}

interface Props {
  open: boolean
  onClose: () => void
  /** Сторона выезда: drawer'ы — 'right', настройки — 'left'. */
  side?: 'left' | 'right'
  /** Широкая панель (55% вместо 45%) — для настроек. */
  wide?: boolean
  /** Доп. класс на саму панель (для внутренних стилей конкретной шторки). */
  className?: string
  /** Клик по затемнённому приложению закрывает панель. */
  scrimClose?: boolean
  /** Esc закрывает панель. Выключают шторки со своей логикой Esc (кроп и т.п.). */
  escClose?: boolean
  children: ReactNode
}

export const SideSheet = ({
  open,
  onClose,
  side = 'right',
  wide = false,
  className = '',
  scrimClose = true,
  escClose = true,
  children,
}: Props) => {
  const [mounted, setMounted] = useState(false)
  const [shown, setShown] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      setMounted(true)
      return runEnterAnimation(setShown)
    }
    setShown(false)
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

  // Приложение уезжает синхронно с выездом панели и возвращается вместе с ней,
  // поэтому цепляемся к `shown` (а не к `open`/`mounted`).
  useEffect(() => {
    if (!shown) return
    return acquireStage(side, wide)
  }, [shown, side, wide])

  // Клик «назад» — только по самому ушедшему приложению. Ловушка живёт внутри
  // .app (псевдоэлемент в side-sheet.css), поэтому повторяет его форму с
  // перспективой, а пустое поле вокруг карточки и тайтлбар кликов не закрывают.
  // Приложение инертно, так что клик по любому его месту приходит с target=.app.
  useEffect(() => {
    if (!open || !scrimClose) return
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.classList?.contains('app')) onClose()
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [open, scrimClose, onClose])

  useEffect(() => {
    if (!open || !escClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, escClose, onClose])

  if (!mounted) return null

  return createPortal(
    <div className={`sheet-layer sheet-${side}${shown ? ' open' : ''}`}>
      <div className="sheet-scrim" />
      <aside className={`sheet${className ? ' ' + className : ''}`}>{children}</aside>
    </div>,
    document.body,
  )
}
