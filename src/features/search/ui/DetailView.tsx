import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { Track } from '@entities/track'
import { ArtistLinks, CoverSourceBadge } from '@entities/track'
import type { Playlist } from '@entities/playlist'
import type { ArtistPageData, RepostItem } from '@features/providers'
import { getProvider } from '@features/providers'
import { AddPopup, playFromSource, playShuffledFromSource, PlayStateOverlay, type PlaySource } from '@features/player'
import {
  TrackCtxMenu,
  saveTrackToLibrary,
  createPlaylistInline,
  applyImport,
  usePlaylistStore,
  useFavStore,
  useFollowStore,
  useLibStore,
  tracksLabel,
  type ImportTarget,
} from '@features/library'
import { useNavStore } from '@app/navigationStore'
import waveApi from '@/wave'
import { extractMpBgColor } from '@features/settings'
import { toast, useShareStore, WindowedRows } from '@shared/ui'
import { useT, useI18nStore } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { useDetailStore, type DetailTarget } from '../model/detailStore'
import { ImportPopup } from './ImportPopup'
import { TrackRowCover } from './TrackRowCover'

/* ── Форматтеры ───── */
const fmtNum = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K'
  return String(n)
}
/** "m:ss" → секунды (Track.dur — строка). */
const durToSec = (dur?: string): number => {
  if (!dur) return 0
  const p = dur.split(':').map((x) => parseInt(x, 10))
  if (p.some((n) => Number.isNaN(n))) return 0
  if (p.length === 2) return p[0]! * 60 + p[1]!
  if (p.length === 3) return p[0]! * 3600 + p[1]! * 60 + p[2]!
  return 0
}
const fmtDurLong = (secs: number): string => {
  const ru = useI18nStore.getState().locale === 'ru'
  if (!secs) return ru ? '0 мин' : '0 min'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return ru ? `${h}ч ${m}м` : `${h}h ${m}m`
  return ru ? `${m} мин` : `${m} min`
}
const totalSec = (tracks: Track[]): number =>
  tracks.reduce((s, t) => s + durToSec(t.dur), 0)

/* ── Иконки ───────────────────────────────────────────────────────────── */
const PhTrack = () => <Ico name="note" width={20} height={20} style={{ opacity: 0.3 }} />
const PhAlbum = () => <Ico name="vinyl" width={20} height={20} style={{ opacity: 0.3 }} />
const PlayBadge = () => (
  <div className="sp-tc-play">
    <div className="sp-tc-play-btn">
      <Ico name="play" width="100%" height="100%" style={{ color: 'var(--accent)', marginLeft: 2 }} />
    </div>
  </div>
)
const HeartSvg = ({ filled }: { filled: boolean }) => (
  <Ico name="heart" variant={filled ? 'bold' : 'linear'} width={13} height={13} style={{ color: filled ? '#e03030' : 'currentColor' }} />
)

/** Сырой SC-id из entity id (`sc_123` → `123`) для share-ссылки. */
const rawScId = (id: string): string => id.replace(/^sc_/, '')

/** Кнопка «подписаться»/«отписаться» на артиста (.sp-follow-btn). */
const FollowBtn = ({
  id,
  name,
  avatar,
  permalink,
}: {
  id: string
  name: string
  avatar: string | null
  permalink: string | null
}) => {
  const following = useFollowStore((s) => s.artists.some((a) => a.id === id))
  const follow = useFollowStore((s) => s.follow)
  const unfollow = useFollowStore((s) => s.unfollow)
  const t = useT()
  const toggle = () => {
    if (following) unfollow(id)
    else follow({ id, name, avatar, scId: rawScId(id) || null, scPermalink: permalink })
  }
  return (
    <button
      className={`sp-follow-btn${following ? ' followed' : ''}`}
      onClick={toggle}
      aria-label={following ? t('search.unfollow') : t('search.follow')}
    >
      <Ico name={following ? 'check' : 'user'} width={15} height={15} />
    </button>
  )
}

/** Обложка с защитой от onerror-цикла (см. project_idle_cpu_backdrop). */
const Cover = ({ src, placeholder }: { src?: string | null; placeholder: ReactNode }) => {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (src && !failed) return <img src={src} loading="lazy" onError={() => setFailed(true)} />
  return <>{placeholder}</>
}

/* ── Загруженные данные (union по типу) ───────────────────────────────── */
type Loaded =
  | { kind: 'artist'; data: ArtistPageData }
  | { kind: 'album' | 'playlist'; playlist: Playlist; tracks: Track[] }

/** In-memory кеш страниц, чтобы «назад» к артисту не дёргал сеть заново. */
const detailCache = new Map<string, Loaded>()
const cacheKey = (t: DetailTarget): string => `${t.providerId}:${t.kind}:${t.id}`

/* ── Строка трека (.tr) с подпиской на fav ────────────────────────────── */
const TrackRow = ({
  track,
  onPlay,
  onCtxMenu,
  onAddClick,
  reposter,
  widx,
}: {
  track: Track
  onPlay: () => void
  onCtxMenu: (e: ReactMouseEvent<HTMLDivElement>) => void
  onAddClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
  /** Имя репостнувшего (для вкладки «Репосты»): «⟲ name» рядом с заголовком. */
  reposter?: string
  /** Индекс в оконном списке (data-widx — замер высоты строки WindowedRows). */
  widx?: number
}) => {
  const tt = useT()
  const isFav = useFavStore((s) => s.favs.has(track.id))
  const toggleFav = useFavStore((s) => s.toggleFav)
  const inLib = useLibStore((s) => s.tracks.some((t) => t.id === track.id))
  const onFav = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!inLib) saveTrackToLibrary(track)
    toggleFav(track.id)
  }
  return (
    <div className="tr" data-widx={widx} onClick={onPlay} onContextMenu={onCtxMenu}>
      <TrackRowCover track={track} placeholder={<PhTrack />} />
      <div className="tri">
        <div className="trn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {/* Внутренний бегунок hover-marquee (useTrackRowMarquee). */}
            <span>{track.name}</span>
          </span>
          {reposter && (
            <span className="tr-repost">
              <Ico name="repeat" width={12} height={12} />
              {reposter}
            </span>
          )}
        </div>
        <div className="tra">
          <ArtistLinks artist={track.artist} scId={track.artistScId} permalink={track.artistPermalink} artistId={track.artistId} provider={track.artistProvider} />
        </div>
      </div>
      <div className="trac">
        <button className={`ib${isFav ? ' fav' : ''}`} onClick={onFav} aria-label={tt('player.aria.favAdd')}>
          <HeartSvg filled={isFav} />
        </button>
        <button className="ib" onClick={onAddClick} aria-label={tt('player.aria.add')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      {typeof track.scPlaybackCount === 'number' && track.scPlaybackCount > 0 && (
        <div className="trplays">
          <Ico name="eye" width={12} height={12} />
          {fmtNum(track.scPlaybackCount)}
        </div>
      )}
      {track.dur && <div className="trd">{track.dur}</div>}
    </div>
  )
}

/* ── Карточка трека/альбома (.sp-am-track-card) ───────────────────────── */
const Card = ({
  cover,
  name,
  sub,
  square,
  showPlay,
  badgeTrack,
  onClick,
  onCtxMenu,
}: {
  cover?: string | null
  name: string
  sub: ReactNode
  square: boolean
  showPlay: boolean
  /** Трек для бейджа площадки поверх обложки (только для трек-карточек). */
  badgeTrack?: Track
  onClick: () => void
  onCtxMenu?: (e: ReactMouseEvent<HTMLDivElement>) => void
}) => (
  <div className="sp-am-track-card" onClick={onClick} onContextMenu={onCtxMenu}>
    <div className="sp-tc-cover" style={{ borderRadius: 'var(--radius)' }}>
      <Cover src={cover} placeholder={square ? <PhAlbum /> : <PhTrack />} />
      {badgeTrack && <CoverSourceBadge track={badgeTrack} size={26} />}
      {showPlay && <PlayBadge />}
      {badgeTrack && <PlayStateOverlay trackId={badgeTrack.id} size="card" />}
    </div>
    <div className="sp-tc-info">
      <div className="sp-tc-name">{name}</div>
      <div className="sp-tc-artist">{sub}</div>
    </div>
  </div>
)

/* Скелет загрузки `_spSkeletonHTML`:
   заголовок + горизонтальный ряд из 5 карточек + заголовок + 8 строк. */
const SkCard = () => (
  <div style={{ flexShrink: 0, width: 148 }}>
    <div className="sk-block" style={{ width: 148, height: 148, borderRadius: 'var(--radius)', marginBottom: 8 }} />
    <div className="sk-block" style={{ height: 12, width: '80%', borderRadius: 6, marginBottom: 5 }} />
    <div className="sk-block" style={{ height: 10, width: '55%', borderRadius: 6 }} />
  </div>
)
const SkRow = () => (
  <div className="sk-row" style={{ marginBottom: 6 }}>
    <div className="sk-block" style={{ width: 42, height: 42, borderRadius: 'calc(var(--radius)*.6)', flexShrink: 0 }} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
      <div className="sk-block" style={{ height: 12, width: '60%', borderRadius: 6 }} />
      <div className="sk-block" style={{ height: 10, width: '35%', borderRadius: 6 }} />
    </div>
  </div>
)
const Skeleton = () => (
  <div style={{ padding: '4px 0' }}>
    <div className="sk-block" style={{ height: 18, width: 160, borderRadius: 8, marginBottom: 14 }} />
    <div className="sk-grid">
      {Array.from({ length: 5 }, (_, i) => (
        <SkCard key={i} />
      ))}
    </div>
    <div className="sk-block" style={{ height: 18, width: 80, borderRadius: 8, marginBottom: 14 }} />
    {Array.from({ length: 8 }, (_, i) => (
      <SkRow key={i} />
    ))}
  </div>
)

/**
 * Детальная страница артиста / альбома / плейлиста `#spDetailView`
 * (`.sp-dv-*` / `.sp-am-*`). Источник данных — любой провайдер
 * (`getProvider(id).getArtist/getAlbum/getPlaylist`), дизайн один на всех.
 *
 * Артист: hero + «Популярные» + «Треки» (show-more) + «Альбомы» (клик → под-вид
 * альбома с кнопкой «назад»). Альбом/плейлист: hero + список треков.
 * «Воспроизвести всё» / «Перемешать» / «Импортировать всё» (артист → в библиотеку,
 * альбом/плейлист → новый плейлист). ПКМ/«+» по треку → TrackCtxMenu.
 */
export const DetailView = () => {
  const t = useT()
  const stack = useDetailStore((s) => s.stack)
  const back = useDetailStore((s) => s.back)
  const push = useDetailStore((s) => s.push)
  const close = useDetailStore((s) => s.close)
  const target = stack[stack.length - 1] ?? null

  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const openShare = useShareStore((s) => s.openShare)

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Сетевая пагинация треков/репостов артиста: текущие списки + курсоры (см.
  // ArtistPageData.tracksCursor/repostsCursor). Догружается по «Загрузить ещё».
  const [artistTracks, setArtistTracks] = useState<Track[]>([])
  const [artistReposts, setArtistReposts] = useState<RepostItem[]>([])
  const [tracksCursor, setTracksCursor] = useState<string | null>(null)
  const [repostsCursor, setRepostsCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState<'tracks' | 'reposts' | null>(null)

  // Ctx-menu трека (ПКМ) — как в SearchPage.
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; track: Track } | null>(null)
  const goNav = useNavStore((s) => s.goNav)
  // «Новый плейлист» из деталей: уходим в библиотеку и создаём плейлист с этим
  // (ещё не библиотечным) треком сразу в inline-редакте.
  const createPlForTrack = (track: Track | null) => {
    if (!track) return
    goNav('lib')
    createPlaylistInline({ track })
  }
  const onCtxMenu = (e: ReactMouseEvent<HTMLElement>, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ pos: { x: e.clientX, y: e.clientY }, track })
  }

  // Поповер выбора цели импорта (кнопка «Импортировать» в hero).
  const importAnchorRef = useRef<HTMLButtonElement | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  // Скролл-контейнер оверлея — для оконной виртуализации списков треков.
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Поповер «Добавить в …» по кнопке «+» — список плейлистов + «В библиотеку», НЕ полное ctx-меню.
  const addAnchorRef = useRef<HTMLElement | null>(null)
  const [addTrack, setAddTrack] = useState<Track | null>(null)
  const onAddTrack = (e: ReactMouseEvent<HTMLElement>, track: Track) => {
    e.stopPropagation()
    const btn = e.currentTarget
    if (addTrack?.id === track.id && addAnchorRef.current === btn) {
      setAddTrack(null) // повторный клик по той же кнопке — закрыть
      return
    }
    addAnchorRef.current = btn
    setAddTrack(track)
  }

  // Загрузка по текущему target (с кешем и token-guard от устаревшего ответа).
  const key = target ? cacheKey(target) : null
  useEffect(() => {
    if (!target || !key) return
    const cached = detailCache.get(key)
    if (cached) {
      setLoaded(cached)
      setError(null)
      return
    }
    let cancelled = false
    setLoaded(null)
    setError(null)
    const prov = getProvider(target.providerId)
    const run = async () => {
      try {
        let res: Loaded
        if (target.kind === 'artist') {
          if (!prov?.getArtist) throw new Error(t('search.err.artistPage'))
          res = { kind: 'artist', data: await prov.getArtist(target.id) }
        } else if (target.kind === 'album') {
          if (!prov?.getAlbum) throw new Error(t('search.err.albumPage'))
          const { album, tracks } = await prov.getAlbum(target.id)
          res = { kind: 'album', playlist: album, tracks }
        } else {
          if (!prov?.getPlaylist) throw new Error(t('search.err.playlistPage'))
          const { playlist, tracks } = await prov.getPlaylist(target.id)
          res = { kind: 'playlist', playlist, tracks }
        }
        detailCache.set(key, res)
        if (!cancelled) setLoaded(res)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('search.err.load'))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [target, key])

  // Пока оверлей детального вида открыт, прячем страницу под ним (класс
  // `detail-open` на body). DetailView — `position:absolute; inset:0` поверх
  // активной страницы внутри .main; в прозрачном режиме сквозь его стекло иначе
  // просвечивает контент (обложки/текст) нижней страницы. CSS прячет
  // `#mainEl > .page` под оверлеем (см. transparency.css).
  useEffect(() => {
    document.body.classList.toggle('detail-open', !!target)
    return () => document.body.classList.remove('detail-open')
  }, [target])

  // При загрузке артиста — инициализируем пагинируемые списки/курсоры из данных
  // (или из кеша, если уже догружали и вернулись «назад»).
  useEffect(() => {
    if (loaded?.kind === 'artist') {
      setArtistTracks(loaded.data.tracks)
      setArtistReposts(loaded.data.reposts ?? [])
      setTracksCursor(loaded.data.tracksCursor ?? null)
      setRepostsCursor(loaded.data.repostsCursor ?? null)
    }
  }, [loaded])

  // Нейтральная заливка шапки: приглушённый тёмный доминант аватарки/обложки
  // (extractMpBgColor — та же логика, что у фона мини-плеера). Считаем ДО
  // early-return, поэтому кавер берём из target/loaded здесь же. Прячем градиентом
  // в фон страницы (см. .sp-am-bg). null при CORS/ошибке — CSS-фолбэк.
  const tintCover =
    loaded?.kind === 'artist'
      ? loaded.data.artist.avatar ?? target?.cover ?? null
      : loaded
        ? loaded.playlist.cover ?? target?.cover ?? null
        : target?.cover ?? null
  const [heroTint, setHeroTint] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setHeroTint(null)
    if (!tintCover) return
    void extractMpBgColor(tintCover).then((hex) => {
      if (!cancelled) setHeroTint(hex)
    })
    return () => {
      cancelled = true
    }
  }, [tintCover])

  if (!target) return null

  // ── Источник очереди для плеера ──
  const scSource = (label: string, cover?: string | null, round?: boolean): PlaySource => ({
    kind: 'sc',
    label,
    cover: cover ?? null,
    round: !!round,
  })

  const playList = (tracks: Track[], source: PlaySource, startId?: string) =>
    playFromSource(tracks.map((t) => t.id), source, startId)

  // Клик по треку играет ТОЛЬКО его (очередь из одного) —
  // scPanelPlayTrack (queue=[virtId]). Источник = артист трека (как curSource).
  const playOne = (t: Track) =>
    playFromSource([t.id], scSource(t.artist, t.cover, false), t.id)

  // ── Импорт (цель выбирается в ImportPopup) ──

  // ── Hero данные (мгновенно из target, обогащаются из loaded) ──
  const isArtist = target.kind === 'artist'
  const square = !isArtist

  let heroName = target.title
  let heroCover = target.cover ?? null
  let heroDesc = ''
  // Владелец плейлиста/альбома — отдельной строкой между именем и статами.
  let heroOwner: ReactNode = null
  let subNode: ReactNode = target.subtitle ?? null
  let mainTracks: Track[] = []

  if (loaded?.kind === 'artist') {
    const { artist, tracks } = loaded.data
    heroName = artist.name
    heroCover = artist.avatar ?? heroCover
    heroDesc = artist.description ?? ''
    mainTracks = tracks
    const secs = totalSec(tracks)
    subNode = (
      <>
        {!!artist.followers && (
          <span className="sp-am-stat">
            <Ico name="user" width={13} height={13} />
            {fmtNum(artist.followers)}
          </span>
        )}
        <span className="sp-am-stat">
          <Ico name="note" width={13} height={13} />
          {tracksLabel(tracks.length)}
        </span>
        {!!secs && (
          <span className="sp-am-stat">
            <Ico name="clock" width={13} height={13} />
            {fmtDurLong(secs)}
          </span>
        )}
      </>
    )
  } else if (loaded) {
    const { playlist, tracks } = loaded
    heroName = playlist.title
    heroCover = playlist.cover ?? heroCover
    heroOwner = playlist.ownerName || null
    mainTracks = tracks
    const secs = totalSec(tracks)
    subNode = (
      <>
        <span className="sp-am-stat">
          <Ico name="note" width={13} height={13} />
          {tracksLabel(tracks.length)}
        </span>
        {!!secs && (
          <span className="sp-am-stat">
            <Ico name="clock" width={13} height={13} />
            {fmtDurLong(secs)}
          </span>
        )}
      </>
    )
  }

  const onPlayAll = () => {
    if (!mainTracks.length) return
    playList(mainTracks, scSource(heroName, heroCover, isArtist))
  }
  const onShuffle = () => {
    if (!mainTracks.length) return
    playShuffledFromSource(mainTracks.map((t) => t.id), scSource(heroName, heroCover, isArtist))
  }
  const runImport = (target: ImportTarget) => {
    if (!mainTracks.length) {
      toast(t('search.toast.noImport'))
      return
    }
    // URL коллекции — источник «Обновить треки» (если площадка его отдаёт).
    const sourceUrl = loaded && loaded.kind !== 'artist' ? loaded.playlist.sourceUrl ?? undefined : undefined
    const res = applyImport(target, {
      title: heroName,
      cover: heroCover,
      tracks: mainTracks,
      source: sourceUrl ? { kind: 'url', url: sourceUrl, title: heroName } : undefined,
    })
    if (target.kind === 'create') {
      toast(t('search.toast.plImported', { name: heroName, n: res.added }))
      close()
    } else if (target.kind === 'library') {
      toast(res.added ? t('search.toast.added', { n: res.added }) : t('search.toast.allInLib'))
    } else if (target.kind === 'favorites') {
      toast(res.added ? t('lib.import.toast.toFavorites', { n: res.added }) : t('search.toast.allInLib'))
    } else {
      const name = usePlaylistStore.getState().playlists.find((p) => p.id === target.id)?.name ?? ''
      toast(t('lib.import.toast.toPlaylist', { name, n: res.added }))
    }
  }

  // Ленивая подгрузка треков альбома (вкладка «Альбомы» — раскрытие группы).
  // Кешируем под тем же ключом, что и полный вид альбома (cacheKey), чтобы заход
  // в альбом потом не дёргал сеть заново.
  const loadAlbumTracks = async (album: Playlist): Promise<Track[]> => {
    const prov = getProvider(target.providerId)
    if (!prov?.getAlbum) return []
    const k = `${target.providerId}:album:${album.id}`
    const cached = detailCache.get(k)
    if (cached && cached.kind === 'album') return cached.tracks
    const { album: pl, tracks } = await prov.getAlbum(album.id)
    detailCache.set(k, { kind: 'album', playlist: pl, tracks })
    return tracks
  }

  // Догрузка следующей страницы. Пишем результат и в кеш (loaded.data), чтобы
  // «назад» к артисту не сбрасывал уже подгруженное.
  const loadMoreTracks = async () => {
    const prov = getProvider(target.providerId)
    if (!tracksCursor || loadingMore || !prov?.getArtistTracksPage) return
    setLoadingMore('tracks')
    try {
      const { tracks: more, cursor } = await prov.getArtistTracksPage(tracksCursor)
      setArtistTracks((p) => [...p, ...more])
      setTracksCursor(cursor)
      const cached = key ? detailCache.get(key) : null
      if (cached?.kind === 'artist') {
        cached.data.tracks = [...cached.data.tracks, ...more]
        cached.data.tracksCursor = cursor
      }
    } catch {
      /* оставляем как есть — пользователь повторит */
    }
    setLoadingMore(null)
  }
  const loadMoreReposts = async () => {
    const prov = getProvider(target.providerId)
    if (!repostsCursor || loadingMore || !prov?.getArtistRepostsPage) return
    setLoadingMore('reposts')
    try {
      const { reposts: more, cursor } = await prov.getArtistRepostsPage(repostsCursor)
      setArtistReposts((p) => [...p, ...more])
      setRepostsCursor(cursor)
      const cached = key ? detailCache.get(key) : null
      if (cached?.kind === 'artist') {
        cached.data.reposts = [...(cached.data.reposts ?? []), ...more]
        cached.data.repostsCursor = cursor
      }
    } catch {
      /* no-op */
    }
    setLoadingMore(null)
  }

  // Артист loaded — для follow-кнопки (id/permalink/avatar).
  const loadedArtist = loaded?.kind === 'artist' ? loaded.data.artist : null

  // «Волна по артисту» (только на странице артиста SC/YM). Яндекс-артист
  // (`ym_artist_<id>`) уходит в нативный rotor `artist:<id>`, SoundCloud (`sc_<id>`)
  // — в SC-движок по трекам артиста как сидам.
  const canWave = isArtist && (target.id.startsWith('sc_') || target.id.startsWith('ym_artist_'))
  const onArtistWave = () => {
    const ymArtistId = target.id.startsWith('ym_artist_') ? target.id.slice('ym_artist_'.length) : null
    const seedTrackIds =
      loaded?.kind === 'artist' ? [...loaded.data.topTracks, ...artistTracks].map((tr) => tr.id) : []
    void waveApi.startByArtist({ ymArtistId, seedTrackIds })
  }

  const onShare = () => {
    if (isArtist) {
      openShare({
        type: 'artist',
        id: rawScId(target.id),
        name: heroName,
        permalink: loadedArtist?.permalink ?? null,
        cover: heroCover,
      })
    } else {
      const ownerName = loaded && loaded.kind !== 'artist' ? loaded.playlist.ownerName : ''
      openShare({
        type: target.kind,
        id: rawScId(target.id),
        title: heroName,
        artist: ownerName ?? '',
        cover: heroCover,
      })
    }
  }

  return (
    <div
      ref={rootRef}
      className="sp-detail-view sp-dv-body-in"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg, #0f0f0f)',
        borderRadius: 'var(--radius)',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 20,
        padding: '12px 12px 12px',
      }}
    >
      <div
        className="sp-dv-hero"
        style={heroTint ? ({ ['--hero-tint' as string]: heroTint } as CSSProperties) : undefined}
      >
        {/* Фон hero — нейтральный тёмный цвет, вытянутый из аватарки/обложки
            (--hero-tint), плавно растворяется в фон страницы (не floating). */}
        <div className="sp-am-bg" />
        <div className="sp-am-hero-content">
          {/* «Назад» — стрелка + название страницы, слева сверху. */}
          <button
            className="sp-am-back"
            onClick={stack.length > 1 ? back : close}
            aria-label={t('common.back')}
          >
            <Ico name="arrowLeftStraight" width={20} height={20} />
            <span>{heroName}</span>
          </button>
          <div className="sp-am-hero-info">
            <div className={`sp-am-avatar${square ? ' square' : ''}`}>
              <Cover src={heroCover} placeholder={square ? <PhAlbum /> : <PhTrack />} />
            </div>
            {/* Правая колонка: имя → статы → теги/описание → кнопки. */}
            <div className="sp-am-meta">
              <div className="sp-am-name">{heroName}</div>
              {heroOwner && <div className="sp-am-owner">{heroOwner}</div>}
              <div className="sp-am-sub">{subNode}</div>
              {heroDesc && <div className="sp-am-hero-desc">{heroDesc}</div>}
              {loaded && (
                <div className="sp-am-actions">
                  <button className="sp-am-play-btn" onClick={onPlayAll}>
                    <Ico name="play" variant="bold" width={14} height={14} />
                    {t('search.playAll')}
                  </button>
                  {/* Группа вторичных действий (слева) + share (справа) в одном
                      ряду со space-between — share всегда прижат вправо, в т.ч.
                      когда ряд переносится под «Воспроизвести всё». */}
                  <div className="sp-am-actions-rest">
                    <div className="sp-am-btn-group">
                      {isArtist && loadedArtist && (
                        <FollowBtn
                          id={target.id}
                          name={heroName}
                          avatar={heroCover}
                          permalink={loadedArtist.permalink ?? null}
                        />
                      )}
                      <button className="sp-am-icon-btn" onClick={onShuffle} aria-label={t('player.aria.shuffle')}>
                        <Ico name="shuffle" width={15} height={15} />
                      </button>
                      <button
                        ref={importAnchorRef}
                        className="sp-am-icon-btn"
                        onClick={() => setImportOpen((v) => !v)}
                        aria-label={t('search.import')}
                      >
                        <Ico name="import" width={14} height={14} />
                      </button>
                    </div>
                    {/* Share (+ «волна по артисту») — отдельной капсулой у правого края. */}
                    <div className="sp-am-btn-group">
                      <button className="sp-am-icon-btn" onClick={onShare} aria-label={t('lib.ctx.share')}>
                        <Ico name="share" width={14} height={14} />
                      </button>
                      {canWave && (
                        <button className="sp-am-icon-btn" onClick={onArtistWave} aria-label={t('wave.label.artist')}>
                          <Ico name="wave" variant="bold" width={15} height={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sp-am-body" style={{ padding: '16px 8px 24px' }}>
        {!loaded && !error && <Skeleton />}
        {error && <div className="sc-status error">{t('search.errPrefix')}{error}</div>}

        {loaded?.kind === 'artist' && (
          <ArtistBody
            scrollRef={rootRef}
            data={loaded.data}
            tracks={artistTracks}
            reposts={artistReposts}
            tracksHasMore={!!tracksCursor}
            repostsHasMore={!!repostsCursor}
            loadingMore={loadingMore}
            onLoadMoreTracks={loadMoreTracks}
            onLoadMoreReposts={loadMoreReposts}
            onPlayTrack={playOne}
            onCtxMenu={onCtxMenu}
            onAddTrack={onAddTrack}
            onLoadAlbumTracks={loadAlbumTracks}
            onOpenAlbum={(p) =>
              push({
                kind: 'album',
                providerId: target.providerId,
                id: p.id,
                title: p.title,
                cover: p.cover ?? null,
                subtitle: t('search.tracksCount', { n: p.trackCount ?? 0 }),
                round: false,
              })
            }
            onOpenPlaylist={(p, kind) =>
              push({
                kind,
                providerId: target.providerId,
                id: p.id,
                title: p.title,
                cover: p.cover ?? null,
                subtitle: t('search.tracksCount', { n: p.trackCount ?? 0 }),
                round: false,
              })
            }
          />
        )}

        {loaded && loaded.kind !== 'artist' && (
          <PlaylistBody
            scrollRef={rootRef}
            tracks={loaded.tracks}
            onPlayTrack={playOne}
            onCtxMenu={onCtxMenu}
            onAddTrack={onAddTrack}
          />
        )}
      </div>

      <ImportPopup
        open={importOpen}
        onClose={() => setImportOpen(false)}
        anchorRef={importAnchorRef}
        onPick={runImport}
      />

      <TrackCtxMenu
        pos={ctx?.pos ?? null}
        track={ctx?.track ?? null}
        onClose={() => setCtx(null)}
        onCreatePlaylistForTrack={(id) =>
          createPlForTrack(mainTracks.find((t) => t.id === id) ?? ctx?.track ?? null)
        }
      />

      {/* Поповер «+»: плейлисты + «В библиотеку». Для SC-трека fav/в-плейлист
          сперва персистят трек (saveTrackToLibrary), иначе после рестарта не
          зарезолвится — ensurePersisted. */}
      <AddPopup
        open={addTrack !== null}
        onClose={() => setAddTrack(null)}
        anchorRef={addAnchorRef}
        hasTrack={addTrack !== null}
        canAddToLib={
          addTrack ? !useLibStore.getState().tracks.some((t) => t.id === addTrack.id) : false
        }
        trackId={addTrack?.id}
        onAddToLib={() => {
          if (addTrack) saveTrackToLibrary(addTrack)
        }}
        onPickPlaylist={(plId) => {
          if (addTrack) {
            saveTrackToLibrary(addTrack)
            addTrackToPl(plId, addTrack.id)
          }
        }}
        onCreateNewPlaylist={() => createPlForTrack(addTrack)}
      />
    </div>
  )
}

/* ── Группа альбома (вкладка «Альбомы») ───────────────────────────────────
   Шапка (обложка + название + кол-во треков) + разворачиваемый превью-список
   треков (лениво подгружается при первом раскрытии). Превью — первые
   ALBUM_PREVIEW треков; «Показать все» раскрывает остаток или ведёт в альбом. */
const ALBUM_PREVIEW = 5
const AlbumGroup = ({
  album,
  onOpen,
  onLoadTracks,
  onPlayTrack,
  onCtxMenu,
  onAddTrack,
}: {
  album: Playlist
  onOpen: () => void
  onLoadTracks: (album: Playlist) => Promise<Track[]>
  onPlayTrack: (track: Track) => void
  onCtxMenu: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
  onAddTrack: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
}) => {
  const t = useT()
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Грузим треки сразу при монтировании — альбомы раскрыты по умолчанию (как в SC).
  useEffect(() => {
    let cancelled = false
    onLoadTracks(album)
      .then((tr) => !cancelled && setTracks(tr))
      .catch(() => !cancelled && setTracks([]))
    return () => {
      cancelled = true
    }
  }, [album.id])

  const preview = tracks ? tracks.slice(0, ALBUM_PREVIEW) : []
  const extra = tracks ? tracks.slice(ALBUM_PREVIEW) : []
  const hasMore = extra.length > 0

  return (
    <div className="sp-am-album">
      <div className="sp-am-album-hdr">
        <div className="sp-am-album-cov" onClick={onOpen}>
          <Cover src={album.cover} placeholder={<PhAlbum />} />
        </div>
        <div className="sp-am-album-meta" onClick={onOpen}>
          <div className="sp-am-album-label">{t('search.detail.album')}</div>
          <div className="sp-am-album-name">{album.title}</div>
          <div className="sp-am-album-sub">{t('search.tracksCount', { n: album.trackCount ?? 0 })}</div>
        </div>
      </div>

      <div className="sp-am-album-body">
        {tracks === null && <SkRow />}
        {tracks && tracks.length === 0 && (
          <div className="sc-status" style={{ padding: '8px 0' }}>{t('search.noTracks')}</div>
        )}
        {preview.map((tr) => (
          <TrackRow
            key={tr.id}
            track={tr}
            onPlay={() => onPlayTrack(tr)}
            onCtxMenu={(e) => onCtxMenu(e, tr)}
            onAddClick={(e) => onAddTrack(e, tr)}
          />
        ))}
        {/* Доп. треки в grid-обёртке (0fr↔1fr) — плавное раскрытие/сворачивание. */}
        {hasMore && (
          <div className={`sp-am-album-extra${showAll ? ' open' : ''}`}>
            <div>
              {extra.map((tr) => (
                <TrackRow
                  key={tr.id}
                  track={tr}
                  onPlay={() => onPlayTrack(tr)}
                  onCtxMenu={(e) => onCtxMenu(e, tr)}
                  onAddClick={(e) => onAddTrack(e, tr)}
                />
              ))}
            </div>
          </div>
        )}
        {hasMore && (
          <button className="sp-am-album-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? t('search.album.collapse') : t('search.album.showAll', { n: tracks!.length })}
          </button>
        )}
      </div>
    </div>
  )
}

/* Кнопка «Загрузить ещё» (сетевая догрузка страницы). */
const MoreBtn = ({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    disabled={loading}
    style={{
      display: 'block', width: '100%', marginTop: 8, padding: 9,
      borderRadius: 'var(--radius)', background: 'transparent',
      border: '1px solid rgba(255,255,255,var(--wb))', color: 'var(--text2)',
      fontSize: 12, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
      fontFamily: 'var(--font)', opacity: loading ? 0.6 : 1,
    }}
  >
    {loading ? '…' : label}
  </button>
)

/* ── Тело страницы артиста ────────────────────────────────────────────── */
const ArtistBody = ({
  scrollRef,
  data,
  tracks,
  reposts,
  tracksHasMore,
  repostsHasMore,
  loadingMore,
  onLoadMoreTracks,
  onLoadMoreReposts,
  onPlayTrack,
  onCtxMenu,
  onAddTrack,
  onOpenAlbum,
  onOpenPlaylist,
  onLoadAlbumTracks,
}: {
  /** Скролл-контейнер оверлея (для оконной виртуализации списков). */
  scrollRef: React.RefObject<HTMLDivElement | null>
  data: ArtistPageData
  /** Пагинируемые списки приходят из родителя (DetailView), не из data. */
  tracks: Track[]
  reposts: RepostItem[]
  tracksHasMore: boolean
  repostsHasMore: boolean
  loadingMore: 'tracks' | 'reposts' | null
  onLoadMoreTracks: () => void
  onLoadMoreReposts: () => void
  onPlayTrack: (track: Track) => void
  onCtxMenu: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
  onAddTrack: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
  onOpenAlbum: (p: Playlist) => void
  onOpenPlaylist: (p: Playlist, kind: 'album' | 'playlist') => void
  onLoadAlbumTracks: (album: Playlist) => Promise<Track[]>
}) => {
  const t = useT()
  const { artist, topTracks, albums } = data

  // Вкладки «Все / Популярные / Треки / Альбомы». Показываем только те, под
  // которыми есть контент; «Все» — всегда (если хоть что-то есть).
  const [tab, setTab] = useState<'all' | 'popular' | 'tracks' | 'albums' | 'reposts'>('all')
  // Сколько превью-строк раскрыто на вкладке «Все» (старт 15 / 5). «Загрузить
  // ещё» наращивает лимит и подтягивает следующую страницу из сети, когда
  // загруженного перестаёт хватать. Сброс при смене артиста.
  const [allTracksLimit, setAllTracksLimit] = useState(15)
  const [allRepostsLimit, setAllRepostsLimit] = useState(5)
  useEffect(() => {
    setAllTracksLimit(15)
    setAllRepostsLimit(5)
  }, [data.artist.id])
  const tabs = (
    [
      { id: 'all' as const, label: t('search.tab.all'), icon: 'list' as const, show: true },
      { id: 'popular' as const, label: t('search.popular'), icon: 'chart' as const, show: topTracks.length > 0 },
      { id: 'tracks' as const, label: t('search.tab.tracks'), icon: 'note' as const, show: tracks.length > 0 },
      { id: 'albums' as const, label: t('search.tab.albums'), icon: 'vinyl' as const, show: albums.length > 0 },
      { id: 'reposts' as const, label: t('search.tab.reposts'), icon: 'repeat' as const, show: reposts.length > 0 },
    ]
  ).filter((x) => x.show)
  // Если активная вкладка осталась без контента (другой артист) — на «Все».
  const activeTab = tabs.some((x) => x.id === tab) ? tab : 'all'
  const showPopular = activeTab === 'all' || activeTab === 'popular'
  const showTracks = activeTab === 'all' || activeTab === 'tracks'
  const showAlbums = activeTab === 'all' || activeTab === 'albums'
  const showReposts = activeTab === 'all' || activeTab === 'reposts'

  // На «Все» — превью с наращиваемым лимитом; на своих вкладках — полный список.
  const tracksToShow = activeTab === 'all' ? tracks.slice(0, allTracksLimit) : tracks
  const repostsToShow = activeTab === 'all' ? reposts.slice(0, allRepostsLimit) : reposts
  // Кнопка «Загрузить ещё» на «Все»: видна, пока есть нераскрытое локально ИЛИ
  // есть курсор. Клик — раскрыть ещё порцию и при нехватке догрузить из сети.
  const allTracksMore = tracks.length > allTracksLimit || tracksHasMore
  const allRepostsMore = reposts.length > allRepostsLimit || repostsHasMore
  const moreAllTracks = () => {
    const next = allTracksLimit + 15
    setAllTracksLimit(next)
    if (next >= tracks.length && tracksHasMore) onLoadMoreTracks()
  }
  const moreAllReposts = () => {
    const next = allRepostsLimit + 5
    setAllRepostsLimit(next)
    if (next >= reposts.length && repostsHasMore) onLoadMoreReposts()
  }
  // Заголовки секций нужны только в режиме «Все»; на одиночной вкладке имя
  // секции уже задаёт сама вкладка.
  const showHdr = activeTab === 'all'

  return (
    <>
      {/* Вкладки фильтра (рендерим, только если есть хотя бы одна вторая). */}
      {tabs.length > 1 && (
        <div className="sp-am-tabs" role="tablist">
          {tabs.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={activeTab === x.id}
              className={`sp-am-tab${activeTab === x.id ? ' active' : ''}`}
              onClick={() => setTab(x.id)}
            >
              <Ico name={x.icon} width={15} height={15} />
              {x.label}
            </button>
          ))}
        </div>
      )}

      {/* Жанры/сайт */}
      {(!!artist.genres?.length || !!artist.website) && (
        <div style={{ marginBottom: 14 }}>
          {!!artist.genres?.length && (
            <div className="sp-am-tags">
              {artist.genres.slice(0, 5).map((t) => (
                <span className="sp-am-tag" key={t}>{t}</span>
              ))}
            </div>
          )}
          {artist.website && (
            <div className="sp-am-socials">
              <a className="sp-am-social-btn" href={artist.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                <Ico name="globe" width={13} height={13} />
              </a>
            </div>
          )}
        </div>
      )}

      {showPopular && topTracks.length > 0 && (
        <div className="sp-am-section">
          {showHdr && <div className="sp-am-section-hdr"><span className="sp-am-section-title">{t('search.popular')}</span></div>}
          {/* «Все» — горизонтальная лента карточек, как раньше;
              отдельная вкладка «Популярные» — вертикальный список строк. */}
          {activeTab === 'popular' ? (
            <WindowedRows
              items={topTracks}
              scrollRef={scrollRef}
              estimate={68}
              renderItem={(t, i) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  widx={i}
                  onPlay={() => onPlayTrack(t)}
                  onCtxMenu={(e) => onCtxMenu(e, t)}
                  onAddClick={(e) => onAddTrack(e, t)}
                />
              )}
            />
          ) : (
            <div className="sp-am-tracks-grid">
              {topTracks.map((t) => (
                <Card
                  key={t.id}
                  cover={t.cover}
                  name={t.name}
                  sub={<ArtistLinks artist={t.artist} scId={t.artistScId} permalink={t.artistPermalink} artistId={t.artistId} provider={t.artistProvider} />}
                  square={false}
                  showPlay
                  badgeTrack={t}
                  onClick={() => onPlayTrack(t)}
                  onCtxMenu={(e) => onCtxMenu(e, t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showReposts && reposts.length > 0 && (
        <div className="sp-am-section">
          {showHdr && <div className="sp-am-section-hdr"><span className="sp-am-section-title">{t('search.tab.reposts')}</span></div>}
          {/* Всегда список: треки — строкой (с атрибуцией «⟲ репостнул»),
              плейлисты/альбомы — кликабельной строкой. */}
          <WindowedRows
            items={repostsToShow}
            scrollRef={scrollRef}
            estimate={68}
            renderItem={(r, i) =>
            r.kind === 'track' ? (
              <TrackRow
                key={`t_${r.track.id}_${i}`}
                track={r.track}
                widx={i}
                reposter={artist.name || undefined}
                onPlay={() => onPlayTrack(r.track)}
                onCtxMenu={(e) => onCtxMenu(e, r.track)}
                onAddClick={(e) => onAddTrack(e, r.track)}
              />
            ) : (
              <div
                key={`p_${r.playlist.id}_${i}`}
                className="tr"
                data-widx={i}
                onClick={() => onOpenPlaylist(r.playlist, r.kind)}
              >
                <div className="trcov">
                  <Cover src={r.playlist.cover} placeholder={<PhAlbum />} />
                </div>
                <div className="tri">
                  <div className="trn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {r.playlist.title}
                    </span>
                    {artist.name && (
                      <span className="tr-repost">
                        <Ico name="repeat" width={12} height={12} />
                        {artist.name}
                      </span>
                    )}
                  </div>
                  <div className="tra">
                    {(r.kind === 'album' ? t('search.detail.album') : t('search.detail.playlist')) +
                      (r.playlist.ownerName ? ' · ' + r.playlist.ownerName : '')}
                  </div>
                </div>
                <div className="trd">{t('search.tracksCount', { n: r.playlist.trackCount ?? 0 })}</div>
              </div>
            )
          }
          />
          {activeTab === 'reposts' && repostsHasMore && (
            <MoreBtn loading={loadingMore === 'reposts'} onClick={onLoadMoreReposts} label={t('search.loadMore')} />
          )}
          {activeTab === 'all' && allRepostsMore && (
            <MoreBtn loading={loadingMore === 'reposts'} onClick={moreAllReposts} label={t('search.loadMore')} />
          )}
        </div>
      )}

      {showAlbums && albums.length > 0 && (
        <div className="sp-am-section">
          {showHdr && <div className="sp-am-section-hdr"><span className="sp-am-section-title">{t('search.tab.albums')}</span></div>}
          {/* «Все» — горизонтальная лента карточек, как раньше; отдельная вкладка
              «Альбомы» — список разворачиваемых групп с превью треков (как в SC). */}
          {activeTab === 'albums' ? (
            albums.map((a) => (
              <AlbumGroup
                key={a.id}
                album={a}
                onOpen={() => onOpenAlbum(a)}
                onLoadTracks={onLoadAlbumTracks}
                onPlayTrack={onPlayTrack}
                onCtxMenu={onCtxMenu}
                onAddTrack={onAddTrack}
              />
            ))
          ) : (
            <div className="sp-am-tracks-grid">
              {albums.map((a) => (
                <Card
                  key={a.id}
                  cover={a.cover}
                  name={a.title}
                  sub={t('search.tracksCount', { n: a.trackCount ?? 0 })}
                  square
                  showPlay
                  onClick={() => onOpenAlbum(a)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showTracks && tracks.length > 0 && (
        <div className="sp-am-section">
          {showHdr && <div className="sp-am-section-hdr"><span className="sp-am-section-title">{t('search.tab.tracks')}</span></div>}
          <WindowedRows
            items={tracksToShow}
            scrollRef={scrollRef}
            estimate={68}
            renderItem={(tr, i) => (
              <TrackRow
                key={tr.id}
                track={tr}
                widx={i}
                onPlay={() => onPlayTrack(tr)}
                onCtxMenu={(e) => onCtxMenu(e, tr)}
                onAddClick={(e) => onAddTrack(e, tr)}
              />
            )}
          />
          {activeTab === 'tracks' && tracksHasMore && (
            <MoreBtn loading={loadingMore === 'tracks'} onClick={onLoadMoreTracks} label={t('search.loadMore')} />
          )}
          {activeTab === 'all' && allTracksMore && (
            <MoreBtn loading={loadingMore === 'tracks'} onClick={moreAllTracks} label={t('search.loadMore')} />
          )}
        </div>
      )}

      {!topTracks.length && !tracks.length && !albums.length && !reposts.length && (
        <div className="sc-status">{t('search.noArtistTracks')}</div>
      )}
    </>
  )
}

/* ── Тело альбома / плейлиста ─────────────────────────────────────────── */
const PlaylistBody = ({
  scrollRef,
  tracks,
  onPlayTrack,
  onCtxMenu,
  onAddTrack,
}: {
  /** Скролл-контейнер оверлея (для оконной виртуализации списка). */
  scrollRef: React.RefObject<HTMLDivElement | null>
  tracks: Track[]
  onPlayTrack: (track: Track) => void
  onCtxMenu: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
  onAddTrack: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
}) => {
  const t = useT()
  if (!tracks.length) return <div className="sc-status">{t('search.noTracks')}</div>
  return (
    <div className="sp-am-section">
      <WindowedRows
        items={tracks}
        scrollRef={scrollRef}
        estimate={68}
        renderItem={(tr, i) => (
          <TrackRow
            key={tr.id}
            track={tr}
            widx={i}
            onPlay={() => onPlayTrack(tr)}
            onCtxMenu={(e) => onCtxMenu(e, tr)}
            onAddClick={(e) => onAddTrack(e, tr)}
          />
        )}
      />
    </div>
  )
}
