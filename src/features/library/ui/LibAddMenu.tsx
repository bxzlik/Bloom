import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { folderAdd, importPlaylistFile } from '../api'
import { importPlaylistData } from '../lib'

export interface LibAddMenuProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** Колбэк «Создать плейлист» — открывает NewPlaylistModal в родителе. */
  onCreatePlaylist: () => void
  /** Результат импорта (для тоста в родителе — меню к этому моменту закрыто). */
  onImported?: (res: { playlists: number; tracks: number } | null) => void
}

/**
 * Меню кнопки «+» в сайдбаре библиотеки `#libAddMenu`.
 * Стилизация — через CSS-класс `#libAddMenu.open`.
 *
 * Позиция: position:fixed, top = anchor.bottom+6, right прижата к anchor.right
 * (формула toggleLibAddMenu). Замер — через useLayoutEffect
 * после монтирования и через ResizeObserver на body чтобы переехать
 * при ресайзе/скролле.
 */
export const LibAddMenu = ({
  open,
  onClose,
  anchorRef,
  onCreatePlaylist,
  onImported,
}: LibAddMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // Плавная open-анимация (вместо ctxIn).
  usePopupOpenAnimation(menuRef, pos)

  // Позицию считаем синхронно после layout — anchorRect к этому моменту валиден.
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

  // Закрытие по клику вне.
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

  const onImport = async () => {
    onClose()
    const content = await importPlaylistFile().catch(() => null)
    if (!content) return
    // importPlaylistData восстанавливает треки + создаёт плейлисты с НОВЫМИ id.
    const res = importPlaylistData(content)
    onImported?.(res)
  }

  return createPortal(
    <div
      ref={menuRef}
      id="libAddMenu"
      className="open"
      style={{ top: pos.top, right: pos.right, left: 'auto' }}
    >
      <button
        onClick={() => {
          onClose()
          onCreatePlaylist()
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        Создать плейлист
      </button>
      <button
        onClick={() => {
          onClose()
          folderAdd().catch((e) => console.warn('folderAdd failed', e))
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
        Привязать папку
      </button>
      <button onClick={onImport}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Импорт плейлиста
      </button>
    </div>,
    document.body,
  )
}

