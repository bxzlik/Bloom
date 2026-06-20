import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { Track } from '@entities/track'
import { ArtistLinks, CoverSourceBadge } from '@entities/track'
import type { Playlist } from '@entities/playlist'
import type { ArtistPageData } from '@features/providers'
import { getProvider } from '@features/providers'
import { AddPopup, playFromSource, playShuffledFromSource, type PlaySource } from '@features/player'
import {
  TrackCtxMenu,
  NewPlaylistModal,
  saveTrackToLibrary,
  usePlaylistStore,
  useFavStore,
  useFollowStore,
  useLibStore,
  tracksLabel,
} from '@features/library'
import { toast, useShareStore } from '@shared/ui'
import { useT, useI18nStore } from '@shared/i18n'
import { useDetailStore, type DetailTarget } from '../model/detailStore'

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
const PhTrack = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.3 }}>
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
)
const PhAlbum = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.3 }}>
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const PlayBadge = () => (
  <div className="sp-tc-play">
    <div className="sp-tc-play-btn">
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1" strokeLinejoin="round" style={{ marginLeft: 2 }}>
        <path d="M7.5 4.5C7.5 3.4 8.7 2.7 9.6 3.3l11 7.5c.9.5.9 1.9 0 2.4l-11 7.5C8.7 21.3 7.5 20.6 7.5 19.5V4.5z" />
      </svg>
    </div>
  </div>
)
const HeartSvg = ({ filled }: { filled: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? '#e03030' : 'none'} stroke={filled ? '#e03030' : 'currentColor'} strokeWidth="2" strokeLinecap="round">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
  </svg>
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        {following ? (
          <polyline points="16 11 18 13 22 9" />
        ) : (
          <>
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </>
        )}
      </svg>
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
}: {
  track: Track
  onPlay: () => void
  onCtxMenu: (e: ReactMouseEvent<HTMLDivElement>) => void
  onAddClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
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
    <div className="tr" onClick={onPlay} onContextMenu={onCtxMenu}>
      <div className="trcov">
        <Cover src={track.cover} placeholder={<PhTrack />} />
        <CoverSourceBadge track={track} />
      </div>
      <div className="tri">
        <div className="trn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {/* Внутренний бегунок hover-marquee (useTrackRowMarquee). */}
            <span>{track.name}</span>
          </span>
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
  const createPl = usePlaylistStore((s) => s.createPl)
  const reorderPlTracks = usePlaylistStore((s) => s.reorderPlTracks)
  const openShare = useShareStore((s) => s.openShare)

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tracksLimit, setTracksLimit] = useState(8)

  // Ctx-menu трека (ПКМ) — как в SearchPage.
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; track: Track } | null>(null)
  const [pendingNewPlTrack, setPendingNewPlTrack] = useState<Track | null>(null)
  const onCtxMenu = (e: ReactMouseEvent<HTMLElement>, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ pos: { x: e.clientX, y: e.clientY }, track })
  }

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
    setTracksLimit(8)
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

  // ── Импорт ──
  const importToLibrary = (tracks: Track[]) => {
    let added = 0
    tracks.forEach((t) => {
      if (saveTrackToLibrary(t)) added++
    })
    toast(added ? t('search.toast.added', { n: added }) : t('search.toast.allInLib'))
  }
  const importAsPlaylist = (title: string, cover: string | null, tracks: Track[], scSource?: string) => {
    if (!tracks.length) {
      toast(t('search.toast.noImport'))
      return
    }
    const pl = createPl(title, undefined, cover ?? undefined, scSource ? { scSource } : undefined)
    tracks.forEach((t) => saveTrackToLibrary(t))
    // Точный порядок альбома/плейлиста (addTrackToPl теперь prepend'ит по одному
    // — для импорта это перевернуло бы список, поэтому ставим trs целиком).
    reorderPlTracks(pl.id, tracks.map((t) => t.id))
    toast(t('search.toast.plImported', { name: title, n: tracks.length }))
    close()
  }

  // ── Hero данные (мгновенно из target, обогащаются из loaded) ──
  const isArtist = target.kind === 'artist'
  const square = !isArtist
  const label = isArtist ? t('search.detail.artist') : target.kind === 'album' ? t('search.detail.album') : t('search.detail.playlist')

  let heroName = target.title
  let heroCover = target.cover ?? null
  let heroBanner: string | null = null
  let heroDesc = ''
  let subNode: ReactNode = target.subtitle ?? null
  let mainTracks: Track[] = []

  if (loaded?.kind === 'artist') {
    const { artist, tracks } = loaded.data
    heroName = artist.name
    heroCover = artist.avatar ?? heroCover
    heroBanner = artist.bannerUrl ?? null
    heroDesc = artist.description ?? ''
    mainTracks = tracks
    const secs = totalSec(tracks)
    subNode = (
      <>
        {!!artist.followers && (
          <span className="sp-am-stat">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            {fmtNum(artist.followers)}
          </span>
        )}
        <span className="sp-am-stat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          {tracks.length} треков{secs ? ' · ' + fmtDurLong(secs) : ''}
        </span>
      </>
    )
  } else if (loaded) {
    const { playlist, tracks } = loaded
    heroName = playlist.title
    heroCover = playlist.cover ?? heroCover
    mainTracks = tracks
    const secs = totalSec(tracks)
    subNode = (
      <span className="sp-am-stat">
        {(playlist.ownerName ? playlist.ownerName + ' · ' : '') + tracksLabel(tracks.length)}
        {secs ? ' · ' + fmtDurLong(secs) : ''}
      </span>
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
  const onImport = () => {
    if (isArtist) importToLibrary(mainTracks)
    else {
      // permalink для «Обновить треки» (только у SC-плейлистов/альбомов с handle).
      const scSource = loaded && loaded.kind !== 'artist' ? loaded.playlist.sourceUrl ?? undefined : undefined
      importAsPlaylist(heroName, heroCover, mainTracks, scSource)
    }
  }

  // Артист loaded — для follow-кнопки (id/permalink/avatar).
  const loadedArtist = loaded?.kind === 'artist' ? loaded.data.artist : null

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

  // Фон hero: баннер артиста (если есть) ИЛИ обложка/аватарка.
  const heroBg = heroBanner ?? heroCover

  return (
    <div
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
      <div className="sp-dv-hero">
        {/* Фон hero = баннер артиста (если есть) ИЛИ обложка/аватарка,
            с тёмным градиентом сверху. spDvBg = avatarUrl. */}
        <div
          className="sp-am-bg"
          style={heroBg ? { backgroundImage: `url(${heroBg})` } : undefined}
        />
        <div className="sp-am-hero-grad" />
        <button className="sp-dv-back" onClick={stack.length > 1 ? back : close} aria-label={t('common.back')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="sp-am-hero-content" style={{ paddingTop: 52 }}>
          <div className="sp-am-hero-info">
            <div className={`sp-am-avatar${square ? ' square' : ''}`}>
              <Cover src={heroCover} placeholder={square ? <PhAlbum /> : <PhTrack />} />
            </div>
            <div className="sp-am-meta">
              <div className="sp-am-label">{label}</div>
              <div className="sp-am-name">{heroName}</div>
              <div className="sp-am-sub">{subNode}</div>
              {heroDesc && <div className="sp-am-hero-desc">{heroDesc}</div>}
            </div>
          </div>
          {loaded && (
            <div className="sp-am-actions" style={{ display: 'flex' }}>
              <button className="sp-am-play-btn" onClick={onPlayAll}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
                </svg>
                {t('search.playAll')}
              </button>
              {/* Follow — сразу после «Воспроизвести всё». */}
              {isArtist && loadedArtist && (
                <FollowBtn
                  id={target.id}
                  name={heroName}
                  avatar={heroCover}
                  permalink={loadedArtist.permalink ?? null}
                />
              )}
              <button className="sp-am-icon-btn" onClick={onShuffle} aria-label={t('player.aria.shuffle')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
                  <path d="m18 2 4 4-4 4" strokeLinejoin="round" />
                  <path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2" />
                  <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8" />
                  <path d="m18 14 4 4-4 4" strokeLinejoin="round" />
                </svg>
              </button>
              <button className="sp-am-icon-btn" onClick={onImport} aria-label={t('search.import')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button className="sp-am-icon-btn" onClick={onShare} aria-label={t('lib.ctx.share')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sp-am-body" style={{ padding: '16px 8px 24px' }}>
        {!loaded && !error && <Skeleton />}
        {error && <div className="sc-status error">{t('search.errPrefix')}{error}</div>}

        {loaded?.kind === 'artist' && (
          <ArtistBody
            data={loaded.data}
            tracksLimit={tracksLimit}
            onShowMore={() => setTracksLimit((n) => n + 8)}
            onPlayTrack={playOne}
            onCtxMenu={onCtxMenu}
            onAddTrack={onAddTrack}
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
          />
        )}

        {loaded && loaded.kind !== 'artist' && (
          <PlaylistBody
            tracks={loaded.tracks}
            onPlayTrack={playOne}
            onCtxMenu={onCtxMenu}
            onAddTrack={onAddTrack}
          />
        )}
      </div>

      <TrackCtxMenu
        pos={ctx?.pos ?? null}
        track={ctx?.track ?? null}
        onClose={() => setCtx(null)}
        onCreatePlaylistForTrack={(id) =>
          setPendingNewPlTrack(mainTracks.find((t) => t.id === id) ?? ctx?.track ?? null)
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
        onCreateNewPlaylist={() => setPendingNewPlTrack(addTrack)}
      />
      <NewPlaylistModal
        open={pendingNewPlTrack !== null}
        onClose={() => setPendingNewPlTrack(null)}
        onCreated={(plId) => {
          if (pendingNewPlTrack) {
            saveTrackToLibrary(pendingNewPlTrack)
            addTrackToPl(plId, pendingNewPlTrack.id)
          }
          setPendingNewPlTrack(null)
        }}
      />
    </div>
  )
}

/* ── Тело страницы артиста ────────────────────────────────────────────── */
const ArtistBody = ({
  data,
  tracksLimit,
  onShowMore,
  onPlayTrack,
  onCtxMenu,
  onAddTrack,
  onOpenAlbum,
}: {
  data: ArtistPageData
  tracksLimit: number
  onShowMore: () => void
  onPlayTrack: (track: Track) => void
  onCtxMenu: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
  onAddTrack: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
  onOpenAlbum: (p: Playlist) => void
}) => {
  const t = useT()
  const { artist, topTracks, tracks, albums } = data
  const shownTracks = tracks.slice(0, tracksLimit)

  return (
    <>
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </a>
            </div>
          )}
        </div>
      )}

      {topTracks.length > 0 && (
        <div className="sp-am-section">
          <div className="sp-am-section-hdr"><span className="sp-am-section-title">{t('search.popular')}</span></div>
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
        </div>
      )}

      {tracks.length > 0 && (
        <div className="sp-am-section">
          <div className="sp-am-section-hdr"><span className="sp-am-section-title">{t('search.tab.tracks')}</span></div>
          {shownTracks.map((t) => (
            <TrackRow
              key={t.id}
              track={t}
              onPlay={() => onPlayTrack(t)}
              onCtxMenu={(e) => onCtxMenu(e, t)}
              onAddClick={(e) => onAddTrack(e, t)}
            />
          ))}
          {tracks.length > shownTracks.length && (
            <button
              onClick={onShowMore}
              style={{
                display: 'block', width: '100%', marginTop: 8, padding: 9,
                borderRadius: 'var(--radius)', background: 'transparent',
                border: '1px solid rgba(255,255,255,var(--wb))', color: 'var(--text2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {t('search.loadMore')}
            </button>
          )}
        </div>
      )}

      {albums.length > 0 && (
        <div className="sp-am-section">
          <div className="sp-am-section-hdr"><span className="sp-am-section-title">{t('search.tab.albums')}</span></div>
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
        </div>
      )}

      {!topTracks.length && !tracks.length && !albums.length && (
        <div className="sc-status">{t('search.noArtistTracks')}</div>
      )}
    </>
  )
}

/* ── Тело альбома / плейлиста ─────────────────────────────────────────── */
const PlaylistBody = ({
  tracks,
  onPlayTrack,
  onCtxMenu,
  onAddTrack,
}: {
  tracks: Track[]
  onPlayTrack: (track: Track) => void
  onCtxMenu: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
  onAddTrack: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
}) => {
  const t = useT()
  if (!tracks.length) return <div className="sc-status">{t('search.noTracks')}</div>
  return (
    <div className="sp-am-section">
      {tracks.map((t) => (
        <TrackRow
          key={t.id}
          track={t}
          onPlay={() => onPlayTrack(t)}
          onCtxMenu={(e) => onCtxMenu(e, t)}
          onAddClick={(e) => onAddTrack(e, t)}
        />
      ))}
    </div>
  )
}
