/**
 * SoundCloud API-клиент.
 *
 * SoundCloud api-v2 отдаёт `Access-Control-Allow-Origin: *`, поэтому прямой fetch
 * работает в WebView2 без Rust. CORS-прокси — фолбэк на случай блокировки.
 *
 * client_id: ручной (localStorage `bloom_sc_client_id`) → известные → скрейп.
 * Стрим: трек несёт `media.transcodings[]`; `getStreamUrl` выбирает progressive
 * (mp3) или hls, дёргает signed CDN URL (живёт ~5 мин).
 */

const KNOWN_CLIENT_IDS = [
  'iZIs9mchVcX5lhVRyQGGAYlNPa2Rp1jf',
  'a3e059563d7fd3372b49b37f00a00bcf',
  'fDoItMDbsbZz8dY16ZzARCZmzgHBPotA',
  'YUKXoArFcqrlQn9tfNHvvyfnDISj04zk',
]

import { t as i18nT } from '@shared/i18n'

const PROXIES: ((u: string) => string)[] = [
  (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
]

const CLIENT_ID_TTL = 1000 * 60 * 60 * 6 // 6ч
const LS_KEY = 'bloom_sc_client_id'

let clientId: string | null = null
let clientIdFetchedAt = 0
let manualClientId: string | null = null
try {
  manualClientId = localStorage.getItem(LS_KEY) || null
} catch {
  /* ignore */
}

export const setManualClientId = (id: string | null): void => {
  manualClientId = id ? id.trim() : null
  clientId = manualClientId
  clientIdFetchedAt = manualClientId ? Date.now() : 0
  try {
    if (manualClientId) localStorage.setItem(LS_KEY, manualClientId)
    else localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
export const getManualClientId = (): string | null => manualClientId

/** Активный client_id (ручной или авто-полученный). */
const getActiveClientId = (): string | null => manualClientId || clientId

/** Сбросить авто-кеш client_id (чтобы скрейп/известные перепроверились). Ручной не трогаем. */
const resetAutoCache = (): void => {
  if (!manualClientId) {
    clientId = null
    clientIdFetchedAt = 0
  }
}

const proxyFetch = async (url: string): Promise<Response> => {
  const direct = fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => {
    if (!r.ok) throw new Error('not ok')
    return r
  })
  const proxyRace = PROXIES.map((proxy) =>
    fetch(proxy(url), { signal: AbortSignal.timeout(12000) }).then((r) => {
      if (!r.ok) throw new Error('not ok')
      return r
    }),
  )
  try {
    return await Promise.any([direct, ...proxyRace])
  } catch {
    throw new Error(i18nT('sc.err.unavailable'))
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tryKnownIds = async (url: string): Promise<any | null> => {
  for (const id of KNOWN_CLIENT_IDS) {
    try {
      const sep = url.includes('?') ? '&' : '?'
      const r = await proxyFetch(url + sep + 'client_id=' + id)
      const data = await r.json()
      if (!data.errors && !data.status && (data.collection !== undefined || data.id !== undefined || !!data.url)) {
        clientId = id
        clientIdFetchedAt = Date.now()
        return data
      }
    } catch {
      /* try next */
    }
  }
  return null
}

const getClientId = async (): Promise<string> => {
  if (manualClientId) return manualClientId
  if (clientId && Date.now() - clientIdFetchedAt < CLIENT_ID_TTL) return clientId

  // Скрейп client_id из ассетов soundcloud.com.
  try {
    const html = await proxyFetch('https://soundcloud.com').then((r) => r.text())
    const scripts = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]*\.js)"/g)]
    for (const m of scripts.slice(0, 6)) {
      try {
        const js = await proxyFetch(m[1]!).then((r) => r.text())
        const idMatch = js.match(/client_id:"([a-zA-Z0-9]{20,})"/)
        if (idMatch) {
          clientId = idMatch[1]!
          clientIdFetchedAt = Date.now()
          return clientId
        }
      } catch {
        /* next script */
      }
    }
  } catch {
    /* fall through to known */
  }
  if (KNOWN_CLIENT_IDS[0]) {
    clientId = KNOWN_CLIENT_IDS[0]
    return clientId
  }
  throw new Error(i18nT('search.err.scNoClientId'))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiFetch = async (url: string, noRetry = false): Promise<any> => {
  const id = await getClientId()
  const sep = url.includes('?') ? '&' : '?'
  const res = await proxyFetch(url + sep + 'client_id=' + id)
  if (res.status === 401 || res.status === 403) {
    if (noRetry) throw new Error(i18nT('sc.err.forbidden'))
    clientId = null
    const r = await tryKnownIds(url)
    if (r) return r
    throw new Error(i18nT('sc.err.clientIdInvalid'))
  }
  const data = await res.json()
  if (data && data.errors && data.errors.length) {
    if (noRetry) throw new Error(data.errors[0].error_message || 'SC API error')
    clientId = null
    const r = await tryKnownIds(url)
    if (r) return r
    throw new Error(i18nT('sc.err.clientIdExpired'))
  }
  if (data && typeof data.status === 'string' && /^4\d\d/.test(data.status)) {
    if (noRetry) throw new Error('SC: ' + data.status)
    clientId = null
    const r = await tryKnownIds(url)
    if (r) return r
    throw new Error(i18nT('sc.err.clientIdInvalid'))
  }
  return data
}

const t300 = (raw: string | null | undefined): string | null =>
  raw ? raw.replace('-large', '-t300x300') : null

/* ── Сырые SC-типы (минимум нужных полей) ───────────────────────────── */
export interface ScTranscoding {
  url: string
  format?: { protocol?: string }
}
export interface ScMedia {
  transcodings?: ScTranscoding[]
}
export interface ScRawTrack {
  id: number
  title: string
  artist: string
  artistScId: number | null
  artwork: string | null
  duration: number
  permalink?: string
  media: ScMedia | null
  genre: string | null
  tags: string[]
  album: string
  publisher: string
  description: string
  explicit: boolean
  creditedArtist: string
  artistAvatar: string | null
  artistPermalink: string | null
  artistVerified: boolean
  year: string
  /** Глобальное число прослушиваний на SC (`playback_count`); null если скрыто. */
  playbackCount: number | null
}
export interface ScRawArtist {
  id: number
  title: string
  artist: string
  artwork: string | null
  followers: number
  permalink?: string
}
export interface ScRawPlaylist {
  id: number
  title: string
  artist: string
  artwork: string | null
  trackCount: number
  duration: number
  permalink?: string
}

export interface ScSearchPage<T> {
  items: T[]
  hasMore: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRawTrack = (t: any): ScRawTrack => ({
  id: t.id,
  title: t.title,
  artist: t.user ? t.user.username : 'Unknown',
  artistScId: t.user ? t.user.id : null,
  artwork: t300(t.artwork_url),
  duration: t.duration,
  permalink: t.permalink_url,
  media: t.media || null,
  genre: t.genre || null,
  tags: t.tag_list ? t.tag_list.split(' ').filter(Boolean) : [],
  album: (t.publisher_metadata && t.publisher_metadata.album_title) || '',
  publisher: t.label_name || (t.publisher_metadata && t.publisher_metadata.publisher) || '',
  description: t.description || '',
  explicit: !!(t.publisher_metadata && t.publisher_metadata.explicit),
  creditedArtist: (t.publisher_metadata && t.publisher_metadata.artist) || '',
  artistAvatar: t.user ? t300(t.user.avatar_url) : null,
  artistPermalink: t.user ? t.user.permalink_url || null : null,
  artistVerified: !!(t.user && t.user.verified),
  year: t.release_date ? t.release_date.slice(0, 4) : t.created_at ? t.created_at.slice(0, 4) : '',
  playbackCount: typeof t.playback_count === 'number' ? t.playback_count : null,
})

export const searchTracks = async (
  query: string,
  limit = 12,
  offset = 0,
  sort: 'relevance' | 'new' = 'relevance',
): Promise<ScSearchPage<ScRawTrack>> => {
  const url =
    'https://api-v2.soundcloud.com/search/tracks?q=' +
    encodeURIComponent(query) +
    '&limit=' + limit + '&offset=' + offset +
    (sort === 'new' ? '&sort=created_at' : '')
  const data = await apiFetch(url)
  if (!data.collection) return { items: [], hasMore: false }
  return { items: data.collection.map(mapRawTrack), hasMore: !!data.next_href }
}

export interface ScCheckResult {
  ok: boolean
  clientId: string | null
  error?: string
}

/**
 * Проверить/получить client_id автоматически: сбрасывает авто-кеш (если нет
 * ручного), затем делает тестовый запрос (`getClientId` → скрейп/известные)
 * и проверяет, что выдача пришла. Возвращает рабочий client_id или ошибку.
 */
export const checkConnection = async (): Promise<ScCheckResult> => {
  resetAutoCache()
  try {
    await searchTracks('test', 1)
    return { ok: true, clientId: getActiveClientId() }
  } catch (e) {
    return { ok: false, clientId: getActiveClientId(), error: e instanceof Error ? e.message : i18nT('common.error') }
  }
}

export const searchArtists = async (query: string, limit = 8): Promise<ScSearchPage<ScRawArtist>> => {
  const url = 'https://api-v2.soundcloud.com/search/users?q=' + encodeURIComponent(query) + '&limit=' + limit
  const data = await apiFetch(url)
  if (!data.collection) return { items: [], hasMore: false }
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: data.collection.map((u: any) => ({
      id: u.id,
      title: u.username,
      artist: u.full_name || '',
      artwork: t300(u.avatar_url),
      followers: u.followers_count || 0,
      permalink: u.permalink_url,
    })),
    hasMore: !!data.next_href,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRawPlaylist = (p: any): ScRawPlaylist => ({
  id: p.id,
  title: p.title,
  artist: p.user ? p.user.username : 'Unknown',
  artwork: t300(p.artwork_url || p.calculated_artwork_url),
  trackCount: p.track_count || 0,
  duration: p.duration || 0,
  permalink: p.permalink_url,
})

export const searchPlaylists = async (query: string, limit = 6): Promise<ScSearchPage<ScRawPlaylist>> => {
  const url = 'https://api-v2.soundcloud.com/search/playlists?q=' + encodeURIComponent(query) + '&limit=' + limit
  const data = await apiFetch(url)
  if (!data.collection) return { items: [], hasMore: false }
  return { items: data.collection.map(mapRawPlaylist), hasMore: !!data.next_href }
}

export const searchAlbums = async (query: string, limit = 6): Promise<ScSearchPage<ScRawPlaylist>> => {
  const url = 'https://api-v2.soundcloud.com/search/albums?q=' + encodeURIComponent(query) + '&limit=' + limit
  const data = await apiFetch(url)
  if (!data.collection) return { items: [], hasMore: false }
  return { items: data.collection.map(mapRawPlaylist), hasMore: !!data.next_href }
}

/* ── Детальные страницы: артист / альбом / плейлист ───────────────────── */

/** Сырой SC-пользователь (артист) — поля для hero страницы артиста. */
export interface ScRawUser {
  id: number
  username: string
  fullName: string
  avatar: string | null
  banner: string | null
  followers: number
  trackCount: number
  description: string
  website: string | null
  permalink: string | null
}

/** Резолв числового userId из id | "12345" | permalink-URL. */
const resolveUserId = async (idOrUrl: number | string): Promise<number> => {
  if (typeof idOrUrl === 'number') return idOrUrl
  if (/^\d+$/.test(idOrUrl)) return parseInt(idOrUrl, 10)
  if (idOrUrl.includes('soundcloud.com')) {
    const user = await apiFetch('https://api-v2.soundcloud.com/resolve?url=' + encodeURIComponent(idOrUrl))
    if (!user || !user.id) throw new Error(i18nT('search.err.artistNotFound'))
    return user.id
  }
  throw new Error(i18nT('search.err.artistUndetermined'))
}

/** Плейлисты пользователя (для профиля по ссылке). spHandleUrl. */
export const getUserPlaylists = async (userId: number | string): Promise<ScRawPlaylist[]> => {
  try {
    const id = await resolveUserId(userId)
    const d = await apiFetch('https://api-v2.soundcloud.com/users/' + id + '/playlists?limit=50')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (d?.collection || []).filter((p: any) => p && p.id).map(mapRawPlaylist)
  } catch {
    return []
  }
}

/** Лайкнутые треки пользователя (для профиля по ссылке). */
export const getUserLikes = async (userId: number | string): Promise<ScRawTrack[]> => {
  try {
    const id = await resolveUserId(userId)
    const d = await apiFetch('https://api-v2.soundcloud.com/users/' + id + '/likes?limit=200')
    return (d?.collection || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((x: any) => x && x.track && x.track.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((x: any) => mapRawTrack(x.track))
  } catch {
    return []
  }
}

/** Элемент ленты репостов артиста: репостнутый трек ИЛИ плейлист/альбом. */
export interface ScRepostItem {
  kind: 'track' | 'playlist' | 'album'
  track?: ScRawTrack
  playlist?: ScRawPlaylist
}

/**
 * Репосты пользователя (вкладка «Репосты» на странице артиста) — то, что артист
 * репостнул к себе на профиль. `/users/{id}/reposts` отдаёт смешанную ленту:
 * `type: 'track-repost' | 'playlist-repost'` + поле `track`/`playlist`.
 */
/**
 * Разбор страницы ленты репостов в наши элементы + курсор следующей.
 * `minFull` — размер запрошенной страницы: если пришло меньше, дальше пусто
 * (SC отдаёт «висячий» next_href на последней/неполной странице).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseReposts = (d: any, minFull: number): { items: ScRepostItem[]; next: string | null } => {
  const items: ScRepostItem[] = []
  const rawLen = d?.collection?.length ?? 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const x of (d?.collection || []) as any[]) {
    if (!x) continue
    // У некоторых ответов сущность лежит прямо в item, у других — в .track/.playlist.
    const tr = x.track || (x.type && x.type.includes('track') ? x : null)
    const pl = x.playlist || (x.type && x.type.includes('playlist') ? x : null)
    if (tr && tr.id && tr.title) {
      items.push({ kind: 'track', track: mapRawTrack(tr) })
    } else if (pl && pl.id) {
      items.push({
        kind: pl.is_album || pl.set_type === 'album' ? 'album' : 'playlist',
        playlist: mapRawPlaylist(pl),
      })
    }
  }
  return { items, next: rawLen >= minFull ? d?.next_href || null : null }
}

export const getArtistReposts = async (
  idOrUrl: number | string,
): Promise<{ items: ScRepostItem[]; next: string | null }> => {
  try {
    const id = await resolveUserId(idOrUrl)
    const d = await apiFetch(
      'https://api-v2.soundcloud.com/stream/users/' + id + '/reposts?limit=30&linked_partitioning=1',
    )
    return parseReposts(d, 30)
  } catch {
    return { items: [], next: null }
  }
}

/** Следующая страница репостов по курсору (`next_href`). */
export const getArtistRepostsPage = async (
  cursor: string,
): Promise<{ items: ScRepostItem[]; next: string | null }> => {
  try {
    // Размер страницы кодируется в курсоре (limit=N) — берём его для проверки полноты.
    const lim = Number(/[?&]limit=(\d+)/.exec(cursor)?.[1]) || 1
    return parseReposts(await apiFetch(cursor), lim)
  } catch {
    return { items: [], next: null }
  }
}

/** Данные пользователя SC (для hero артиста). `apiFetch('/users/'+id)`. */
export const getUser = async (idOrUrl: number | string): Promise<ScRawUser | null> => {
  try {
    const userId = await resolveUserId(idOrUrl)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u: any = await apiFetch('https://api-v2.soundcloud.com/users/' + userId)
    if (!u || !u.id) return null
    const visual =
      u.visuals && u.visuals.visuals && u.visuals.visuals[0] && u.visuals.visuals[0].visual_url
    return {
      id: u.id,
      username: u.username || '',
      fullName: u.full_name || '',
      avatar: u.avatar_url ? u.avatar_url.replace('-large', '-t300x300') : null,
      banner: visual || null,
      followers: u.followers_count || 0,
      trackCount: u.track_count || 0,
      description: u.description || '',
      website: u.website || null,
      permalink: u.permalink_url || null,
    }
  } catch {
    return null
  }
}

/**
 * Треки плейлиста/альбома по его permalink-URL. Резолвит плейлист, дозагружает
 * stub-треки (только id) батчами по 50. `getPlaylistTracks`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadTracksFromPlaylistData = async (data: any): Promise<ScRawTrack[]> => {
  if (!data || !data.tracks) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRaw: any[] = data.tracks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const full = allRaw.filter((t: any) => t.title)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stubs = allRaw.filter((t: any) => !t.title && t.id).map((t: any) => t.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetched: any[] = []
  for (let b = 0; b < stubs.length; b += 50) {
    const chunk = stubs.slice(b, b + 50)
    try {
      const batch = await apiFetch('https://api-v2.soundcloud.com/tracks?ids=' + chunk.join(','))
      if (Array.isArray(batch)) fetched.push(...batch)
    } catch {
      /* пропускаем неудачный батч */
    }
    if (b + 50 < stubs.length) await new Promise((r) => setTimeout(r, 80))
  }

  return full
    .concat(fetched)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((t: any) => t && t.id)
    .map(mapRawTrack)
}

export const getPlaylistTracks = async (permalinkUrl: string): Promise<ScRawTrack[]> => {
  const data = await apiFetch('https://api-v2.soundcloud.com/resolve?url=' + encodeURIComponent(permalinkUrl))
  return loadTracksFromPlaylistData(data)
}

/** Полные данные плейлиста по числовому SC-id (для открытия из «недавних» после рестарта). */
export interface ScPlaylistFull {
  tracks: ScRawTrack[]
  title: string
  cover: string | null
  ownerName: string
  trackCount: number
}
/** Один трек по числовому SC-id (для проигрывания из «недавних» после рестарта). */
export const getTrackById = async (id: number): Promise<ScRawTrack | null> => {
  try {
    const data = await apiFetch('https://api-v2.soundcloud.com/tracks/' + id)
    if (!data || !data.id) return null
    return mapRawTrack(data)
  } catch {
    return null
  }
}

export const getPlaylistById = async (id: number): Promise<ScPlaylistFull> => {
  const data = await apiFetch('https://api-v2.soundcloud.com/playlists/' + id)
  const tracks = await loadTracksFromPlaylistData(data)
  return {
    tracks,
    title: data?.title || '',
    cover: t300(data?.artwork_url || data?.calculated_artwork_url) ?? t300(data?.user?.avatar_url),
    ownerName: data?.user?.username || '',
    trackCount: data?.track_count || tracks.length,
  }
}

/**
 * Популярные треки артиста: /toptracks → /spotlight → /tracks → поиск по имени.
 * `getArtistTopTracks`.
 */
export const getArtistTopTracks = async (
  idOrPermalink: number | string,
  artistName?: string,
): Promise<ScRawTrack[]> => {
  let userId: number
  try {
    userId = await resolveUserId(idOrPermalink)
  } catch {
    userId = 0
  }

  if (userId) {
    // 1. /toptracks — настоящие «популярные» (отсортированы по прослушиваниям).
    try {
      const tt = await apiFetch(
        'https://api-v2.soundcloud.com/users/' + userId + '/toptracks?limit=20&linked_partitioning=1',
      )
      if (tt && tt.collection && tt.collection.length)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return tt.collection.filter((t: any) => t && t.id).map(mapRawTrack)
    } catch {
      /* next */
    }
    // 2. /spotlight — закреплённые артистом (фолбэк, публичный).
    try {
      const sp = await apiFetch(
        'https://api-v2.soundcloud.com/users/' + userId + '/spotlight?limit=10&linked_partitioning=1',
      )
      if (sp && sp.collection && sp.collection.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const trs = sp.collection.filter((x: any) => x.kind === 'track' && x.id)
        if (trs.length) return trs.map(mapRawTrack)
      }
    } catch {
      /* next */
    }
    // 3. /tracks (может требовать сессию).
    try {
      const d = await apiFetch(
        'https://api-v2.soundcloud.com/users/' + userId + '/tracks?limit=50&linked_partitioning=1',
      )
      if (d && d.collection && d.collection.length)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return d.collection.filter((t: any) => t && t.id).map(mapRawTrack)
    } catch {
      /* next */
    }
  }

  // 4. Фолбэк: поиск по имени артиста.
  if (artistName) {
    try {
      const sr = await apiFetch(
        'https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(artistName) + '&limit=30',
      )
      if (sr && sr.collection) {
        const name = artistName.toLowerCase()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matched = sr.collection.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (t: any) => t && t.id && t.user && t.user.username.toLowerCase() === name,
        )
        if (matched.length) return matched.map(mapRawTrack)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return sr.collection.filter((t: any) => t && t.id).slice(0, 20).map(mapRawTrack)
      }
    } catch {
      /* нет данных */
    }
  }
  return []
}

/**
 * Все треки + альбомы артиста (до 200 треков, 2 страницы). Фолбэк — поиск.
 * `getArtistData`.
 */
export const getArtistData = async (
  idOrUrl: number | string,
  artistName?: string,
): Promise<{ tracks: ScRawTrack[]; tracksNext: string | null; albums: ScRawPlaylist[]; userId: number }> => {
  let userId = 0
  try {
    userId = await resolveUserId(idOrUrl)
  } catch {
    /* остаётся 0 → пойдём на фолбэк поиска */
  }

  // Только первая страница — остальное догружается по `tracksNext` (см.
  // getArtistTracksPage). Раньше тут жёстко тянулись 2 страницы и обрезалось.
  let tracks: ScRawTrack[] = []
  let tracksNext: string | null = null
  if (userId) {
    try {
      const d = await apiFetch(
        'https://api-v2.soundcloud.com/users/' + userId + '/tracks?limit=50&linked_partitioning=1',
      )
      const rawLen = d?.collection?.length ?? 0
      if (d && d.collection)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tracks = d.collection.filter((t: any) => t && t.id).map(mapRawTrack)
      // SC отдаёт next_href даже на неполной/последней странице — считаем
      // последней, если пришло меньше лимита (или пусто).
      tracksNext = rawLen >= 50 ? d?.next_href || null : null
    } catch {
      /* next */
    }
  }

  let albums: ScRawPlaylist[] = []
  if (userId) {
    try {
      const ad = await apiFetch(
        'https://api-v2.soundcloud.com/users/' + userId + '/albums?limit=20&linked_partitioning=1',
      )
      if (ad && ad.collection)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        albums = ad.collection.filter((p: any) => p && p.id).map(mapRawPlaylist)
    } catch {
      /* next */
    }
  }

  // Фолбэк: если пусто — ищем по имени.
  if (!tracks.length && !albums.length && artistName) {
    try {
      const sr = await apiFetch(
        'https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(artistName) + '&limit=30',
      )
      if (sr && sr.collection) {
        const name = artistName.toLowerCase()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matched = sr.collection.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (t: any) => t && t.id && t.user && t.user.username.toLowerCase() === name,
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tracks = (matched.length ? matched : sr.collection.filter((t: any) => t && t.id).slice(0, 20)).map(
          mapRawTrack,
        )
      }
    } catch {
      /* нет данных */
    }
  }

  return { tracks, tracksNext, albums, userId }
}

/**
 * Следующая страница треков артиста по курсору (`next_href` из getArtistData/
 * предыдущей страницы). Курсор непрозрачен для вызывающего.
 */
export const getArtistTracksPage = async (
  cursor: string,
): Promise<{ tracks: ScRawTrack[]; next: string | null }> => {
  try {
    const d = await apiFetch(cursor)
    const rawLen = d?.collection?.length ?? 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracks = (d?.collection || []).filter((t: any) => t && t.id).map(mapRawTrack)
    // Пустая страница — конец (next_href от SC может быть «висячим»).
    return { tracks, next: rawLen ? d?.next_href || null : null }
  } catch {
    return { tracks: [], next: null }
  }
}

/** Нормализованный результат резолва SC-ссылки (`/resolve?url=`). */
export type ScResolved =
  | { kind: 'track'; track: ScRawTrack }
  | { kind: 'artist'; artist: ScRawArtist }
  | { kind: 'playlist' | 'album'; playlist: ScRawPlaylist }

/** Является ли строка ссылкой SoundCloud. */
export const isScUrl = (s: string): boolean => /(^https?:\/\/)?(www\.|on\.|m\.)?soundcloud\.com\//i.test(s.trim())

/**
 * Резолв SoundCloud-ссылки в сущность (трек / артист / плейлист / альбом).
 * `_SC.resolveTrack` + ветки по `kind` в scLoadUrl.
 */
export const resolveScUrl = async (url: string): Promise<ScResolved | null> => {
  let u = url.trim()
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await apiFetch('https://api-v2.soundcloud.com/resolve?url=' + encodeURIComponent(u))
  if (!data || !data.kind) return null
  if (data.kind === 'track') return { kind: 'track', track: mapRawTrack(data) }
  if (data.kind === 'user') {
    return {
      kind: 'artist',
      artist: {
        id: data.id,
        title: data.username,
        artist: data.full_name || '',
        artwork: t300(data.avatar_url),
        followers: data.followers_count || 0,
        permalink: data.permalink_url,
      },
    }
  }
  if (data.kind === 'playlist') {
    const isAlbum = data.is_album || data.set_type === 'album'
    return { kind: isAlbum ? 'album' : 'playlist', playlist: mapRawPlaylist(data) }
  }
  return null
}

/** Результат резолва стрима. */
export interface ScStream {
  url: string
  isHls: boolean
}

/**
 * Получить играбельный signed URL из `media.transcodings`. Порядок:
 * progressive (mp3) → hls → любой не-DRM. DRM (encrypted) пропускаем.
 * `getStreamUrl`.
 */
export const getStreamUrl = async (media: ScMedia | null, retry = false): Promise<ScStream> => {
  if (!media || !media.transcodings || !media.transcodings.length) throw new Error(i18nT('search.err.noStream'))
  const isDrm = (tc: ScTranscoding) => /encrypted/i.test(tc.format?.protocol || '')
  const prog = media.transcodings.find((t) => t.format?.protocol === 'progressive')
  const hls = media.transcodings.find((t) => t.format?.protocol === 'hls')
  const fallback = media.transcodings.find((tc) => tc && !isDrm(tc) && tc !== prog && tc !== hls) || undefined

  const order = [prog, hls, fallback].filter(
    (tc, i, a): tc is ScTranscoding => !!tc && !isDrm(tc) && a.indexOf(tc) === i,
  )
  const hasDrm = media.transcodings.some(isDrm)
  if (!order.length) {
    throw new Error(hasDrm ? i18nT('sc.err.drm') : i18nT('sc.err.noStream'))
  }

  const tryTc = async (tc: ScTranscoding): Promise<ScStream> => {
    const proto = tc.format?.protocol || ''
    const isHls = proto === 'hls' || proto.includes('hls')
    const sep = tc.url.includes('?') ? '&' : '?'
    const data = await apiFetch(tc.url + sep + '_cb=' + Date.now())
    if (!data || !data.url) throw new Error('no url')
    return { url: data.url, isHls }
  }

  let lastErr: unknown
  for (const tc of order) {
    try {
      return await tryTc(tc)
    } catch (e) {
      lastErr = e
    }
  }
  if (hasDrm) throw new Error(i18nT('search.err.drm'))
  if (!retry) {
    await new Promise((r) => setTimeout(r, 500))
    return getStreamUrl(media, true)
  }
  throw (lastErr instanceof Error ? lastErr : new Error(i18nT('sc.err.noStream')))
}
