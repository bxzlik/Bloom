import type { MusicProvider, SearchResults, ResolvedUrl } from './types'

/**
 * Реестр музыкальных провайдеров. Площадка регистрирует свой `MusicProvider`
 * один раз при инициализации; UI поиска/страниц спрашивает у реестра.
 *
 * Параллель с `trackRegistry`/`registerSourceResolver` (плеер), но уровнем выше:
 * там — «как достать стрим», здесь — «как искать и отдавать сущности».
 */
const _providers: MusicProvider[] = []

/** Зарегистрировать (или заменить по id) провайдер. */
export const registerProvider = (p: MusicProvider): void => {
  const i = _providers.findIndex((x) => x.id === p.id)
  if (i >= 0) _providers[i] = p
  else _providers.push(p)
}

/** Все включённые провайдеры (в порядке регистрации). */
export const getProviders = (): MusicProvider[] =>
  _providers.filter((p) => p.isEnabled?.() ?? true)

/**
 * Все зарегистрированные провайдеры, включая выключённые (`isEnabled`=false).
 * Для UI-дропдауна источника, где площадки показываются всегда — даже не
 * настроенные (напр. Spotify без Premium-владельца). Поиск по выбранной площадке
 * всё равно отработает (или покажет ошибку), а «Все источники» опрашивают только
 * включённые (см. searchAll).
 */
export const getAllProviders = (): MusicProvider[] => [..._providers]

export const getProvider = (id: string): MusicProvider | undefined =>
  _providers.find((p) => p.id === id)

const EMPTY: SearchResults = { artists: [], playlists: [], albums: [], tracks: [] }

/**
 * Искать по всем включённым провайдерам параллельно и слить выдачу в один
 * нормализованный результат. Провайдер, упавший с ошибкой, просто не вносит
 * вклад.
 *
 * Порядок слияния = порядок регистрации провайдеров (local → sc → …), чтобы
 * выдача была детерминированной.
 */
export const searchAll = async (
  query: string,
  opts?: { signal?: AbortSignal; providerId?: string; sort?: 'relevance' | 'new' },
): Promise<SearchResults> => {
  const q = query.trim()
  if (!q) return { ...EMPTY }

  // providerId задан — ищем только в нём (дропдаун источника); иначе во всех.
  // При «Все источники» сетевые провайдеры (SoundCloud) идут ПЕРВЫМИ, локальная
  // библиотека — в конце, чтобы поиск-открытие вёл сетевой контент, а свои треки
  // были дополнением, а не засоряли начало выдачи.
  // 'all' — сентинел «все источники» (SearchSource = 'all' | providerId), трактуем
  // как отсутствие фильтра. Иначе filter(p.id === 'all') вырезал бы ВСЕХ → пусто.
  const onlyId = opts?.providerId && opts.providerId !== 'all' ? opts.providerId : null
  const enabled = getProviders()
  // Выбран конкретный источник — ищем именно в нём, даже если он «выключен»
  // (`isEnabled`=false): дропдаун показывает все площадки, и явный выбор надо
  // уважить (провайдер сам вернёт результат либо ошибку). Не найден вовсе
  // (стейл id из localStorage) — фолбэк на все включённые. «Все источники»
  // (onlyId=null) опрашивают только включённые.
  const picked = onlyId ? getAllProviders().filter((p) => p.id === onlyId) : enabled
  const providers = (picked.length ? picked : enabled).sort(
    (a, b) => (a.id === 'local' ? 1 : 0) - (b.id === 'local' ? 1 : 0),
  )
  // Пер-провайдерный таймаут: один медленный/висящий источник (напр. SoundCloud
  // во время скрейпа client_id) не должен блокировать всю мультипоисковую выдачу.
  // По таймауту провайдер просто не вносит вклад (как при ошибке). При поиске по
  // одному источнику таймаут не нужен — там нечего ждать, даём больше времени.
  const PER_PROVIDER_MS = onlyId ? 30000 : 12000
  const withTimeout = (pr: Promise<Partial<SearchResults>>): Promise<Partial<SearchResults>> =>
    Promise.race([
      pr,
      new Promise<Partial<SearchResults>>((resolve) => setTimeout(() => resolve({}), PER_PROVIDER_MS)),
    ])
  const settled = await Promise.allSettled(
    providers.map((p) => withTimeout(p.search(q, { signal: opts?.signal, sort: opts?.sort }))),
  )

  const merged: SearchResults = { artists: [], playlists: [], albums: [], tracks: [], tracksHasMore: false }
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    const v = r.value
    if (v.artists) merged.artists.push(...v.artists)
    if (v.playlists) merged.playlists.push(...v.playlists)
    if (v.albums) merged.albums.push(...v.albums)
    if (v.tracks) merged.tracks.push(...v.tracks)
    if (v.tracksHasMore) merged.tracksHasMore = true
  }
  return merged
}

/**
 * Резолв вставленной ссылки: опрашиваем провайдеры, у которых есть resolveUrl,
 * первый непустой результат выигрывает. Возвращает providerId (для открытия
 * детального вида в нужном источнике) + результат.
 */
export const resolveUrlAny = async (
  url: string,
): Promise<{ providerId: string; resolved: ResolvedUrl } | null> => {
  for (const p of getProviders()) {
    if (!p.resolveUrl) continue
    try {
      const resolved = await p.resolveUrl(url)
      if (resolved) return { providerId: p.id, resolved }
    } catch {
      /* пробуем следующий */
    }
  }
  return null
}

/**
 * Догрузить ещё треки (пагинация) по всем (или выбранному) провайдерам.
 * Сливает порции, hasMore = у любого ещё есть.
 */
export const loadMoreTracksAll = async (
  query: string,
  offset: number,
  opts?: { providerId?: string; sort?: 'relevance' | 'new' },
): Promise<{ tracks: SearchResults['tracks']; hasMore: boolean }> => {
  const q = query.trim()
  if (!q) return { tracks: [], hasMore: false }
  const onlyId = opts?.providerId && opts.providerId !== 'all' ? opts.providerId : null
  const providers = (onlyId ? getProviders().filter((p) => p.id === onlyId) : getProviders())
    .filter((p) => typeof p.loadMoreTracks === 'function')
  const settled = await Promise.allSettled(
    providers.map((p) => p.loadMoreTracks!(q, offset, { sort: opts?.sort })),
  )
  const tracks: SearchResults['tracks'] = []
  let hasMore = false
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    tracks.push(...r.value.tracks)
    if (r.value.hasMore) hasMore = true
  }
  return { tracks, hasMore }
}
