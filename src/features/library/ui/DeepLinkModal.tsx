import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { playFromSource, resolvePlayableUrl, trackProviderId, type PlaySource } from '@features/player'
import { getProvider } from '@features/providers'
import type { Track } from '@entities/track'
import { useNavStore } from '@app/navigationStore'
import { toast, EmptyCover } from '@shared/ui'
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
 * Чрома как у прочих модалок: без внешней рамки, z-index ниже оконного
 * тайтлбара (#winTitlebar z1001) — кнопки окна и перетаскивание остаются
 * доступны; закрывают широкой кнопкой в футере (`.dlink-foot`), крестика в
 * шапке нет.
 *
 * CSS: `#dlinkMover`/`#dlinkModal`/`.dlink-*` (modals.css).
 */

/**
 * Дотянуть полный трек площадки по данным ссылки.
 *
 * Из deep-link приходит заглушка, собранная из query-параметров: ни длительности
 * и метаданных, ни `scMedia`. Без этого «Воспроизвести» шло по холодной цепочке
 * (полный трек по id → signed-URL → и только потом сам поток), а в библиотеку
 * сохранялся обрезок без длительности и альбома.
 *
 * Площадка берётся из самого трека (`trackProviderId` по флагам `_sc`/`_ym`/`_ytm`,
 * их проставил мост по префиксу id) — резолв по id умеют все три провайдера.
 * Ссылка с одним permalink (SC без числового id) идёт через `resolveUrl`
 * (/resolve): там и id окажется настоящим, а не `sc_tmp_<permalink>`.
 */
const enrichLinkTrack = async (t: Track): Promise<Track | null> => {
  const prov = getProvider(trackProviderId(t))
  if (!prov) return null
  try {
    if (prov.resolveTrackById) {
      const full = await prov.resolveTrackById(t.id)
      if (full) return full
    }
    if (t.scPermalink && prov.resolveUrl) {
      const r = await prov.resolveUrl(t.scPermalink)
      return r?.type === 'track' ? r.track : null
    }
  } catch (e) {
    console.warn('[deeplink] enrich failed', e)
  }
  return null
}

export const DeepLinkModal = () => {
  const t = useT()
  const linkTrack = useDeepLinkStore((s) => s.track)
  const close = useDeepLinkStore((s) => s.close)
  // Полный трек, догруженный по ссылке; до его прихода работаем с заглушкой.
  // Ветку `linkTrack ?` не свернуть в `full ?? linkTrack`: после close() стор
  // обнуляется, а `full` — нет, и модалка осталась бы висеть смонтированной.
  const [full, setFull] = useState<Track | null>(null)
  const track = linkTrack ? full ?? linkTrack : null
  const playlists = usePlaylistStore((s) => s.playlists)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const toggleFav = useFavStore((s) => s.toggleFav)

  const [opening, setOpening] = useState(false)
  const [plView, setPlView] = useState(false)

  // Открытие: enter-анимация + догрузка полного трека и прогрев стрима. Пока
  // пользователь читает карточку, signed-URL успевает лечь в кеш площадки
  // (streamCache, TTL 4 мин) — «Воспроизвести» стартует почти мгновенно.
  useEffect(() => {
    if (!linkTrack) return
    setPlView(false)
    setFull(null)
    let cancelled = false
    void enrichLinkTrack(linkTrack).then((t) => {
      if (cancelled || !t) return
      setFull(t)
      void resolvePlayableUrl(t).catch(() => {})
    })
    const stopAnim = runEnterAnimation(setOpening)
    return () => {
      cancelled = true
      stopAnim()
    }
  }, [linkTrack?.id])

  // Ключ — id ссылки, а не показанного трека: догрузка полного трека меняет id
  // (sc_tmp_<permalink> → sc_<id>), перевешивать слушатель из-за этого незачем.
  useEffect(() => {
    if (!linkTrack) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkTrack?.id])

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
              <EmptyCover />
            )}
          </div>
          <div className="dlink-info">
            <div className="dlink-title" id="dlinkTitle">{track.name || t('lib.deeplink.untitled')}</div>
            <div className="dlink-artist" id="dlinkArtist">{track.artist || ''}</div>
          </div>
        </div>

        {!plView ? (
          <div className="dlink-actions" id="dlinkActions" style={{ display: 'block' }}>
            <div className="dlink-act" id="dlinkActPlay" onClick={onPlay}>
              <div className="dlink-act-icon">
                <Ico name="play" width={18} height={18} />
              </div>
              <span className="dlink-act-label">{t('lib.deeplink.play')}</span>
            </div>
            <div className="dlink-sep" />
            <div className="dlink-act" id="dlinkActLib" onClick={onAddLib}>
              <div className="dlink-act-icon">
                <Ico name="download" width={18} height={18} />
              </div>
              <span className="dlink-act-label">{t('lib.deeplink.toLib')}</span>
            </div>
            <div className="dlink-act" id="dlinkActFav" onClick={onFav}>
              <div className="dlink-act-icon">
                <Ico name="heart" width={18} height={18} />
              </div>
              <span className="dlink-act-label">{t('lib.deeplink.toFav')}</span>
            </div>
            <div className="dlink-act" id="dlinkActPl" onClick={() => setPlView(true)}>
              <div className="dlink-act-icon">
                <Ico name="note" width={18} height={18} />
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
                        <PlCover trs={pl.trs} />
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

        <div className="dlink-foot">
          <button className="stats-tool-btn" onClick={handleClose}>
            <Ico name="close" width={13} height={13} />
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
