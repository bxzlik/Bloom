import { create } from 'zustand'
import type { SearchResults, ResolvedUrl, ProfileData } from '@features/providers'
import { searchAll, loadMoreTracksAll, resolveUrlAny } from '@features/providers'
import type { DetailKind } from './detailStore'

const EMPTY: SearchResults = { artists: [], playlists: [], albums: [], tracks: [] }

/** Похоже ли на ссылку (любой http, soundcloud.com или music.yandex) — для ветки
 *  резолва. Домены ловим и без протокола (как старые ветки spHandleUrl/ymResolveUrl). */
export const looksLikeUrl = (q: string): boolean =>
  /^https?:\/\//i.test(q) ||
  /(^|\.)soundcloud\.com\//i.test(q) ||
  /(^|\.)music\.yandex\.[a-z]+\//i.test(q)

/** Резолвнутая по ссылке сущность → выдача из ОДНОЙ карточки. */
const resolvedToResults = (r: ResolvedUrl): SearchResults => {
  const base: SearchResults = { artists: [], playlists: [], albums: [], tracks: [], tracksHasMore: false }
  if (r.type === 'track') return { ...base, tracks: [r.track] }
  if (r.type === 'artist') return { ...base, artists: [r.artist] }
  if (r.type === 'album') return { ...base, albums: [r.playlist] }
  if (r.type === 'playlist') return { ...base, playlists: [r.playlist] }
  return base // profile обрабатывается отдельно (инлайн hero)
}

/** Категория-таб (какую секцию показывать). spSetFilter. */
export type SearchTab = 'all' | 'tracks' | 'artists' | 'playlists' | 'albums'

/** Источник поиска: 'all' (все провайдеры) или конкретный providerId. */
export type SearchSource = string

/** Мета-фильтры треков. */
export type DurFilter = 'all' | 'short' | 'mid' | 'long'
export type YearFilter = 'all' | 'new' | '2010' | '2000' | 'old'
export type SortOrder = 'relevance' | 'new'

/* ── Недавние: запросы + открытые (persist в localStorage) ───────────── */
const RS_KEY = 'bloom_recent_searches'
const RI_KEY = 'bloom_recent_items'
const SRC_KEY = 'bloom_search_source'
const RS_MAX = 8
const RI_MAX = 12

/**
 * Недавно открытое: артист/альбом/плейлист (открываются в DetailView) ИЛИ трек
 * (проигрывается по клику). Поля как у DetailTarget + kind 'track'.
 */
export type RecentItem = {
  kind: DetailKind | 'track'
  providerId: string
  id: string
  title: string
  cover?: string | null
  subtitle?: string
  round?: boolean
  /** Автор/владелец — показывается в подзаголовке недавнего: «{author} · {тип}». */
  author?: string
}

const loadStrArr = (key: string): string[] => {
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const loadItems = (): RecentItem[] => {
  try {
    const a = JSON.parse(localStorage.getItem(RI_KEY) || '[]')
    return Array.isArray(a) ? (a as RecentItem[]).filter((x) => x && x.id && x.kind) : []
  } catch {
    return []
  }
}
const save = (key: string, v: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* переполнено — игнор */
  }
}
const loadSource = (): SearchSource => {
  try {
    // Дефолт — SoundCloud.
    return localStorage.getItem(SRC_KEY) || 'soundcloud'
  } catch {
    return 'soundcloud'
  }
}

export interface SearchState {
  /** Текст в инпуте. */
  query: string
  /** Запрос, по которому показана текущая выдача. */
  submitted: string
  results: SearchResults
  loading: boolean
  /** Был ли хоть один поиск (отличить пустой старт от «ничего не найдено»). */
  searched: boolean
  /** Профиль по ссылке /username (рендерится инлайн вместо обычной выдачи). */
  profile: ProfileData | null

  /** Активный источник: 'all' | providerId. */
  source: SearchSource
  /** Активный таб-категория. */
  tab: SearchTab

  /** Мета-фильтры треков. dur/year/genre — client-side; sort — перезапрос API. */
  durFilter: DurFilter
  yearFilter: YearFilter
  genreFilter: string | null
  sortOrder: SortOrder

  /** Пагинация треков: сколько уже запрошено + флаг догрузки. */
  tracksOffset: number
  loadingMore: boolean

  /** Недавние запросы (макс. 8) и недавно открытые сущности (макс. 12). */
  recentSearches: string[]
  recentItems: RecentItem[]

  setQuery: (q: string) => void
  /** Выполнить поиск (по выбранному источнику). Пустой запрос — сброс. */
  runSearch: (q?: string) => Promise<void>
  clear: () => void

  setSource: (s: SearchSource) => void
  setTab: (t: SearchTab) => void

  setDurFilter: (d: DurFilter) => void
  setYearFilter: (y: YearFilter) => void
  setGenreFilter: (g: string | null) => void
  /** Сменить сортировку и перезапросить (sort=new → SC &sort=created_at). */
  setSortOrder: (o: SortOrder) => void
  /** Догрузить ещё треки (кнопка «ещё»). */
  loadMoreTracks: () => Promise<void>

  /** Добавить недавно открытую сущность (вызывается при открытии DetailView). */
  pushRecentItem: (item: RecentItem) => void
  removeRecentItem: (id: string) => void
  clearRecentItems: () => void
  removeRecentSearch: (q: string) => void
  clearRecentSearches: () => void
}

/** Монотонный токен — отбрасываем устаревшую выдачу при быстрых повторных поисках. */
let _token = 0

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  submitted: '',
  results: { ...EMPTY },
  loading: false,
  searched: false,
  profile: null,

  source: loadSource(),
  tab: 'all',

  durFilter: 'all',
  yearFilter: 'all',
  genreFilter: null,
  sortOrder: 'relevance',

  tracksOffset: 0,
  loadingMore: false,

  recentSearches: loadStrArr(RS_KEY),
  recentItems: loadItems(),

  setQuery: (q) => set({ query: q }),

  runSearch: async (q) => {
    const query = (q ?? get().query).trim()
    if (!query) {
      get().clear()
      return
    }
    // Запомнить запрос (наверх, без дублей, максимум 8).
    const rs = [query, ...get().recentSearches.filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, RS_MAX)
    save(RS_KEY, rs)

    const my = ++_token
    const source = get().source
    const sort = get().sortOrder
    // Новый запрос — сбрасываем жанр-фильтр (список жанров зависит от выдачи) + профиль.
    set({ loading: true, searched: true, submitted: query, recentSearches: rs, genreFilter: null, profile: null })

    // Ссылка SoundCloud → резолвим: профиль /username →
    // инлайн hero; трек/плейлист/альбом/артист → ОДНА карточка.
    if (looksLikeUrl(query)) {
      const hit = await resolveUrlAny(query)
      if (my !== _token) return
      if (hit) {
        if (hit.resolved.type === 'profile') {
          set({ profile: hit.resolved.profile, results: { ...EMPTY }, loading: false, tracksOffset: 0 })
        } else {
          set({ results: resolvedToResults(hit.resolved), loading: false, tracksOffset: 0 })
        }
        return
      }
      // не зарезолвилось — падаем в обычный поиск
    }

    // `source` передаём как есть, включая сентинел 'all' — searchAll сам трактует
    // 'all' как «по всем провайдерам» (единая точка истины, без хрупкого гарда тут).
    const results = await searchAll(query, { providerId: source, sort })
    if (my !== _token) return // перебит более новым поиском
    // tracksOffset = размер первой страницы SC-треков (limit 12) для пагинации.
    set({ results, loading: false, tracksOffset: 12 })
  },

  loadMoreTracks: async () => {
    const { submitted, source, sortOrder, tracksOffset, results, loadingMore } = get()
    if (loadingMore || !results.tracksHasMore || !submitted) return
    set({ loadingMore: true })
    const { tracks: more, hasMore } = await loadMoreTracksAll(submitted, tracksOffset, {
      providerId: source, // 'all' → все провайдеры (см. searchAll)
      sort: sortOrder,
    })
    const cur = get().results
    set({
      results: { ...cur, tracks: [...cur.tracks, ...more], tracksHasMore: hasMore },
      tracksOffset: tracksOffset + 12,
      loadingMore: false,
    })
  },

  clear: () =>
    set({ query: '', submitted: '', results: { ...EMPTY }, loading: false, searched: false, profile: null }),

  setSource: (s) => {
    save(SRC_KEY, s)
    set({ source: s })
    // Повторить поиск при активном запросе.
    const q = get().query.trim()
    if (q) void get().runSearch(q)
  },
  setTab: (t) => set({ tab: t }),

  setDurFilter: (d) => set({ durFilter: d }),
  setYearFilter: (y) => set({ yearFilter: y }),
  setGenreFilter: (g) => set({ genreFilter: g }),
  setSortOrder: (o) => {
    set({ sortOrder: o })
    const q = get().query.trim()
    if (q) void get().runSearch(q) // sort требует перезапрос API
  },

  pushRecentItem: (item) => {
    const next = [item, ...get().recentItems.filter((x) => x.id !== item.id)].slice(0, RI_MAX)
    save(RI_KEY, next)
    set({ recentItems: next })
  },
  removeRecentItem: (id) => {
    const next = get().recentItems.filter((x) => x.id !== id)
    save(RI_KEY, next)
    set({ recentItems: next })
  },
  clearRecentItems: () => {
    save(RI_KEY, [])
    set({ recentItems: [] })
  },
  removeRecentSearch: (q) => {
    const next = get().recentSearches.filter((x) => x !== q)
    save(RS_KEY, next)
    set({ recentSearches: next })
  },
  clearRecentSearches: () => {
    save(RS_KEY, [])
    set({ recentSearches: [] })
  },
}))
