import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { ArtistLinks, providerBrandColor, type Track } from '@entities/track'
import { usePopupOpenAnimation } from '@shared/hooks'
import {
  addToQueue,
  playNextInQueue,
  removeFromQueue,
  useQueueStore,
  downloadTrack,
  downloadCover,
  trackProviderId,
  switchTrackPlatform,
  providerLogo,
} from '@features/player'
import { getProviders } from '@features/providers'
import { useOfflineStore, toggleTrackOffline } from '@features/offline'
import waveApi from '@/wave'
import { useShareStore } from '@shared/ui'
import { PlCover } from './PlCover'
import { useT } from '@shared/i18n'
import { useFavStore, useLibStore, usePlaylistStore, useTrackInfoStore } from '../model'
import { Ico } from '@shared/ui/icons/solar'
import { deleteUploadedTrack, saveTrackToLibrary, tracksLabel } from '../lib'

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
  const flyout2Ref = useRef<HTMLDivElement>(null)
  const addItemRef = useRef<HTMLDivElement>(null)
  const moreItemRef = useRef<HTMLDivElement>(null)
  const srcItemRef = useRef<HTMLDivElement>(null)
  const dlItemRef = useRef<HTMLDivElement>(null)
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
  // Доступен ли трек офлайн (для тоггла «Слушать офлайн / Убрать из офлайна»).
  const isOffline = useOfflineStore((s) => (track ? s.paths.has(track.id) : false))

  // Всегда свежий onClose для слушателей с постоянной подпиской (см. ниже).
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const [clampedPos, setClampedPos] = useState<{ x: number; y: number } | null>(null)
  // Какое подменю-флайаут открыто: 'pl' (в плейлист), 'dl' (скачать / офлайн)
  // или 'more' («Ещё» — редкие пункты + смена площадки).
  const [sub, setSub] = useState<null | 'pl' | 'dl' | 'more'>(null)
  const [flyoutPos, setFlyoutPos] = useState<{ left: number; top: number } | null>(null)
  // Второй уровень: подменю «Сменить площадку» ВНУТРИ флайаута «Ещё».
  const [sub2, setSub2] = useState<null | 'src'>(null)
  const [flyout2Pos, setFlyout2Pos] = useState<{ left: number; top: number } | null>(null)
  const hideTimer = useRef<number | null>(null)

  // Плавная open-анимация через WAAPI (вместо ctxIn с overshoot+translateY).
  usePopupOpenAnimation(menuRef, clampedPos)
  usePopupOpenAnimation(flyoutRef, flyoutPos)
  usePopupOpenAnimation(flyout2Ref, flyout2Pos)

  // Сбрасываем flyout при закрытии меню — иначе state переживает
  // unmount-через-null и при следующем открытии flyout всплывает сам.
  useEffect(() => {
    if (!pos) {
      setSub(null)
      setSub2(null)
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
  const openSub = (which: 'pl' | 'dl' | 'more') => {
    cancelHide()
    setSub(which)
    setSub2(null)
  }
  // Закрывает ОБА уровня: уводя мышь с любого из них, пользователь уходит из
  // всей ветки, и оставлять висеть второй уровень было бы мусором на экране.
  const scheduleHide = () => {
    cancelHide()
    hideTimer.current = window.setTimeout(() => {
      setSub(null)
      setSub2(null)
    }, 180)
  }
  const openSub2 = () => {
    cancelHide()
    setSub2('src')
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

  // Позиционирование flyout: справа от пункта-якоря, при недостатке места — слева.
  const anchorEl =
    sub === 'more' ? moreItemRef.current : sub === 'dl' ? dlItemRef.current : addItemRef.current
  useLayoutEffect(() => {
    if (!sub || !anchorEl || !flyoutRef.current) {
      setFlyoutPos(null)
      return
    }
    const ar = anchorEl.getBoundingClientRect()
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
  }, [sub, anchorEl])

  // То же для второго уровня — якорь живёт ВНУТРИ первого флайаута, поэтому
  // считаем после его позиционирования (flyoutPos в deps).
  const anchor2El = sub2 ? srcItemRef.current : null
  useLayoutEffect(() => {
    if (!sub2 || !anchor2El || !flyout2Ref.current) {
      setFlyout2Pos(null)
      return
    }
    const ar = anchor2El.getBoundingClientRect()
    const fw = flyout2Ref.current.offsetWidth
    const fh = flyout2Ref.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = ar.right + 4
    let top = ar.top - 4
    if (left + fw > vw - 8) left = ar.left - fw - 4
    if (top + fh > vh - 8) top = vh - fh - 8
    if (top < 8) top = 8
    setFlyout2Pos({ left, top })
  }, [sub2, anchor2El, flyoutPos])

  // Close on click outside / Escape.
  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (flyoutRef.current?.contains(t)) return
      if (flyout2Ref.current?.contains(t)) return
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

  // Клик по имени артиста в превью: страницу открывает глобальный делегат
  // `.tra-link` (см. App), а меню надо закрыть отдельно — onDown его пропускает
  // (клик ВНУТРИ меню), а React-onClick сюда не дойдёт: делегат гасит всплытие
  // ещё в capture на document. Поэтому слушаем там же, в capture.
  //
  // Подписка ОДИН раз (deps []) через ref: делегат App синхронно дёргает сторы →
  // ререндер → эффект с [onClose] снял бы и заново повесил слушатель ПРЯМО внутри
  // текущей диспетчеризации, а браузер идёт по копии списка слушателей, снятой в
  // её начале — свежий слушатель в неё не попадает и не вызывается.
  useEffect(() => {
    const onLink = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t?.closest?.('.tra-link')) return
      if (!menuRef.current?.contains(t)) return
      closeRef.current()
    }
    document.addEventListener('click', onLink, true)
    return () => document.removeEventListener('click', onLink, true)
  }, [])

  if (!pos || !track) return null

  const renderPos = clampedPos ?? pos
  // Удалять можно «свои» библиотечные записи: загруженные файлы + сохранённые
  // треки площадок (SC/Yandex) и одиночные локальные файлы (у них есть
  // `_localPath`, но нет `_folder`). Папочные — нельзя: вернутся при
  // пересканировании, ими управляет папка.
  const isDeletable = inLib && !track._folder
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
  const hasWave = track.scId != null || track.scTrackId != null || !!track._ym
  const hasDl = !!(track._sc || track._ym || track._ytm)
  // Сменить площадку — только для библиотечного трека с площадочным origin и при
  // наличии хотя бы одной ДРУГОЙ сетевой площадки (замена = поиск + ремап записи).
  const curProv = trackProviderId(track)
  const netProviders = getProviders().filter((p) => p.id !== 'local')
  const canSwitchSrc = inLib && curProv !== 'local' && netProviders.some((p) => p.id !== curProv)

  const onAddEnter = () => openSub('pl')
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
            <div id="cxPreviewArtist">
              {track.artist ? (
                <ArtistLinks
                  artist={track.artist}
                  scId={track.artistScId}
                  permalink={track.artistPermalink}
                  artistId={track.artistId}
                  provider={track.artistProvider}
                />
              ) : (
                '—'
              )}
            </div>
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
            <Ico name="addQueue" width={13} height={13} />
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

        {/* ── Действия площадок: волна / скачать ── */}
        {(hasWave || hasDl) && <div className="cx-sep" />}

        {/* cxwave — «Волна по треку»: SC-треки (движок Bloom) и Яндекс (rotor track:<id>) */}
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

        {/* cxdl — «Скачать» → флайаут (скачать файл / слушать офлайн), только для
            треков площадок (SC/Yandex/YTM). Объединено ради экономии места. */}
        {hasDl && (
          <div
            ref={dlItemRef}
            className="ci"
            id="cxdl"
            onMouseEnter={() => openSub('dl')}
            onMouseLeave={onAddLeave}
            onClick={(e) => {
              e.stopPropagation()
              openSub('dl')
            }}
          >
            <span className="ci-icon">
              <Ico name="download" width={12} height={12} />
            </span>{' '}
            {t('lib.ctx.download')}
            <Ico name="arrowRight" width={10} height={10} style={{ marginLeft: 'auto', opacity: 0.4, flexShrink: 0 }} />
          </div>
        )}

        <div className="cx-sep" />

        {/* cxmore — «Ещё» → флайаут с редкими пунктами: поделиться, теги, инфо и
            смена площадки. Вынесены из основного списка, чтобы меню не росло в
            простыню: в один клик остаются только частые действия. */}
        <div
          ref={moreItemRef}
          className="ci"
          id="cxmore"
          onMouseEnter={() => openSub('more')}
          onMouseLeave={onAddLeave}
          onClick={(e) => {
            e.stopPropagation()
            openSub('more')
          }}
        >
          <span className="ci-icon">
            <Ico name="kebab" width={13} height={13} />
          </span>{' '}
          {t('common.more')}
          <Ico name="arrowRight" width={10} height={10} style={{ marginLeft: 'auto', opacity: 0.4, flexShrink: 0 }} />
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

      {/* Flyout-подменю справа от пункта: «В плейлист» (cxadd) или «Сменить
          площадку» (cxsrc) — один контейнер, содержимое по активному `sub`. */}
      {sub && (
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
          {/* ── Подменю «В плейлист» ── */}
          {sub === 'pl' && (
          <>
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
                    className={already ? 'ci ci-pl ci-active' : 'ci ci-pl'}
                    onClick={() => {
                      // Повторный клик по отмеченному плейлисту — убрать трек из него.
                      if (already) removeTrackFromPl(pl.id, track.id)
                      else {
                        ensurePersisted()
                        addTrackToPl(pl.id, track.id)
                      }
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
                        <PlCover trs={pl.trs} />
                      )}
                    </span>{' '}
                    <span className="ci-pl-txt">
                      <span className="ci-pl-name">{pl.name}</span>
                      <span className="ci-pl-sub">{tracksLabel(pl.trs.length)}</span>
                    </span>
                    {already && (
                      <Ico name="check" width={15} height={15} style={{ flexShrink: 0, color: 'var(--accent)' }} />
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
          </>
          )}

          {/* ── Подменю «Ещё»: редкие пункты. «Сменить площадку» — своя строка
              с флайаутом второго уровня (см. #cxSrcFlyout ниже). ── */}
          {sub === 'more' && (
            <>
              {hasShare && (
                <div
                  className="ci"
                  onMouseEnter={() => setSub2(null)}
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
                    <Ico name="share" width={12} height={12} />
                  </span>{' '}
                  {t('lib.ctx.share')}
                </div>
              )}

              {/* «Сменить площадку» — как и было раньше: одна строка со стрелкой,
                  список площадок открывается сбоку (второй уровень). */}
              {canSwitchSrc && (
                <div
                  ref={srcItemRef}
                  className="ci"
                  onMouseEnter={openSub2}
                  onClick={(e) => {
                    e.stopPropagation()
                    openSub2()
                  }}
                >
                  {/* Лого монохромное (currentColor) — красим в бренд площадки, как в
                      ConvertModal/LibAddMenu/PlSourcesEditor. */}
                  <span className="ci-icon" style={{ color: providerBrandColor(curProv) }}>
                    {providerLogo(curProv, 13) ?? <Ico name="note" width={11} height={11} />}
                  </span>{' '}
                  {t('lib.ctx.switchSrc')}
                  <Ico name="arrowRight" width={10} height={10} style={{ marginLeft: 'auto', opacity: 0.4, flexShrink: 0 }} />
                </div>
              )}

              {inLib && onEditTags && (
                <div
                  className="ci"
                  onMouseEnter={() => setSub2(null)}
                  onClick={() => {
                    onEditTags(track)
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
                onMouseEnter={() => setSub2(null)}
                onClick={() => {
                  openTrackInfo(track)
                  onClose()
                }}
              >
                <span className="ci-icon">
                  <Ico name="info" width={12} height={12} />
                </span>{' '}
                {t('lib.ctx.trackInfo')}
              </div>
            </>
          )}

          {/* ── Подменю «Скачать»: скачать файл на диск / слушать офлайн (тоггл). ── */}
          {sub === 'dl' && (
            <>
              <div
                className="ci"
                onClick={() => {
                  onClose()
                  void downloadTrack(track)
                }}
              >
                <span className="ci-icon">
                  <Ico name="download" width={12} height={12} />
                </span>{' '}
                {t('player.dl.track')}
              </div>
              {/* Обложка — как в попапе кнопки скачивания в плеере (DlMenu).
                  Прячем без обложки: downloadCover на пустом src молча выходит. */}
              {!!track.cover && (
                <div
                  className="ci"
                  onClick={() => {
                    onClose()
                    void downloadCover(track, null)
                  }}
                >
                  <span className="ci-icon">
                    <Ico name="gallery" width={13} height={13} />
                  </span>{' '}
                  {t('player.dl.cover')}
                </div>
              )}
              <div
                className="ci"
                onClick={() => {
                  onClose()
                  toggleTrackOffline(track)
                }}
              >
                <span className="ci-icon" style={isOffline ? { color: 'var(--accent)' } : undefined}>
                  <Ico name={isOffline ? 'check' : 'save'} width={12} height={12} />
                </span>{' '}
                {isOffline ? t('lib.ctx.removeOffline') : t('lib.ctx.downloadOffline')}
              </div>
            </>
          )}
        </div>
      )}

      {/* Второй уровень: список площадок справа от «Сменить площадку» внутри
          флайаута «Ещё». Текущая помечена галочкой, остальные ищут трек там и
          ПЕРСИСТЕНТНО заменяют им библиотечную запись (switchTrackPlatform). */}
      {sub === 'more' && sub2 === 'src' && (
        <div
          ref={flyout2Ref}
          id="cxPlFlyout"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          style={{
            display: 'block',
            left: flyout2Pos?.left ?? -9999,
            top: flyout2Pos?.top ?? -9999,
            visibility: flyout2Pos ? 'visible' : 'hidden',
          }}
        >
          {netProviders.map((p) => {
            const active = p.id === curProv
            return (
              <div
                key={p.id}
                className={active ? 'ci ci-active' : 'ci'}
                onClick={() => {
                  if (active) return
                  onClose()
                  void switchTrackPlatform(track, p.id)
                }}
              >
                <span
                  className="ci-icon"
                  style={{ background: 'transparent', color: providerBrandColor(p.id) }}
                >
                  {providerLogo(p.id, 15)}
                </span>{' '}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.label}
                </span>
                {active && (
                  <Ico name="check" width={13} height={13} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </>,
    document.body,
  )
}
