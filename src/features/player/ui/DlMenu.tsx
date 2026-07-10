import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { useT } from '@shared/i18n'
import type { Track } from '@entities/track'
import { Ico } from '@shared/ui/icons/solar'
import { useOfflineStore, toggleTrackOffline } from '@features/offline'
import { isDownloadable } from '../lib/download'
import { downloadTrack, downloadCover } from '../lib/download'

/**
 * Меню скачивания «трек / обложка» — `showDlMenu`.
 * Анкорится над кнопкой `#dlMenuBtn` (как SpeedPicker), рендер через портал в
 * body. Open-анимация — тот же `usePopupOpenAnimation` (WAAPI scale 0.94→1), что
 * и у SpeedPicker, ради единообразия попапов в ряду транспорта ( CSS
 * `libMenuIn` от класса `.open` гасится хуком).
 */
const iconTr = <Ico name="note" width={15} height={15} />
const iconIm = <Ico name="gallery" width={15} height={15} />

export const DlMenu = ({
  open,
  onClose,
  anchorRef,
  track,
  coverOverride,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  track: Track | null
  coverOverride: string | null
}) => {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const hasCover = !!(coverOverride || track?.cover)
  // Офлайн-статус текущего трека (для тоггла «Слушать офлайн / Убрать»).
  const isOffline = useOfflineStore((s) => (track ? s.paths.has(track.id) : false))
  const canOffline = !!track && isDownloadable(track)

  // Позиционирование по центру над анкором, flip вниз при нехватке места —
  // showDlMenu.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const btn = anchorRef.current
    const p = ref.current
    if (!btn || !p) return
    const r = btn.getBoundingClientRect()
    const mw = p.offsetWidth || 190
    let left = r.left + r.width / 2 - mw / 2
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8))
    const top = r.top - 4 < 60 ? r.bottom + 6 : r.top - p.offsetHeight - 6
    setPos({ left, top })
  }, [open, anchorRef])

  // Open-анимация (та же, что у SpeedPicker / .ctx) — гасит CSS libMenuIn.
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
      id="bloom-dl-popup"
      className={pos ? 'open' : ''}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: 'top center',
      }}
    >
      <div className="bloom-dl-inner">
        <button
          type="button"
          onClick={() => {
            onClose()
            void downloadTrack(track)
          }}
        >
          {iconTr} {t('player.dl.track')}
        </button>
        <button
          type="button"
          disabled={!hasCover}
          onClick={() => {
            onClose()
            void downloadCover(track, coverOverride)
          }}
        >
          {iconIm} {t('player.dl.cover')}
        </button>
        {canOffline && (
          <button
            type="button"
            onClick={() => {
              onClose()
              toggleTrackOffline(track)
            }}
          >
            <Ico
              name={isOffline ? 'check' : 'save'}
              width={15}
              height={15}
              style={isOffline ? { color: 'var(--accent)' } : undefined}
            />{' '}
            {isOffline ? t('player.dl.offlineRemove') : t('player.dl.offline')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
