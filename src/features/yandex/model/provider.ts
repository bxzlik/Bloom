import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { t as i18nT } from '@shared/i18n'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import type { MusicProvider, SearchResults, ArtistPageData, ResolvedUrl } from '@features/providers'
import type { PlayableSource } from '@features/player'
import {
  ymSearch,
  ymAlbum,
  ymArtist,
  ymPlaylist,
  ymPlaylistUuid,
  ymResolve,
  ymStreamUrl,
  ymProxyUrl,
} from '../api/ymClient'
import { useYmAuthStore } from './authStore'
import {
  toTrack,
  toArtist,
  toAlbum,
  toPlaylist,
  ymArtistId,
  ymAlbumId,
  ymPlaylistId,
  ymPlaylistUuidId,
  parseYmPlaylistId,
  parseYmPlaylistUuidId,
} from './mappers'

/**
 * Провайдер Яндекс.Музыки. Реализует контракт `MusicProvider` — весь UX (поиск,
 * страницы, плеер) общий и о Яндексе не знает. Сеть делает Rust (CORS), здесь —
 * только маппинг raw→entities + раскладка по контракту. Зеркало `scProvider`.
 *
 * `isEnabled` гейтит провайдера по логину: до авторизации Яндекс не появляется
 * ни в дропдауне источника, ни в «Все источники».
 */
/** Внутренний пейджер пагинации треков (YM-страницы 0-индексные, ~24 на страницу). */
let _pager: { query: string; page: number } | null = null

export const ymProvider: MusicProvider = {
  id: 'yandex',
  label: i18nT('settings.nav.yandex'),

  isEnabled: () => useYmAuthStore.getState().authed,

  async search(query): Promise<Partial<SearchResults>> {
    // Сбрасываем внутренний пейджер: следующий loadMoreTracks начнёт со страницы 1.
    // (Свой счётчик, т.к. общий стор считает offset шагами по 12 — под размер
    // страницы SC; у YM страница ~24, маппинг offset→page разъехался бы.)
    _pager = { query, page: 0 }
    const d = await ymSearch(query, 0)
    const tracks = (d.tracks ?? []).map(toTrack)
    const artists: Artist[] = (d.artists ?? []).map(toArtist)
    const albums: Playlist[] = (d.albums ?? []).map(toAlbum)
    const playlists: Playlist[] = (d.playlists ?? []).map(toPlaylist)

    // Кладём треки в реестр — иначе плеер (очередь по id) их не найдёт.
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    prefetchStreams(tracks)

    // YM-поиск отдаёт страницами по ~24; есть ещё, если пришла полная страница.
    return { tracks, artists, albums, playlists, tracksHasMore: tracks.length >= 20 }
  },

  async loadMoreTracks(query): Promise<{ tracks: Track[]; hasMore: boolean }> {
    // Игнорируем offset из общего стора (он SC-калибра, шаг 12); ведём свой
    // 0-индексный пейджер страниц YM. Рассинхрон query → начинаем заново.
    if (!_pager || _pager.query !== query) _pager = { query, page: 0 }
    _pager.page += 1
    const d = await ymSearch(query, _pager.page)
    const tracks = (d.tracks ?? []).map(toTrack)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    return { tracks, hasMore: tracks.length >= 20 }
  },

  async resolveUrl(url): Promise<ResolvedUrl | null> {
    if (!/music\.yandex\.[a-z]+/i.test(url)) return null
    const r = await ymResolve(url)
    if (r.kind === 'track') {
      const track = toTrack(r.track)
      trackRegistry.put([track], { temp: true })
      return { type: 'track', track }
    }
    // Сущность пришла с треками, но без своего id — id берём из самой ссылки,
    // чтобы DetailView мог дозагрузить страницу (getAlbum/getArtist/getPlaylist).
    if (r.kind === 'album') {
      const id = matchId(url, /\/album\/(\d+)/)
      if (!id) return null
      const playlist: Playlist = {
        id: ymAlbumId(id),
        title: r.entity.title,
        cover: r.entity.cover || null,
        ownerName: r.entity.subtitle,
        trackCount: r.entity.tracks?.length ?? 0,
        source: 'yandex',
      }
      return { type: 'album', playlist }
    }
    if (r.kind === 'artist') {
      const id = matchId(url, /\/artist\/(\d+)/)
      if (!id) return null
      const artist: Artist = {
        id: ymArtistId(id),
        name: r.entity.title,
        avatar: r.entity.cover || null,
        source: 'yandex',
      }
      return { type: 'artist', artist }
    }
    // playlist: старый /users/<owner>/playlists/<kind> ИЛИ новый /playlists/<id>
    // (id = uuid или префиксный вроде `lk.<uuid>` — «Мне нравится»; берём целиком).
    const m = /\/users\/([^/?#]+)\/playlists\/(\d+)/.exec(url)
    const uuid = m ? null : (/\/playlists\/([0-9A-Za-z.-]+)/.exec(url)?.[1] ?? null)
    if (!m && !uuid) return null
    const playlist: Playlist = {
      id: m ? ymPlaylistId(m[1]!, m[2]!) : ymPlaylistUuidId(uuid!),
      title: r.entity.title,
      cover: r.entity.cover || null,
      ownerName: r.entity.subtitle,
      trackCount: r.entity.tracks?.length ?? 0,
      source: 'yandex',
    }
    return { type: 'playlist', playlist }
  },

  async resolveTrackById(id): Promise<Track | null> {
    const m = /^ym_(\d+)$/.exec(id)
    if (!m) return null
    // Своей команды «трек по id» нет — резолвим через ссылку (Rust matchает /track/<id>).
    const r = await ymResolve(`https://music.yandex.ru/track/${m[1]}`).catch(() => null)
    if (!r || r.kind !== 'track') return null
    const track = toTrack(r.track)
    trackRegistry.put([track], { temp: true })
    return track
  },

  async resolveArtistByName(name): Promise<{ id: string; title: string; cover?: string | null } | null> {
    // YM-треки несут artistId → клик идёт по directId, сюда обычно не попадаем.
    // Фолбэк по имени — поиск, берём точное совпадение либо первого.
    const d = await ymSearch(name, 0)
    const items = d.artists ?? []
    if (!items.length) return null
    const nl = name.toLowerCase()
    const raw = items.find((a) => (a.name || '').toLowerCase() === nl) ?? items[0]!
    const a = toArtist(raw)
    return { id: a.id, title: a.name, cover: a.avatar ?? null }
  },

  async getArtist(id): Promise<ArtistPageData> {
    const m = /^ym_artist_(\d+)$/.exec(id)
    if (!m) throw new Error(i18nT('search.err.artistNotFound'))
    const e = await ymArtist(m[1]!)
    // «Популярные» — из brief-info (popularTracks); «Треки» — вся дискография
    // (e.tracks из /artists/{id}/tracks). с раскладкой SoundCloud.
    const topTracks = (e.popularTracks ?? []).map(toTrack)
    const tracks = (e.tracks ?? []).map(toTrack)
    const albums: Playlist[] = (e.albums ?? []).map(toAlbum)
    const reg = [...topTracks, ...tracks]
    if (reg.length) trackRegistry.put(reg, { temp: true })
    const artist: Artist = {
      id,
      name: e.title || i18nT('ym.fallback.artist'),
      source: 'yandex',
      avatar: e.cover || null,
    }
    return { artist, topTracks, tracks, albums, playlists: [] }
  },

  async getAlbum(id): Promise<{ album: Playlist; tracks: Track[] }> {
    const m = /^ym_album_(\d+)$/.exec(id)
    if (!m) throw new Error(i18nT('search.err.albumNotFound'))
    const e = await ymAlbum(m[1]!)
    const tracks = (e.tracks ?? []).map(toTrack)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    const album: Playlist = {
      id,
      title: e.title || i18nT('ym.fallback.album'),
      cover: e.cover || null,
      ownerName: e.subtitle,
      trackCount: tracks.length,
      source: 'yandex',
      sourceUrl: `https://music.yandex.ru/album/${m[1]}`,
    }
    return { album, tracks }
  },

  async getPlaylist(id): Promise<{ playlist: Playlist; tracks: Track[] }> {
    const uuid = parseYmPlaylistUuidId(id)
    const parsed = uuid ? null : parseYmPlaylistId(id)
    if (!uuid && !parsed) throw new Error(i18nT('search.err.playlistNotFound'))
    const e = uuid ? await ymPlaylistUuid(uuid) : await ymPlaylist(parsed!.owner, parsed!.kind)
    const tracks = (e.tracks ?? []).map(toTrack)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    const playlist: Playlist = {
      id,
      title: e.title || i18nT('ym.fallback.playlist'),
      cover: e.cover || null,
      ownerName: e.subtitle,
      trackCount: tracks.length,
      source: 'yandex',
      sourceUrl: uuid
        ? `https://music.yandex.ru/playlists/${uuid}`
        : `https://music.yandex.ru/users/${parsed!.owner}/playlists/${parsed!.kind}`,
    }
    return { playlist, tracks }
  },
}

const matchId = (url: string, re: RegExp): string | null => re.exec(url)?.[1] ?? null

/* ── Стрим ─────────────────────────────────────────────────────────────── */

/** Кеш проксированных URL стрима (подписанная ссылка живёт минуты — держим 4). */
const streamCache = new Map<string, { src: PlayableSource; at: number }>()
const STREAM_TTL = 4 * 60 * 1000

/**
 * Резолвер стрима YM для плеера (регистрируется через `registerSourceResolver`).
 * Возвращает null, если трек не YM ИЛИ стрим недоступен (нет Плюса/регион) —
 * тогда плеер пропустит трек (skipUnplayable). SC-фолбэк по матчу пока не
 * переносим (см. MIGRATION «хвосты Яндекса»).
 */
export const ymResolveStream = async (t: Track): Promise<PlayableSource | null> => {
  if (!t._ym || !t.ymTrackId) return null
  const id = t.ymTrackId

  const cached = streamCache.get(id)
  if (cached && Date.now() - cached.at < STREAM_TTL) return cached.src

  try {
    const direct = await ymStreamUrl(id)
    // WebView2 не тянет CDN Яндекса напрямую (TLS/CORS) → локальный прокси.
    const url = await ymProxyUrl(direct)
    const src: PlayableSource = { url, hls: false }
    streamCache.set(id, { src, at: Date.now() })
    return src
  } catch {
    return null
  }
}

/**
 * Прогреть стримы первых треков выдачи (fire-and-forget) — кладёт проксированный
 * URL в `streamCache`, чтобы первый play был мгновенным. с духом SC-prefetch.
 */
let _prefetchBusy = false
const prefetchStreams = (tracks: Track[]): void => {
  if (_prefetchBusy) return
  const todo = tracks.filter((t) => t._ym && t.ymAvailable !== false).slice(0, 5)
  if (!todo.length) return
  _prefetchBusy = true
  void Promise.allSettled(todo.map((t) => ymResolveStream(t))).finally(() => {
    _prefetchBusy = false
  })
}
