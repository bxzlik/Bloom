import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '@entities/track'
import { usePopupOpenAnimation } from '@shared/hooks'
import {
  playTrack,
  addToQueue,
  playNextInQueue,
  removeFromQueue,
  useQueueStore,
} from '@features/player'
import waveApi from '@/wave'
import { useShareStore } from '@shared/ui'
import { useFavStore, useLibStore, usePlaylistStore, useTrackInfoStore } from '../model'
import { deleteUploadedTrack, saveTrackToLibrary } from '../lib'

export interface TrackCtxMenuProps {
  /** Координаты курсора (от события). null = меню скрыто. */
  pos: { x: number; y: number } | null
  track: Track | null
  onClose: () => void
  /** «Создать плейлист и добавить» — родитель открывает NewPlaylistModal. */
  onCreatePlaylistForTrack?: (trackId: string) => void
  /** «Редактировать теги» — родитель открывает TagEditor. */
  onEditTags?: (track: Track) => void
}

/**
 * Контекстное меню для трека `#ctx`.
 * Использует CSS-классы `.ctx`, `.ci`, `.cx-sep`, `#cxPreview*`.
 *
 * Скрыты (display:none) пункты, требующие фаз E+ (плеер, теги, share):
 * cxplay, cxedit, cxinfo, cxq, cxqnext, cxshare, cxwave, cxlib, cxrmq.
 *
 * Активны сейчас: cxfav (toggle), cxadd→flyout, cxrm (только mode=pl), cxdel.
 */
export const TrackCtxMenu = ({
  pos,
  track,
  onClose,
  onCreatePlaylistForTrack,
  onEditTags,
}: TrackCtxMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const addItemRef = useRef<HTMLDivElement>(null)
  const isFav = useFavStore((s) => (track ? s.favs.has(track.id) : false))
  const toggleFav = useFavStore((s) => s.toggleFav)
  const playlists = usePlaylistStore((s) => s.playlists)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const removeTrackFromPl = usePlaylistStore((s) => s.removeTrackFromPl)
  const openTrackInfo = useTrackInfoStore((s) => s.openTrackInfo)
  const openShare = useShareStore((s) => s.openShare)
  const mode = useLibStore((s) => s.mode)
  const plId = useLibStore((s) => s.plId)
  // В очереди ли трек (для условного показа «Убрать из очереди»).
  const isInQueue = useQueueStore((s) => (track ? s.queue.includes(track.id) : false))
  // В библиотеке ли трек. Для треков площадок (SC/Yandex) из поиска — false:
  // показываем «В библиотеку», а fav/в-плейлист сперва персистят трек.
  const inLib = useLibStore((s) => (track ? s.tracks.some((t) => t.id === track.id) : false))

  const [clampedPos, setClampedPos] = useState<{ x: number; y: number } | null>(null)
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [flyoutPos, setFlyoutPos] = useState<{ left: number; top: number } | null>(null)
  const hideTimer = useRef<number | null>(null)

  // Плавная open-анимация через WAAPI (вместо ctxIn с overshoot+translateY).
  usePopupOpenAnimation(menuRef, clampedPos)
  usePopupOpenAnimation(flyoutRef, flyoutPos)

  // Сбрасываем flyout при закрытии меню — иначе state переживает
  // unmount-через-null и при следующем открытии flyout всплывает сам.
  useEffect(() => {
    if (!pos) {
      setFlyoutOpen(false)
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
    }
  }, [pos])

  //: open/close flyout через mouseenter/mouseleave с 180ms delay.
  const cancelHide = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }
  const scheduleHide = () => {
    cancelHide()
    hideTimer.current = window.setTimeout(() => setFlyoutOpen(false), 180)
  }

  // Auto-clamp основного меню чтобы не вылезало за viewport.
  useLayoutEffect(() => {
    if (!pos || !menuRef.current) {
      setClampedPos(pos)
      return
    }
    const m = menuRef.current
    const mw = m.offsetWidth
    const mh = m.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = pos.x
    let y = pos.y
    if (x + mw > vw - 8) x = vw - mw - 8
    if (y + mh > vh - 8) y = vh - mh - 8
    if (x < 8) x = 8
    if (y < 8) y = 8
    setClampedPos({ x, y })
  }, [pos])

  // Позиционирование flyout: справа от .ci #cxadd, при недостатке места — слева.
  useLayoutEffect(() => {
    if (!flyoutOpen || !addItemRef.current || !flyoutRef.current) {
      setFlyoutPos(null)
      return
    }
    const ar = addItemRef.current.getBoundingClientRect()
    const fw = flyoutRef.current.offsetWidth
    const fh = flyoutRef.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = ar.right + 4
    let top = ar.top - 4
    if (left + fw > vw - 8) left = ar.left - fw - 4
    if (top + fh > vh - 8) top = vh - fh - 8
    if (top < 8) top = 8
    setFlyoutPos({ left, top })
  }, [flyoutOpen])

  // Close on click outside / Escape.
  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (flyoutRef.current?.contains(t)) return
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
  }, [pos, onClose])

  if (!pos || !track) return null

  const renderPos = clampedPos ?? pos
  // Удалять можно «свои» библиотечные записи: загруженные файлы + сохранённые
  // треки площадок (SC/Yandex). Папочные (folder_watcher) — нельзя (вернутся
  // при пересканировании, управляются папкой).
  const isDeletable = inLib && !track._localPath && !track._folder
  // Перед fav/в-плейлист для не-библиотечного трека — сохраняем его навсегда,
  // иначе после перезапуска fav/запись плейлиста не зарезолвятся (трек был temp).
  const ensurePersisted = () => {
    if (!inLib) saveTrackToLibrary(track)
  }
  const inCurrentPl = mode === 'pl' && plId
    ? playlists.find((p) => p.id === plId)?.trs.includes(track.id) ?? false
    : false

  const onAddEnter = () => {
    cancelHide()
    setFlyoutOpen(true)
  }
  const onAddLeave = () => scheduleHide()

  return createPortal(
    <>
      <div
        ref={menuRef}
        className="ctx open"
        style={{
          left: renderPos.x,
          top: renderPos.y,
          visibility: clampedPos ? 'visible' : 'hidden',
        }}
      >
        {/* Превью трека */}
        <div
          id="cxPreview"
          style={{
            display: 'flex',
            ...(track.cover
              ? ({ '--cx-cover': `url("${track.cover}")` } as CSSProperties)
              : {}),
          }}
        >
          <div id="cxPreviewCov">
            {track.cover ? (
              <img src={track.cover} alt="" />
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div id="cxPreviewName">{track.name || '—'}</div>
            <div id="cxPreviewArtist">{track.artist || '—'}</div>
          </div>
        </div>

        {/* cxplay — играть этот трек */}
        <div
          className="ci"
          id="cxplay"
          onClick={() => {
            playTrack(track.id)
            onClose()
          }}
        >
          <span className="ci-icon">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
            </svg>
          </span>{' '}
          Воспроизвести
        </div>

        {inLib && onEditTags && (
        <div
          className="ci"
          id="cxedit"
          onClick={() => {
            if (onEditTags && track) onEditTags(track)
            onClose()
          }}
        >
          <span className="ci-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </span>{' '}
          Редактировать теги
        </div>
        )}

        <div
          className="ci"
          id="cxinfo"
          onClick={() => {
            openTrackInfo(track)
            onClose()
          }}
        >
          <span className="ci-icon">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>{' '}
          Инфо о треке
        </div>

        <div className="cx-sep" id="cxSep1" />

        <div
          className="ci"
          id="cxfav"
          onClick={() => {
            ensurePersisted()
            toggleFav(track.id)
            onClose()
          }}
        >
          <span className="ci-icon">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill={isFav ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          </span>{' '}
          {isFav ? 'Убрать из любимого' : 'В любимое'}
        </div>

        <div
          ref={addItemRef}
          className="ci"
          id="cxadd"
          onMouseEnter={onAddEnter}
          onMouseLeave={onAddLeave}
          onClick={(e) => {
            e.stopPropagation()
            onAddEnter()
          }}
        >
          <span className="ci-icon">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </span>{' '}
          В плейлист
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginLeft: 'auto', opacity: 0.4, flexShrink: 0 }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        {/* cxshare — «Поделиться», только для треков с SC-данными. */}
        {(track.scId != null || track.scPermalink != null) && (
          <div
            className="ci"
            id="cxshare"
            onClick={() => {
              openShare({
                type: 'track',
                id: track.scId != null ? String(track.scId) : '',
                title: track.name,
                artist: track.artist,
                permalink: track.scPermalink ?? null,
                cover: track.cover ?? null,
              })
              onClose()
            }}
          >
            <span className="ci-icon">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </span>{' '}
            Поделиться
          </div>
        )}

        {/* cxwave — «Волна по треку», только для SC-треков */}
        {(track.scId != null || track.scTrackId != null) && (
          <div
            className="ci"
            id="cxwave"
            onClick={() => {
              void waveApi.startByTrack(track.id)
              onClose()
            }}
          >
            <span className="ci-icon" style={{ color: 'var(--accent)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <rect x="2" y="9" width="2.6" height="6" rx="1.3" />
                <rect x="6.4" y="6" width="2.6" height="12" rx="1.3" />
                <rect x="10.8" y="3" width="2.6" height="18" rx="1.3" />
                <rect x="15.2" y="7" width="2.6" height="10" rx="1.3" />
                <rect x="19.6" y="10" width="2.6" height="4" rx="1.3" />
              </svg>
            </span>{' '}
            Волна по треку
          </div>
        )}

        <div className="cx-sep" />

        <div
          className="ci"
          id="cxq"
          onClick={() => {
            addToQueue(track.id)
            onClose()
          }}
        >
          <span className="ci-icon">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>{' '}
          В очередь
        </div>

        <div
          className="ci"
          id="cxqnext"
          onClick={() => {
            playNextInQueue(track.id)
            onClose()
          }}
        >
          <span className="ci-icon">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </span>{' '}
          Играть следующим
        </div>

        {(inCurrentPl || isInQueue || isDeletable) && <div className="cx-sep" />}

        {inCurrentPl && plId && (
          <div
            className="ci red"
            id="cxrm"
            onClick={() => {
              removeTrackFromPl(plId, track.id)
              onClose()
            }}
          >
            <span className="ci-icon">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>{' '}
            Убрать из плейлиста
          </div>
        )}

        {isInQueue && (
          <div
            className="ci red"
            id="cxrmq"
            onClick={() => {
              removeFromQueue(track.id)
              onClose()
            }}
          >
            <span className="ci-icon">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>{' '}
            Убрать из очереди
          </div>
        )}

        {isDeletable && (
          <div
            className="ci red"
            id="cxdel"
            onClick={() => {
              onClose()
              if (!confirm('Удалить трек?')) return
              void deleteUploadedTrack(track.id)
            }}
          >
            <span className="ci-icon">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </span>{' '}
            Удалить трек
          </div>
        )}
      </div>

      {/* Flyout «В плейлист» — отдельный popup справа от cxadd */}
      {flyoutOpen && (
        <div
          ref={flyoutRef}
          id="cxPlFlyout"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          style={{
            display: 'block',
            left: flyoutPos?.left ?? -9999,
            top: flyoutPos?.top ?? -9999,
            visibility: flyoutPos ? 'visible' : 'hidden',
          }}
        >
          {/* «В библиотеку» — первый пункт flyout для трека НЕ из библиотеки
              (SC/Yandex). _showScAddFlyout. */}
          {!inLib && (
            <>
              <div
                className="ci"
                style={{ color: 'var(--accent)', fontWeight: 600 }}
                onClick={() => {
                  saveTrackToLibrary(track)
                  onClose()
                }}
              >
                <span className="ci-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>{' '}
                В библиотеку
              </div>
              <div className="cx-sep" />
            </>
          )}
          {playlists.length === 0 ? (
            <div
              className="ci"
              onClick={() => {
                onClose()
                onCreatePlaylistForTrack?.(track.id)
              }}
            >
              <span className="ci-icon">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>{' '}
              Создать плейлист
            </div>
          ) : (
            <>
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  className="ci"
                  onClick={() => {
                    ensurePersisted()
                    if (!pl.trs.includes(track.id)) addTrackToPl(pl.id, track.id)
                    onClose()
                  }}
                >
                  <span className="ci-icon">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    >
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  </span>{' '}
                  {pl.name}
                </div>
              ))}
              <div className="cx-sep" />
              <div
                className="ci"
                onClick={() => {
                  onClose()
                  onCreatePlaylistForTrack?.(track.id)
                }}
              >
                <span className="ci-icon">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </span>{' '}
                Новый плейлист
              </div>
            </>
          )}
        </div>
      )}
    </>,
    document.body,
  )
}
