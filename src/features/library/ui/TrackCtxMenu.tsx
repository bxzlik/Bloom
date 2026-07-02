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
  addToQueue,
  playNextInQueue,
  removeFromQueue,
  useQueueStore,
  downloadTrack,
} from '@features/player'
import waveApi from '@/wave'
import { useShareStore, VinylCover } from '@shared/ui'
import { useT } from '@shared/i18n'
import { useFavStore, useLibStore, usePlaylistStore, useTrackInfoStore } from '../model'
import { Ico } from '@shared/ui/icons/solar'
import { deleteUploadedTrack, saveTrackToLibrary } from '../lib'

export interface TrackCtxMenuProps {
  /** Координаты курсора (от события). null = меню скрыто. */
  pos: { x: number; y: number } | null
  track: Track | null
  onClose: () => void
  /** «Создать плейлист и добавить» — мгновенное создание + inline-редакт
   *  (родитель зовёт createPlaylistInline). */
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
  const t = useT()
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
  // Платформенные действия (share/wave/download) — общий флаг для разделителя.
  const hasShare = track.scId != null || track.scPermalink != null
  const hasWave = track.scId != null || track.scTrackId != null
  const hasDl = !!(track._sc || track._ym || track._ytm || track._sp)
  const hasTools = hasShare || hasWave || hasDl

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
              <Ico name="note" width={14} height={14} />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div id="cxPreviewName">{track.name || '—'}</div>
            <div id="cxPreviewArtist">{track.artist || '—'}</div>
          </div>
        </div>

        {/* ── Очередь ── */}
        <div
          className="ci"
          id="cxq"
          onClick={() => {
            addToQueue(track.id)
            onClose()
          }}
        >
          <span className="ci-icon">
            <Ico name="add" width={11} height={11} />
          </span>{' '}
          {t('lib.ctx.toQueue')}
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
            <Ico name="playNext" width={11} height={11} />
          </span>{' '}
          {t('lib.ctx.playNext')}
        </div>

        <div className="cx-sep" />

        {/* ── Коллекции: любимое / плейлист ── */}
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
            <Ico name="heart" variant={isFav ? 'bold' : 'linear'} width={13} height={13} />
          </span>{' '}
          {isFav ? t('lib.ctx.favRemove') : t('lib.ctx.favAdd')}
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
            <Ico name="note" width={11} height={11} />
          </span>{' '}
          {t('lib.ctx.toPlaylist')}
          <Ico name="arrowRight" width={10} height={10} style={{ marginLeft: 'auto', opacity: 0.4, flexShrink: 0 }} />
        </div>

        {/* ── Действия площадок: поделиться / волна / скачать ── */}
        {hasTools && <div className="cx-sep" />}

        {/* cxshare — «Поделиться», только для треков с SC-данными. */}
        {hasShare && (
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
              <Ico name="share" width={11} height={11} />
            </span>{' '}
            {t('lib.ctx.share')}
          </div>
        )}

        {/* cxwave — «Волна по треку», только для SC-треков */}
        {hasWave && (
          <div
            className="ci"
            id="cxwave"
            onClick={() => {
              void waveApi.startByTrack(track.id)
              onClose()
            }}
          >
            <span className="ci-icon" style={{ color: 'var(--accent)' }}>
              <Ico name="wave" variant="bold" width={13} height={13} />
            </span>{' '}
            {t('lib.ctx.waveByTrack')}
          </div>
        )}

        {/* cxdl — «Скачать», только для треков площадок (SC/Yandex/YTM/Spotify). */}
        {hasDl && (
          <div
            className="ci"
            id="cxdl"
            onClick={() => {
              onClose()
              void downloadTrack(track)
            }}
          >
            <span className="ci-icon">
              <Ico name="download" width={12} height={12} />
            </span>{' '}
            {t('lib.ctx.download')}
          </div>
        )}

        <div className="cx-sep" />

        {/* ── Метаданные: теги / инфо ── */}
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
            <Ico name="edit" width={13} height={13} />
          </span>{' '}
          {t('lib.ctx.editTags')}
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
            <Ico name="info" width={11} height={11} />
          </span>{' '}
          {t('lib.ctx.trackInfo')}
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
              <Ico name="close" width={11} height={11} />
            </span>{' '}
            {t('lib.ctx.removeFromPl')}
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
              <Ico name="close" width={11} height={11} />
            </span>{' '}
            {t('player.aria.removeFromQueue')}
          </div>
        )}

        {isDeletable && (
          <div
            className="ci red"
            id="cxdel"
            onClick={() => {
              onClose()
              if (!confirm(t('lib.ctx.confirmDelete'))) return
              void deleteUploadedTrack(track.id)
            }}
          >
            <span className="ci-icon">
              <Ico name="trash" width={11} height={11} />
            </span>{' '}
            {t('lib.ctx.deleteTrack')}
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
                  <Ico name="download" width={12} height={12} />
                </span>{' '}
                {t('lib.ctx.toLibrary')}
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
                <Ico name="add" width={11} height={11} />
              </span>{' '}
              {t('lib.ctx.createPlaylist')}
            </div>
          ) : (
            <>
              {playlists.map((pl) => {
                const already = pl.trs.includes(track.id)
                return (
                  <div
                    key={pl.id}
                    className={already ? 'ci ci-active' : 'ci'}
                    onClick={() => {
                      ensurePersisted()
                      if (!already) addTrackToPl(pl.id, track.id)
                      onClose()
                    }}
                  >
                    <span className="ci-icon" style={{ background: 'transparent', overflow: 'hidden' }}>
                      {pl.cover ? (
                        <img
                          src={pl.cover}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <VinylCover seed={pl.id} />
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
                  onClose()
                  onCreatePlaylistForTrack?.(track.id)
                }}
              >
                <span className="ci-icon">
                  <Ico name="add" width={11} height={11} />
                </span>{' '}
                {t('player.add.newPlaylist')}
              </div>
            </>
          )}
        </div>
      )}
    </>,
    document.body,
  )
}
