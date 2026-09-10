import { useEffect } from 'react'
import { invoke } from '@shared/tauri'
import { useTauriEvent } from '@shared/hooks'
import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { artistSourceFromId } from '@entities/artist'
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
 *   - `artist`   → DetailView артиста (площадка из id, см. entityFromShareId)
 *   - `playlist` → DetailView плейлиста
 *   - `album`    → DetailView альбома (тот же id, kind=album)
 *
 * Параметры (scId/id/permalink/title/artist/cover) кладёт https-лендинг шаринга,
 * редиректящий на bloom:// (`bloom://artist?' + p.toString()` — параметры идут
 * насквозь, лендинг их не разбирает). Hero рисуется из них мгновенно; содержимое
 * догружает провайдер внутри DetailView.
 *
 * Ветка `play` пока только SoundCloud: она конструирует SC-трек вручную, а не
 * резолвит его провайдером. UI это учитывает — пункт «Поделиться» у треков
 * других площадок не показывается (TrackCtxMenu, hasShare).
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

/**
 * Сущность из параметра `id` share-ссылки.
 *
 * Новый формат — сквозной entity id целиком (`ym_artist_55`, `ytm_artist_UC…`,
 * `sc_pl_789`): площадка берётся из префикса, id уходит в DetailView как есть.
 * Собрать её из числа нельзя — у YM-плейлистов id составной, у YTM вообще не
 * числовой, поэтому раньше любая не-SC ссылка открывалась в SC-провайдере и
 * упиралась в «не найдено».
 *
 * Старый формат — голое число SoundCloud (`123456`) плюс ссылки версий, где
 * сюда попадал id с частично срезанным префиксом (`artist_123456`): и то и
 * другое трактуем как SoundCloud, иначе разосланные ссылки перестали бы работать.
 */
const entityFromShareId = (
  raw: string,
  kind: 'artist' | 'playlist',
): { providerId: string; id: string } | null => {
  if (!raw) return null
  // artistSourceFromId — чисто префиксный маппинг, для плейлистов он тот же.
  if (/^(sc|ym|ytm)_/.test(raw)) return { providerId: artistSourceFromId(raw), id: raw }
  const num = /(\d+)$/.exec(raw)?.[1]
  if (!num) return null
  return { providerId: 'soundcloud', id: kind === 'artist' ? `sc_artist_${num}` : `sc_pl_${num}` }
}

/**
 * Заглушка трека из параметров share-ссылки — по ней рисуется карточка модалки,
 * пока `DeepLinkModal` не дотянет полный трек через провайдера.
 *
 * Платформенные поля (`_ym`+`ymTrackId`, `_ytm`+`ytmVideoId`, `_sc`+`scId`)
 * заполняем сразу: без них резолверы стрима отказываются работать, и «Воспроизвести»,
 * нажатое до прихода полного трека, ничего бы не сыграло.
 *
 * SoundCloud-ветка сохраняет старый формат ссылки (голое число в `id`) и путь
 * «одного permalink», где числового id может не быть вовсе.
 */
const linkTrackFromShare = (
  rawId: string,
  permalink: string,
  meta: { title: string; artist: string; cover: string },
): Track | null => {
  // temp-флаг у каждой площадки свой (`_scTemp`/`_ymTemp`/`_ytmTemp`), общего нет.
  const base = {
    name: meta.title,
    artist: meta.artist,
    dur: '—',
    cover: meta.cover || null,
    genres: [],
    year: '',
  }

  const ym = /^ym_(\d+)$/.exec(rawId)
  if (ym) return { ...base, id: rawId, _ym: true, _ymTemp: true, ymTrackId: ym[1]! }

  // У YTM id трека — videoId без числового формата; artist/album/pl отсекаем,
  // это не треки (схема id — parseYtmTrackId в ytmusic/model/mappers).
  if (rawId.startsWith('ytm_') && !/^ytm_(artist|album|pl)_/.test(rawId))
    return { ...base, id: rawId, _ytm: true, _ytmTemp: true, ytmVideoId: rawId.slice('ytm_'.length) }

  // SoundCloud: `sc_<число>` (новый формат) либо голое число (старые ссылки).
  // Мусорный/пустой id не годится: Number('') === 0 пролезал бы дальше как
  // «валидный» и уводил резолвер стрима в sc_track_by_id(0).
  const scNum = /^(?:sc_)?(\d+)$/.exec(rawId)?.[1]
  const scId = scNum && Number(scNum) > 0 ? Number(scNum) : null
  if (!scId && !permalink) return null
  return {
    ...base,
    id: scId ? `sc_${scId}` : `sc_tmp_${permalink}`,
    _sc: true,
    _scTemp: true,
    scId: scId ?? undefined,
    scTrackId: scId ?? undefined,
    scPermalink: permalink || null,
    scMedia: null,
  }
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
    // Сквозной entity id лендинг шаринга (bloom-link/share) кладёт в `id` — он
    // гонит параметры карточки в bloom:// как есть, а строит их `buildShareUrl`.
    // `scId` держим алиасом (ссылки, собранные вручную, и старые карточки).
    const rawId = p.get('scId') || p.get('id') || ''
    const permalink = p.get('permalink') || ''
    const title = p.get('title') || '' // фолбэк-подпись рисует сама модалка
    const artist = p.get('artist') || ''
    const cover = p.get('cover') || ''

    const track = linkTrackFromShare(rawId, permalink, { title, artist, cover })
    if (!track) return
    // Регистрируем как эфемерный — модалка/плеер резолвят по id.
    trackRegistry.put(track, { temp: true })
    useBigPicStore.getState().closeBig()
    useDeepLinkStore.getState().openTrack(track)
    return
  }

  if (host === 'artist') {
    const name = p.get('name') || ''
    const permalink = p.get('permalink') || ''
    const cover = p.get('cover') || ''
    const ent = entityFromShareId(p.get('id') || '', 'artist')
    // Ни сущности, ни permalink — открывать нечего (SC-артист без числового id
    // приходит именно permalink'ом: `sc_artist_p_<url>`).
    if (!ent && !permalink) return
    useBigPicStore.getState().closeBig()
    useDetailStore.getState().open({
      kind: 'artist',
      providerId: ent?.providerId ?? 'soundcloud',
      id: ent?.id ?? `sc_artist_p_${permalink}`,
      title: name,
      cover: cover || null,
      round: true,
    })
    return
  }

  if (host === 'playlist' || host === 'album') {
    const title = p.get('title') || ''
    const artist = p.get('artist') || ''
    const cover = p.get('cover') || ''
    const ent = entityFromShareId(p.get('id') || '', 'playlist')
    if (!ent) return
    useBigPicStore.getState().closeBig()
    useDetailStore.getState().open({
      kind: host === 'album' ? 'album' : 'playlist',
      providerId: ent.providerId,
      id: ent.id,
      title,
      subtitle: artist || undefined,
      cover: cover || null,
      round: false,
    })
  }
}
