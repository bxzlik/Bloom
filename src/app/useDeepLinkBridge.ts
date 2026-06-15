import { useEffect } from 'react'
import { invoke } from '@shared/tauri'
import { useTauriEvent } from '@shared/hooks'
import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { useDeepLinkStore } from '@features/library'
import { useDetailStore } from '@features/search'
import { useBigPicStore } from '@features/player'

/**
 * Обработчик deep-link `bloom://…` `handleBloomDeepLink`
 *.
 *
 * Rust-бэкенд готов: эмитит событие `bloom-deeplink` (lib.rs on_open_url +
 * single-instance argv → pipe.rs) и хранит «холодную» ссылку запуска под
 * `get_pending_deep_link` (приложение стартануло по клику на bloom://).
 *
 * Маршрутизация по host:
 *   - `play`     → модалка выбора действия над треком (useDeepLinkStore + DeepLinkModal)
 *   - `artist`   → DetailView артиста (sc_artist_<id>)
 *   - `playlist` → DetailView плейлиста (sc_pl_<id>)
 *   - `album`    → DetailView альбома (sc_pl_<id>, kind=album)
 *
 * Параметры (scId/id/permalink/title/artist/cover) кладёт https-лендинг шаринга,
 * редиректящий на bloom://. Hero рисуется из них мгновенно; треки догружаются
 * провайдером по scId внутри DetailView.
 */
export const useDeepLinkBridge = () => {
  useTauriEvent('bloom-deeplink', (url) => {
    if (typeof url === 'string') handleDeepLink(url)
  })

  // «Холодный» запуск по ссылке — забираем отложенный URL после монтирования.
  useEffect(() => {
    void invoke<string | null>('get_pending_deep_link')
      .then((url) => {
        if (url) handleDeepLink(url)
      })
      .catch(() => {})
  }, [])
}

const handleDeepLink = (urlStr: string): void => {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    return
  }
  const host = url.hostname
  const p = url.searchParams

  if (host === 'play') {
    const scId = p.get('scId') || ''
    const permalink = p.get('permalink') || ''
    const title = p.get('title') || 'SC Track'
    const artist = p.get('artist') || ''
    const cover = p.get('cover') || ''
    if (!scId && !permalink) return

    const scIdNum = Number(scId)
    const track: Track = {
      id: scId ? `sc_${scId}` : `sc_tmp_${permalink}`,
      name: title,
      artist,
      dur: '—',
      cover: cover || null,
      genres: [],
      year: '',
      _sc: true,
      _scTemp: true,
      scId: Number.isFinite(scIdNum) && scId ? scIdNum : scId,
      scTrackId: Number.isFinite(scIdNum) && scId ? scIdNum : scId,
      scPermalink: permalink || null,
      scMedia: null,
    }
    // Регистрируем как эфемерный — модалка/плеер резолвят по id.
    trackRegistry.put(track, { temp: true })
    useBigPicStore.getState().closeBig()
    useDeepLinkStore.getState().openTrack(track)
    return
  }

  if (host === 'artist') {
    const id = p.get('id') || ''
    const name = p.get('name') || ''
    const permalink = p.get('permalink') || ''
    const cover = p.get('cover') || ''
    if (!id && !permalink) return
    useBigPicStore.getState().closeBig()
    useDetailStore.getState().open({
      kind: 'artist',
      providerId: 'soundcloud',
      id: id ? `sc_artist_${id}` : `sc_artist_p_${permalink}`,
      title: name,
      cover: cover || null,
      round: true,
    })
    return
  }

  if (host === 'playlist' || host === 'album') {
    const id = p.get('id') || ''
    const title = p.get('title') || ''
    const artist = p.get('artist') || ''
    const cover = p.get('cover') || ''
    if (!id) return
    useBigPicStore.getState().closeBig()
    useDetailStore.getState().open({
      kind: host === 'album' ? 'album' : 'playlist',
      providerId: 'soundcloud',
      id: `sc_pl_${id}`,
      title,
      subtitle: artist || undefined,
      cover: cover || null,
      round: false,
    })
  }
}
