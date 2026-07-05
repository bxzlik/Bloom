import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { playFromSource, type PlaySource } from '@features/player'
import { useNavStore } from '@app/navigationStore'
import { toast } from '@shared/ui'
import { PlCover } from './PlCover'
import { useT } from '@shared/i18n'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { trackRegistry } from '@entities/track'
import { useDeepLinkStore } from '../model/deepLinkStore'
import { useFavStore } from '../model/favStore'
import { usePlaylistStore } from '../model/playlistStore'
import { saveTrackToLibrary } from '../lib/saveToLibrary'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Модалка deep-link `bloom://play` `#dlinkModal`
 *.
 *
 * Открывается мостом `useDeepLinkBridge` через useDeepLinkStore.openTrack(track).
 * Действия над SC-треком из ссылки: Воспроизвести / В библиотеку / В любимое /
 * В плейлист (раскрывается во внутренний список плейлистов с кнопкой «назад»).
 *
 * fav/lib/playlist «промоутят» эфемерный трек в библиотеку (saveTrackToLibrary,
 * _scPromoteTemp) — иначе id не зарезолвится после закрытия модалки.
 *
 * CSS: `#dlinkMover`/`#dlinkModal`/`.dlink-*` (modals.css:98-154).
 */
export const DeepLinkModal = () => {
  const t = useT()
  const track = useDeepLinkStore((s) => s.track)
  const close = useDeepLinkStore((s) => s.close)
  const playlists = usePlaylistStore((s) => s.playlists)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const toggleFav = useFavStore((s) => s.toggleFav)

  const [opening, setOpening] = useState(false)
  const [plView, setPlView] = useState(false)

  useEffect(() => {
    if (!track) return
    setPlView(false)
    return runEnterAnimation(setOpening)
  }, [track?.id])

  useEffect(() => {
    if (!track) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id])

  const handleClose = () => {
    setOpening(false)
    setTimeout(() => close(), 260)
  }

  if (!track) return null

  const scSource: PlaySource = {
    kind: 'sc',
    label: track.artist || '',
    cover: track.cover ?? null,
    round: false,
  }

  const onPlay = () => {
    trackRegistry.put(track, { temp: true })
    playFromSource([track.id], scSource, track.id)
    useNavStore.getState().goNav('player')
    handleClose()
  }

  const onAddLib = () => {
    saveTrackToLibrary(track)
    toast('✅ ' + t('toast.addedToLib'))
    handleClose()
  }

  const onFav = () => {
    saveTrackToLibrary(track)
    toggleFav(track.id)
    toast(t('lib.deeplink.toast.fav'))
    handleClose()
  }

  const onPickPlaylist = (plId: string, plName: string) => {
    saveTrackToLibrary(track)
    addTrackToPl(plId, track.id)
    toast(t('lib.deeplink.toast.toPl', { name: plName }))
    handleClose()
  }

  return createPortal(
    <div
      id="dlinkMover"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div id="dlinkModal">
        <div className="dlink-head">
          <div className="dlink-cov" id="dlinkCov">
            {track.cover ? (
              <img src={track.cover} alt="" />
            ) : (
              <Ico name="note" width={20} height={20} style={{ opacity: 0.3 }} />
            )}
          </div>
          <div className="dlink-info">
            <div className="dlink-title" id="dlinkTitle">{track.name || 'SC Track'}</div>
            <div className="dlink-artist" id="dlinkArtist">{track.artist || ''}</div>
          </div>
          <button className="dlink-close-btn" onClick={handleClose} aria-label={t('common.close')}>
            <Ico name="close" width={12} height={12} />
          </button>
        </div>

        {!plView ? (
          <div className="dlink-actions" id="dlinkActions" style={{ display: 'block' }}>
            <div className="dlink-act" id="dlinkActPlay" onClick={onPlay}>
              <div className="dlink-act-icon">
                <Ico name="play" width={11} height={11} />
              </div>
              <span className="dlink-act-label">{t('lib.deeplink.play')}</span>
            </div>
            <div className="dlink-sep" />
            <div className="dlink-act" id="dlinkActLib" onClick={onAddLib}>
              <div className="dlink-act-icon">
                <Ico name="download" width={12} height={12} />
              </div>
              <span className="dlink-act-label">{t('lib.deeplink.toLib')}</span>
            </div>
            <div className="dlink-act" id="dlinkActFav" onClick={onFav}>
              <div className="dlink-act-icon">
                <Ico name="heart" width={13} height={13} />
              </div>
              <span className="dlink-act-label">{t('lib.deeplink.toFav')}</span>
            </div>
            <div className="dlink-act" id="dlinkActPl" onClick={() => setPlView(true)}>
              <div className="dlink-act-icon">
                <Ico name="note" width={11} height={11} />
              </div>
              <span className="dlink-act-label">{t('lib.deeplink.toPl')}</span>
              <Ico name="arrowRight" className="dlink-act-chevron" width={10} height={10} />
            </div>
          </div>
        ) : (
          <div className="dlink-pl-list" id="dlinkPlList" style={{ display: 'block' }}>
            <div className="dlink-pl-header">
              <button className="dlink-pl-back-btn" id="dlinkPlBack" onClick={() => setPlView(false)} aria-label={t('common.back')}>
                <Ico name="arrowLeft" width={10} height={10} />
              </button>
              <span className="dlink-pl-header-title">{t('lib.deeplink.toPl')}</span>
            </div>
            <div className="dlink-pl-scroll">
              {playlists.length === 0 ? (
                <div className="dlink-pl-empty">{t('lib.deeplink.noPlaylists')}</div>
              ) : (
                playlists.map((pl) => (
                  <div
                    key={pl.id}
                    className="dlink-pl-item"
                    onClick={() => onPickPlaylist(pl.id, pl.name)}
                  >
                    <div className="dlink-pl-item-cov">
                      {pl.cover ? (
                        <img src={pl.cover} alt="" />
                      ) : (
                        <PlCover trs={pl.trs} seed={pl.id} />
                      )}
                    </div>
                    <span className="dlink-pl-item-name">{pl.name}</span>
                    <span className="dlink-pl-item-count">{pl.trs.length}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
