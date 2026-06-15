import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { SPEEDS, useSpeedStore } from '../model/speedStore'

const label = (s: number): string => (s === 1 ? '1×' : s + '×')

/**
 * Пикер скорости воспроизведения — `#speedPicker` /
 * `renderSpeedPicker`. 3 кружка (0.75× / ▶1× / 1.25×).
 *
 * Рендер через `createPortal` в `body` — иначе
 * backdrop-filter предков ломает `position:fixed`. Open-анимация — через общий
 * `usePopupOpenAnimation` (WAAPI scale 0.94→1), как у контекстного меню `.ctx` и
 * меню «три точки». Класс `.open` оставлен только ради CSS `display:flex`
 * ( `#speedPicker{display:none}`); сам keyframe `libMenuIn` гасится хуком.
 * Закрытие — мгновенный unmount (как у `.ctx`), без closing-анимации.
 */
export const SpeedPicker = ({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
}) => {
  const idx = useSpeedStore((s) => s.idx)
  const setIdx = useSpeedStore((s) => s.setIdx)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Позиционирование над анкором (по центру), flip вниз при нехватке места —
  // toggleSpeedPicker.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const btn = anchorRef.current
    const p = ref.current
    if (!btn || !p) return
    const r = btn.getBoundingClientRect()
    const pw = p.offsetWidth || 190
    let left = r.left + r.width / 2 - pw / 2
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
    const top = r.top - 4 < 60 ? r.bottom + 6 : r.top - p.offsetHeight - 6
    setPos({ left, top })
  }, [open, anchorRef])

  // Open-анимация (та же, что у .ctx / меню «три точки»).
  usePopupOpenAnimation(ref, pos)

  // Click outside / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return createPortal(
    <div
      ref={ref}
      id="speedPicker"
      className="open"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: 'top center',
      }}
    >
      {SPEEDS.map((s, i) => {
        const active = i === idx
        const isPlay = s === 1
        return (
          <button
            key={s}
            type="button"
            className={`sp-item${active ? ' active' : ''}${isPlay ? ' play' : ''}`}
            onClick={() => {
              setIdx(i)
              onClose()
            }}
          >
            <span className="sp-circle">
              {isPlay ? (
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
                </svg>
              ) : (
                <span className="sp-num">{label(s)}</span>
              )}
            </span>
            <span className="sp-label">{label(s)}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
