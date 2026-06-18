import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { t as i18nT } from '@shared/i18n'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import type { MusicProvider, SearchResults, ArtistPageData, ResolvedUrl } from '@features/providers'
import type { PlayableSource } from '@features/player'
import {
  searchTracks,
  searchArtists,
  searchPlaylists,
  searchAlbums,
  getStreamUrl,
  getArtistData,
  getArtistTopTracks,
  getPlaylistTracks,
  getPlaylistById,
  getTrackById,
  getUser,
  getUserPlaylists,
  getUserLikes,
  resolveScUrl,
  type ScMedia,
  type ScRawArtist,
  type ScRawPlaylist,
} from '../api/scClient'
import { toTrack, toArtist, toPlaylist } from './mappers'

/**
 * Реестр SC-хэндлов: entity.id → как достать детальную страницу (scId числовой
 * для артиста, permalink для плейлиста/альбома). Заполняется при поиске и при
 * открытии артиста (его альбомы). Keyed by entity id.
 *
 * Контракт `getArtist/getAlbum/getPlaylist(id)` принимает только id сущности —
 * остальное берём отсюда (provider-internal, ядро об этом не знает).
 */
interface ScArtistHandle {
  kind: 'artist'
  scId: number
  permalink: string | null
  name: string
  artwork: string | null
  followers: number
}
interface ScPlaylistHandle {
  kind: 'playlist' | 'album'
  scId: number
  permalink: string | null
  title: string
  artwork: string | null
  ownerName: string
  trackCount: number
}
const scHandles = new Map<string, ScArtistHandle | ScPlaylistHandle>()

const putArtistHandle = (entityId: string, a: ScRawArtist): void => {
  scHandles.set(entityId, {
    kind: 'artist',
    scId: a.id,
    permalink: a.permalink ?? null,
    name: a.title || '',
    artwork: a.artwork ?? null,
    followers: a.followers || 0,
  })
}
const putPlaylistHandle = (
  entityId: string,
  p: ScRawPlaylist,
  kind: 'playlist' | 'album',
): void => {
  scHandles.set(entityId, {
    kind,
    scId: p.id,
    permalink: p.permalink ?? null,
    title: p.title || '',
    artwork: p.artwork ?? null,
    ownerName: p.artist || '',
    trackCount: p.trackCount || 0,
  })
}

/** Провайдер SoundCloud. Реализует контракт `MusicProvider`. */
export const scProvider: MusicProvider = {
  id: 'soundcloud',
  label: 'SoundCloud',

  async search(query, opts): Promise<Partial<SearchResults>> {
    const sort = opts?.sort ?? 'relevance'
    const [tr, ar, pl, al] = await Promise.allSettled([
      searchTracks(query, 12, 0, sort),
      searchArtists(query, 8),
      searchPlaylists(query, 6),
      searchAlbums(query, 6),
    ])
    const tracks = tr.status === 'fulfilled' ? tr.value.items.map(toTrack) : []

    const artists: Artist[] = []
    if (ar.status === 'fulfilled') {
      ar.value.items.forEach((raw) => {
        const a = toArtist(raw)
        putArtistHandle(a.id, raw)
        artists.push(a)
      })
    }
    const playlists: Playlist[] = []
    if (pl.status === 'fulfilled') {
      pl.value.items.forEach((raw) => {
        const p = toPlaylist(raw)
        putPlaylistHandle(p.id, raw, 'playlist')
        playlists.push(p)
      })
    }
    const albums: Playlist[] = []
    if (al.status === 'fulfilled') {
      al.value.items.forEach((raw) => {
        const p = toPlaylist(raw)
        putPlaylistHandle(p.id, raw, 'album')
        albums.push(p)
      })
    }

    // Кладём треки в реестр — иначе плеер (очередь по id) их не найдёт.
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    prefetchStreams(tracks) // прогреваем первые стримы (мгновенный play, _scPrefetchStreams)

    const tracksHasMore = tr.status === 'fulfilled' ? tr.value.hasMore : false
    return { tracks, artists, playlists, albums, tracksHasMore }
  },

  async loadMoreTracks(query, offset, opts): Promise<{ tracks: Track[]; hasMore: boolean }> {
    const page = await searchTracks(query, 12, offset, opts?.sort ?? 'relevance')
    const tracks = page.items.map(toTrack)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    return { tracks, hasMore: page.hasMore }
  },

  async resolveUrl(url): Promise<ResolvedUrl | null> {
    // Гард по домену (как ym-провайдер и старая ветка q.includes('soundcloud.com')):
    // чужую ссылку (напр. music.yandex.ru) сразу отдаём дальше по реестру, не гоняя
    // её через SC /resolve — иначе прокси-таймауты вешали бы резолв на ~12с.
    if (!/soundcloud\.com/i.test(url) && !/snd\.sc/i.test(url)) return null
    const r = await resolveScUrl(url)
    if (!r) return null
    if (r.kind === 'track') {
      const track = toTrack(r.track)
      trackRegistry.put([track], { temp: true })
      return { type: 'track', track }
    }
    if (r.kind === 'artist') {
      // Ссылка на профиль (/username) → hero + плейлисты + лайки.
      const artist = toArtist(r.artist)
      putArtistHandle(artist.id, r.artist) // чтобы «Треки» → getArtist нашёл по id
      const [userR, plsR, likesR] = await Promise.allSettled([
        getUser(r.artist.id),
        getUserPlaylists(r.artist.id),
        getUserLikes(r.artist.id),
      ])
      const user = userR.status === 'fulfilled' ? userR.value : null
      const rawPls = plsR.status === 'fulfilled' ? plsR.value : []
      const rawLikes = likesR.status === 'fulfilled' ? likesR.value : []
      const playlists = rawPls.map((raw) => {
        const p = toPlaylist(raw)
        putPlaylistHandle(p.id, raw, 'playlist')
        return p
      })
      const likes = rawLikes.map(toTrack)
      if (likes.length) trackRegistry.put(likes, { temp: true })
      const enriched: Artist = {
        ...artist,
        avatar: user?.avatar ?? artist.avatar,
        followers: user?.followers ?? artist.followers,
        fullName: user?.fullName || r.artist.artist || '',
        description: user?.description || '',
        bannerUrl: user?.banner ?? null,
      }
      return { type: 'profile', profile: { artist: enriched, playlists, likes } }
    }
    // playlist | album
    const playlist = toPlaylist(r.playlist)
    putPlaylistHandle(playlist.id, r.playlist, r.kind)
    return { type: r.kind, playlist }
  },

  async resolveArtistByName(name, hint): Promise<{ id: string; title: string; cover?: string | null } | null> {
    // Точный scId (одиночный артист) — регистрируем хэндл, DetailView дотянет аватар/треки.
    if (hint?.scId != null) {
      const id = `sc_artist_${hint.scId}`
      putArtistHandle(id, {
        id: hint.scId,
        title: name,
        artist: '',
        artwork: null,
        followers: 0,
        permalink: hint.permalink ?? undefined,
      })
      return { id, title: name, cover: null }
    }
    // Только permalink — id на его основе (scId=0 → getArtist возьмёт permalink).
    if (hint?.permalink) {
      const id = `sc_artist_p_${hint.permalink}`
      putArtistHandle(id, { id: 0, title: name, artist: '', artwork: null, followers: 0, permalink: hint.permalink })
      return { id, title: name, cover: null }
    }
    // Иначе — поиск по имени, берём точное совпадение либо первого.
    const page = await searchArtists(name, 8)
    if (!page.items.length) return null
    const nl = name.toLowerCase()
    const raw = page.items.find((a) => (a.title || '').toLowerCase() === nl) ?? page.items[0]!
    const a = toArtist(raw)
    putArtistHandle(a.id, raw)
    return { id: a.id, title: a.name, cover: a.avatar ?? null }
  },

  async resolveTrackById(id): Promise<Track | null> {
    const m = /^sc_(\d+)$/.exec(id)
    if (!m) return null
    const raw = await getTrackById(Number(m[1]))
    if (!raw) return null
    const track = toTrack(raw)
    trackRegistry.put([track], { temp: true })
    return track
  },

  async getArtist(id): Promise<ArtistPageData> {
    // Хэндл может отсутствовать (открытие из «недавних» после рестарта) —
    // восстанавливаем ref из самого id: `sc_artist_<scId>` или `sc_artist_p_<permalink>`.
    const h = scHandles.get(id)
    let ref: number | string = ''
    let hintName = ''
    if (h && h.kind === 'artist') {
      ref = h.scId || h.permalink || ''
      hintName = h.name
    } else {
      const mId = /^sc_artist_(\d+)$/.exec(id)
      const mP = /^sc_artist_p_(.+)$/.exec(id)
      if (mId) ref = Number(mId[1])
      else if (mP) ref = mP[1]!
      else throw new Error(i18nT('search.err.artistNotFound'))
    }

    const [dataR, userR, topR] = await Promise.allSettled([
      getArtistData(ref, hintName),
      getUser(ref),
      getArtistTopTracks(ref, hintName),
    ])
    const { tracks: rawTracks, albums: rawAlbums } =
      dataR.status === 'fulfilled' ? dataR.value : { tracks: [], albums: [] }
    const user = userR.status === 'fulfilled' ? userR.value : null
    const rawTop = topR.status === 'fulfilled' ? topR.value : []

    const tracks = rawTracks.map(toTrack)
    const topTracks = rawTop.map(toTrack)
    const albums: Playlist[] = rawAlbums.map((raw) => {
      const p = toPlaylist(raw)
      putPlaylistHandle(p.id, raw, 'album')
      return p
    })

    if (tracks.length || topTracks.length)
      trackRegistry.put([...topTracks, ...tracks], { temp: true })

    const artist: Artist = {
      id,
      name: user?.username || hintName || '',
      source: 'soundcloud',
      avatar: user?.avatar ?? (h && h.kind === 'artist' ? h.artwork : null),
      followers: user?.followers ?? (h && h.kind === 'artist' ? h.followers : undefined),
      fullName: user?.fullName || '',
      description: user?.description || '',
      website: user?.website ?? null,
      bannerUrl: user?.banner ?? null,
    }

    return { artist, topTracks, tracks, albums, playlists: [] }
  },

  async getAlbum(id): Promise<{ album: Playlist; tracks: Track[] }> {
    const { playlist, tracks } = await loadScPlaylist(id)
    return { album: playlist, tracks }
  },

  async getPlaylist(id): Promise<{ playlist: Playlist; tracks: Track[] }> {
    return loadScPlaylist(id)
  },
}

/**
 * Резолв альбома/плейлиста по entity id. Если есть хэндл с permalink — резолвим
 * по нему; иначе (открытие из «недавних» после рестарта) парсим scId из
 * `sc_pl_<scId>` и тянем по id (`getPlaylistById`).
 */
const loadScPlaylist = async (
  id: string,
): Promise<{ playlist: Playlist; tracks: Track[] }> => {
  const h = scHandles.get(id)
  const permalink = h && h.kind !== 'artist' ? h.permalink : null

  let raw: Awaited<ReturnType<typeof getPlaylistTracks>>
  let meta: { title: string; cover: string | null; ownerName: string; trackCount: number } | null = null
  if (permalink) {
    raw = await getPlaylistTracks(permalink)
  } else {
    const m = /^sc_pl_(\d+)$/.exec(id)
    if (!m) throw new Error(i18nT('search.err.playlistNotFound'))
    const full = await getPlaylistById(Number(m[1]))
    raw = full.tracks
    meta = { title: full.title, cover: full.cover, ownerName: full.ownerName, trackCount: full.trackCount }
  }

  const tracks = raw.map(toTrack)
  if (tracks.length) trackRegistry.put(tracks, { temp: true })

  const hp = h && h.kind !== 'artist' ? h : null
  const playlist: Playlist = {
    id,
    title: hp?.title || meta?.title || '',
    cover: hp?.artwork ?? meta?.cover ?? null,
    ownerName: hp?.ownerName || meta?.ownerName || '',
    trackCount: tracks.length || hp?.trackCount || meta?.trackCount || 0,
    source: 'soundcloud',
    // permalink для «Обновить треки» (доступен из handle; при открытии по id — нет).
    sourceUrl: permalink ?? null,
  }
  return { playlist, tracks }
}

/** Кеш signed-URL стрима (SC URL живёт ~5 мин — держим 4). */
const streamCache = new Map<number, { src: PlayableSource; at: number }>()
const STREAM_TTL = 4 * 60 * 1000

/**
 * Прогреть стримы первых треков выдачи (fire-and-forget) — кладёт signed-URL в
 * `streamCache`, чтобы первый play был мгновенным. `_scPrefetchStreams`
 * (первые 5, только у кого есть media).
 */
let _prefetchBusy = false
const prefetchStreams = (tracks: Track[]): void => {
  if (_prefetchBusy) return
  const todo = tracks.filter((t) => t._sc && t.scMedia).slice(0, 5)
  if (!todo.length) return
  _prefetchBusy = true
  void Promise.allSettled(todo.map((t) => scResolveStream(t))).finally(() => {
    _prefetchBusy = false
  })
}

/**
 * Резолвер стрима SC для плеера (регистрируется через `registerSourceResolver`).
 * Возвращает null, если трек не SC — тогда опросятся другие резолверы.
 */
export const scResolveStream = async (t: Track): Promise<PlayableSource | null> => {
  if (!t._sc) return null
  const scId = typeof t.scId === 'number' ? t.scId : Number(t.scId)
  if (!Number.isFinite(scId)) return null

  const cached = streamCache.get(scId)
  if (cached && Date.now() - cached.at < STREAM_TTL) return cached.src

  // У треков волны (station/related) media почти всегда есть, но если нет —
  // дотягиваем полный трек по id, иначе getStreamUrl упадёт «нет данных потока».
  let media = (t.scMedia as ScMedia) ?? null
  if (!media || !(media as ScMedia).transcodings?.length) {
    const full = await getTrackById(scId)
    media = (full?.media as ScMedia) ?? null
  }
  const stream = await getStreamUrl(media)
  const src: PlayableSource = { url: stream.url, hls: stream.isHls }
  streamCache.set(scId, { src, at: Date.now() })
  return src
}
