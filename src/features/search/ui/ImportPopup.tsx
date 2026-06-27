import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { usePlaylistStore, type ImportTarget } from '@features/library'
import { useT } from '@shared/i18n'
import { VinylCover } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'

export interface ImportPopupProps {
  open: boolean
  onClose: () => void
  /** Якорь — кнопка «Импортировать», рядом с которой позиционируется попап. */
  anchorRef: RefObject<HTMLElement | null>
  /** Выбор цели импорта (новый плейлист / все треки / любимые / существующий). */
  onPick: (target: ImportTarget) => void
}

/**
 * Попап выбора цели импорта коллекции (альбом/плейлист/артист) — открывается
 * по кнопке «Импортировать» на детальной странице. Те же опции, что и у выбора
 * цели в меню «+» (импорт по ссылке): новый плейлист / все треки / любимые /
 * существующий плейлист.
 *
 * Стили — общий `#cxPlFlyout` + `.ci` + `.ci-icon` + `.cx-sep` (как у AddPopup),
 * рендер через портал в body (backdrop-filter предков ломает position:fixed).
 */
export const ImportPopup = ({ open, onClose, anchorRef, onPick }: ImportPopupProps) => {
  const t = useT()
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const playlists = usePlaylistStore((s) => s.playlists)

  const pick = (target: ImportTarget) => {
    onPick(target)
    onClose()
  }

  // Позиционирование после рендера (нужны размеры попапа).
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const btn = anchorRef.current
    const p = popupRef.current
    if (!btn || !p) return
    const r = btn.getBoundingClientRect()
    const pw = p.offsetWidth
    const ph = p.offsetHeight
    let left = r.left + r.width / 2 - pw / 2
    let top = r.bottom + 6
    if (left < 6) left = 6
    if (left + pw > window.innerWidth - 6) left = window.innerWidth - pw - 6
    // Если вниз не помещается — открываем вверх.
    if (top + ph > window.innerHeight - 6) top = r.top - ph - 6
    setPos({ left, top })
  }, [open, anchorRef, playlists.length])

  // Open-анимация через WAAPI после установки позиции (как у AddPopup).
  useLayoutEffect(() => {
    if (!pos || !popupRef.current) return
    const el = popupRef.current
    const anim = el.animate(
      [
        { opacity: 0, transform: 'scale(0.94)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 160, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'both' },
    )
    return () => anim.cancel()
  }, [pos])

  // Click outside / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (popupRef.current?.contains(n)) return
      if (anchorRef.current?.contains(n)) return
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
      ref={popupRef}
      id="cxPlFlyout"
      style={{
        display: 'block',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: 'top center',
      }}
    >
      <div className="ci" onClick={() => pick({ kind: 'create' })}>
        <span className="ci-icon">
          <Ico name="add" width={11} height={11} />
        </span>{' '}
        {t('player.add.createPlaylist')}
      </div>
      <div className="ci" onClick={() => pick({ kind: 'library' })}>
        <span className="ci-icon">
          <Ico name="download" width={12} height={12} />
        </span>{' '}
        {t('lib.import.target.library')}
      </div>
      <div className="ci" onClick={() => pick({ kind: 'favorites' })}>
        <span className="ci-icon">
          <Ico name="heart" width={12} height={12} />
        </span>{' '}
        {t('lib.import.target.favorites')}
      </div>
      {playlists.length > 0 && <div className="cx-sep" />}
      {playlists.map((pl) => (
        <div key={pl.id} className="ci" onClick={() => pick({ kind: 'playlist', id: pl.id })}>
          <span className="ci-icon" style={{ background: 'transparent', overflow: 'hidden' }}>
            {pl.cover ? (
              <img src={pl.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <VinylCover seed={pl.id} />
            )}
          </span>{' '}
          {pl.name}
        </div>
      ))}
    </div>,
    document.body,
  )
}
