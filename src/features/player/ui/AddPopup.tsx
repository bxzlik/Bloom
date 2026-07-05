import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { usePlaylistStore } from '@features/library/model/playlistStore'
import { mpAddToLib, mpAddToPlaylist, mpOpenNewPlaylist } from '@features/player'
import { useT } from '@shared/i18n'
import { PlCover } from '@features/library/ui/PlCover'
import { Ico } from '@shared/ui/icons/solar'

export interface AddPopupProps {
  open: boolean
  onClose: () => void
  /** Якорь — кнопка, рядом с которой позиционируется попап. */
  anchorRef: RefObject<HTMLElement | null>
  hasTrack: boolean
  canAddToLib: boolean
  /**
   * Если задан — операции выполняются над этим конкретным треком (через
   * `usePlaylistStore.addTrackToPl` напрямую). Если не задан — используются
   * `mp*` обёртки, работающие с текущим воспроизводимым треком (
   * `showAddPopup(event)` vs `showAddPopup(event, trackId)`).
   */
  trackId?: string
  /** Колбэк «Создать/Новый плейлист» — мгновенное создание + inline-редакт
   *  (родитель зовёт createPlaylistInline). */
  onCreateNewPlaylist?: () => void
  /** Override клика по плейлисту — для multi-select (родитель сам добавляет все выбранные). */
  onPickPlaylist?: (plId: string) => void
  /** Override «В библиотеку» — для конкретного трека (по умолчанию mpAddToLib текущего). */
  onAddToLib?: () => void
}

/**
 * Попап «Добавить в …» — `_showScAddFlyout`.
 * Использует `#cxPlFlyout` + `.ci` + `.ci-icon` + `.cx-sep` стили
 * (те же, что у TrackCtxMenu) — единый внешний вид с контекстным меню.
 *
 * Рендер через `createPortal` в `body`, иначе backdrop-filter предков ломает
 * `position:fixed` (см. «портал uiPortal по той же причине»).
 *
 * Позиционирование: сверху над анкором (по центру), при недостатке места
 * вниз. Clamp по ширине viewport.
 */
export const AddPopup = ({
  open,
  onClose,
  anchorRef,
  hasTrack,
  canAddToLib,
  trackId,
  onCreateNewPlaylist,
  onPickPlaylist,
  onAddToLib,
}: AddPopupProps) => {
  const t = useT()
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const playlists = usePlaylistStore((s) => s.playlists)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)

  // Унифицированный «добавить в плейлист».
  const addToPl = (plId: string) => {
    if (onPickPlaylist) onPickPlaylist(plId)
    else if (trackId) addTrackToPl(plId, trackId)
    else mpAddToPlaylist(plId)
  }
  const openNewPl = () => {
    if (onCreateNewPlaylist) onCreateNewPlaylist()
    else mpOpenNewPlaylist()
  }

  // Позиционирование после рендера (нужны размеры попапа).
  useLayoutEffect(() => {
    if (!open || !hasTrack) {
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
    let top = r.top - ph - 6
    if (left < 6) left = 6
    if (left + pw > window.innerWidth - 6) left = window.innerWidth - pw - 6
    // Если над анкором не помещается — открываем вниз.
    if (top < 6) top = r.bottom + 6
    setPos({ left, top })
  }, [open, hasTrack, anchorRef, playlists.length, canAddToLib])

  // Запуск open-анимации через Web Animations API после установки позиции.
  // Императивный подход надёжнее CSS-keyframe + class toggle: animation
  // гарантированно стартует с from-state, нет промежуточных кадров финального
  // состояния. `fill: 'both'` сохраняет конечное состояние (opacity:1, scale:1)
  // после завершения. Без translateY и без overshoot — иконки не «дёргаются».
  useLayoutEffect(() => {
    if (!pos || !popupRef.current) return
    const el = popupRef.current
    const anim = el.animate(
      [
        { opacity: 0, transform: 'scale(0.94)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      {
        duration: 160,
        easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
        fill: 'both',
      },
    )
    return () => {
      anim.cancel()
    }
  }, [pos])

  // Click outside / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popupRef.current?.contains(t)) return
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

  if (!open || !hasTrack) return null

  return createPortal(
    <div
      ref={popupRef}
      id="cxPlFlyout"
      style={{
        // display:block override для `#cxPlFlyout{display:none}` —
        // нужен для рендера в DOM (.open класс мы не используем).
        display: 'block',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        // visibility:hidden до measurement — иначе кадр в позиции (-9999,-9999)
        // виден до того как WAAPI начнёт animation.
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: 'top center',
      }}
    >
      {canAddToLib && (
        <>
          <div
            className="ci"
            style={{ color: 'var(--accent)', fontWeight: 600 }}
            onClick={() => {
              ;(onAddToLib ?? mpAddToLib)()
              onClose()
            }}
          >
            <span className="ci-icon">
              <Ico name="download" width={12} height={12} />
            </span>{' '}
            {t('player.add.toLib')}
          </div>
          {playlists.length > 0 && <div className="cx-sep" />}
        </>
      )}
      {playlists.length === 0 ? (
        <div
          className="ci"
          onClick={() => {
            openNewPl()
            onClose()
          }}
        >
          <span className="ci-icon">
            <Ico name="add" width={11} height={11} />
          </span>{' '}
          {t('player.add.createPlaylist')}
        </div>
      ) : (
        <>
          {playlists.map((pl) => {
            const already = !!trackId && pl.trs.includes(trackId)
            return (
              <div
                key={pl.id}
                className={already ? 'ci ci-active' : 'ci'}
                onClick={() => {
                  addToPl(pl.id)
                  onClose()
                }}
              >
                <span className="ci-icon" style={{ background: 'transparent', overflow: 'hidden' }}>
                  {pl.cover ? (
                    <img src={pl.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <PlCover trs={pl.trs} seed={pl.id} />
                  )}
                </span>{' '}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pl.name}
                </span>
                {already && (
                  <Ico name="check" width={13} height={13} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                )}
              </div>
            )
          })}
          <div className="cx-sep" />
          <div
            className="ci"
            onClick={() => {
              openNewPl()
              onClose()
            }}
          >
            <span className="ci-icon">
              <Ico name="add" width={11} height={11} />
            </span>{' '}
            {t('player.add.newPlaylist')}
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}
