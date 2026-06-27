import type { Track } from '@entities/track'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'

/**
 * Нормализованная поисковая выдача. Все провайдеры (local / SoundCloud / Yandex)
 * приводят свои ответы к ЭТИМ сущностям — поэтому UI поиска один на всех.
 * Альбомы рисуются той же `PlaylistCard`, поэтому это тоже `Playlist`.
 */
export interface SearchResults {
  artists: Artist[]
  playlists: Playlist[]
  albums: Playlist[]
  tracks: Track[]
  /** Есть ли ещё треки (для кнопки «загрузить ещё»). */
  tracksHasMore?: boolean
}

/**
 * Профиль (ссылка на `/username`) — артист + его плейлисты + лайки. Рендерится
 * инлайн в выдаче (hero + секции), spHandleUrl профиль-ветки.
 */
export interface ProfileData {
  /** Артист, обогащённый followers/description/bannerUrl/avatar. */
  artist: Artist
  playlists: Playlist[]
  likes: Track[]
}

/**
 * Результат резолва вставленной ссылки — нормализованная сущность. UI рендерит её
 * как обычную карточку (трек играется по клику, артист/альбом/плейлист открывается
 * в DetailView), профиль — инлайн hero. spHandleUrl.
 */
export type ResolvedUrl =
  | { type: 'track'; track: Track }
  | { type: 'artist'; artist: Artist }
  | { type: 'album' | 'playlist'; playlist: Playlist }
  | { type: 'profile'; profile: ProfileData }

/**
 * Элемент ленты репостов артиста (вкладка «Репосты») — репостнутый трек ИЛИ
 * плейлист/альбом. Лента смешанная, порядок важен, поэтому это union, а не
 * раздельные массивы.
 */
export type RepostItem =
  | { kind: 'track'; track: Track }
  | { kind: 'playlist' | 'album'; playlist: Playlist }

/** Контент страницы артиста — те же общие сущности. */
export interface ArtistPageData {
  /** Артист, обогащённый followers/description/website/genres/bannerUrl. */
  artist: Artist
  /** Популярные (секция «Популярные»). */
  topTracks: Track[]
  /** Все треки артиста (секция «Треки» с «загрузить ещё»). */
  tracks: Track[]
  albums: Playlist[]
  playlists: Playlist[]
  /** Репосты артиста (вкладка «Репосты»); пусто/undefined у провайдеров без них. */
  reposts?: RepostItem[]
  /** Непрозрачный курсор следующей страницы треков (null/undefined — больше нет). */
  tracksCursor?: string | null
  /** Непрозрачный курсор следующей страницы репостов. */
  repostsCursor?: string | null
}

/**
 * Контракт музыкального провайдера — единственное, что реализует площадка.
 *
 * Провайдер маппит свою выдачу в общие `entities/*`; весь UX (поиск, страницы,
 * плеер) — общий и провайдера не знает. Делает мультипровайдерность: добавить
 * площадку = реализовать этот интерфейс, ядро не трогаем.
 *
 * Связано: воспроизведение идёт через `registerSourceResolver` плеера
 * (см. project-bloom-platform-layer). `resolveStream` здесь — для будущей
 * автоподписки сетевых провайдеров на тот резолвер при регистрации.
 */
export interface MusicProvider {
  /** Технический id источника: 'local' | 'soundcloud' | 'yandex'. В UI не показывается. */
  id: string
  /** Человекочитаемая метка (для бейджа/настроек, не для разделения дизайна). */
  label: string

  /**
   * Включён ли провайдер прямо сейчас (например Yandex — только после логина).
   * Если не задан — считается включённым.
   */
  isEnabled?: () => boolean

  /**
   * Поиск. Возвращает частичную выдачу — отсутствующие секции просто пустые.
   * `sort`: 'relevance' (по умолчанию) или 'new' (сначала новые — у SC `&sort=created_at`).
   */
  search(
    query: string,
    opts?: { signal?: AbortSignal; sort?: 'relevance' | 'new' },
  ): Promise<Partial<SearchResults>>

  /**
   * Догрузить ещё треки (пагинация). offset — сколько уже показано.
   * Возвращает следующую порцию + флаг «есть ещё». Локальному не нужно.
   */
  loadMoreTracks?(
    query: string,
    offset: number,
    opts?: { sort?: 'relevance' | 'new' },
  ): Promise<{ tracks: Track[]; hasMore: boolean }>

  /** Резолв вставленной ссылки этого источника в трек/сущность (опц.). */
  resolveUrl?(url: string): Promise<ResolvedUrl | null>

  /**
   * Ре-резолв одного трека по entity id (опц.) — для проигрывания из «недавно
   * открытых» после рестарта, когда трека уже нет в trackRegistry.
   */
  resolveTrackById?(id: string): Promise<Track | null>

  /**
   * Подготовить открытие страницы артиста по имени (клик по имени артиста в треке).
   * hint.scId/permalink — точные идентификаторы (одиночный артист); иначе поиск по имени.
   * Возвращает target для DetailView (`getArtist(id)`), зарегистрировав нужные хэндлы.
   */
  resolveArtistByName?(
    name: string,
    hint?: { scId?: number; permalink?: string | null },
  ): Promise<{ id: string; title: string; cover?: string | null } | null>

  // ── Страницы (опциональны пока; добавляются по мере готовности фич) ──
  getArtist?(id: string): Promise<ArtistPageData>
  getAlbum?(id: string): Promise<{ album: Playlist; tracks: Track[] }>
  getPlaylist?(id: string): Promise<{ playlist: Playlist; tracks: Track[] }>

  /**
   * Догрузка следующей страницы треков/репостов артиста по курсору из
   * ArtistPageData (`tracksCursor`/`repostsCursor`). Возвращает порцию + новый
   * курсор (null — больше нет). Опциональны — провайдеры без пагинации их не имеют.
   */
  getArtistTracksPage?(cursor: string): Promise<{ tracks: Track[]; cursor: string | null }>
  getArtistRepostsPage?(cursor: string): Promise<{ reposts: RepostItem[]; cursor: string | null }>

  /**
   * Резолв играбельного URL для трека этого провайдера (опц.). Локальному не
   * нужен — у него встроенный путь в `resolvePlayableUrl`. Сетевые провайдеры
   * подключают это к плееру через `registerSourceResolver` при регистрации.
   */
  resolveStream?(track: Track): Promise<string | null>
}
