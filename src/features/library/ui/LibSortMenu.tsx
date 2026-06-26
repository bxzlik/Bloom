import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { useT, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import type { LibSidebarSort } from '../lib'

export interface LibSortMenuProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  value: LibSidebarSort
  onChange: (next: LibSidebarSort) => void
}

const OPTIONS: { value: LibSidebarSort; labelKey: TranslationKey }[] = [
  { value: 'default', labelKey: 'lib.sort.default' },
  { value: 'name-asc', labelKey: 'lib.sortMenu.nameAsc' },
  { value: 'name-desc', labelKey: 'lib.sortMenu.nameDesc' },
  { value: 'type', labelKey: 'lib.sortMenu.type' },
]

/**
 * Меню сортировки сайдбара `#libSortMenu`.
 * Использует CSS-класс `#libSortMenu.open`.
 */
export const LibSortMenu = ({
  open,
  onClose,
  anchorRef,
  value,
  onChange,
}: LibSortMenuProps) => {
  const t = useT()
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // Плавная open-анимация (вместо ctxIn).
  usePopupOpenAnimation(menuRef, pos)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null)
      return
    }
    const recalc = () => {
      const a = anchorRef.current
      if (!a) return
      const r = a.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    recalc()
    window.addEventListener('resize', recalc)
    window.addEventListener('scroll', recalc, true)
    return () => {
      window.removeEventListener('resize', recalc)
      window.removeEventListener('scroll', recalc, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null

  return createPortal(
    <div
      ref={menuRef}
      id="libSortMenu"
      className="open"
      style={{ top: pos.top, right: pos.right, left: 'auto' }}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            className={active ? 'active' : undefined}
            onClick={() => {
              onChange(opt.value)
              onClose()
            }}
          >
            <Ico name="check" variant="bold" width={12} height={12} style={{ opacity: active ? 1 : 0 }} />
            {t(opt.labelKey)}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
