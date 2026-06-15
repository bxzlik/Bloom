import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { playFromSource, type PlaySource } from '@features/player'
import { useNavStore } from '@app/navigationStore'
import { toast } from '@shared/ui'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { trackRegistry } from '@entities/track'
import { useDeepLinkStore } from '../model/deepLinkStore'
import { useFavStore } from '../model/favStore'
import { usePlaylistStore } from '../model/playlistStore'
import { saveTrackToLibrary } from '../lib/saveToLibrary'

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
    toast('✅ Добавлено в библиотеку')
    handleClose()
  }

  const onFav = () => {
    saveTrackToLibrary(track)
    toggleFav(track.id)
    toast('Добавлено в любимое')
    handleClose()
  }

  const onPickPlaylist = (plId: string, plName: string) => {
    saveTrackToLibrary(track)
    addTrackToPl(plId, track.id)
    toast(`Добавлено в «${plName}»`)
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ opacity: 0.3 }}>
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            )}
          </div>
          <div className="dlink-info">
            <div className="dlink-title" id="dlinkTitle">{track.name || 'SC Track'}</div>
            <div className="dlink-artist" id="dlinkArtist">{track.artist || ''}</div>
          </div>
          <button className="dlink-close-btn" onClick={handleClose} aria-label="Закрыть">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {!plView ? (
          <div className="dlink-actions" id="dlinkActions" style={{ display: 'block' }}>
            <div className="dlink-act" id="dlinkActPlay" onClick={onPlay}>
              <div className="dlink-act-icon">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
                </svg>
              </div>
              <span className="dlink-act-label">Воспроизвести</span>
            </div>
            <div className="dlink-sep" />
            <div className="dlink-act" id="dlinkActLib" onClick={onAddLib}>
              <div className="dlink-act-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <span className="dlink-act-label">В библиотеку</span>
            </div>
            <div className="dlink-act" id="dlinkActFav" onClick={onFav}>
              <div className="dlink-act-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
              </div>
              <span className="dlink-act-label">В любимое</span>
            </div>
            <div className="dlink-act" id="dlinkActPl" onClick={() => setPlView(true)}>
              <div className="dlink-act-icon">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <span className="dlink-act-label">В плейлист</span>
              <svg className="dlink-act-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>
        ) : (
          <div className="dlink-pl-list" id="dlinkPlList" style={{ display: 'block' }}>
            <div className="dlink-pl-header">
              <button className="dlink-pl-back-btn" id="dlinkPlBack" onClick={() => setPlView(false)} aria-label="Назад">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="dlink-pl-header-title">В плейлист</span>
            </div>
            <div className="dlink-pl-scroll">
              {playlists.length === 0 ? (
                <div className="dlink-pl-empty">Нет плейлистов</div>
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
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ opacity: 0.35 }}>
                          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                        </svg>
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
