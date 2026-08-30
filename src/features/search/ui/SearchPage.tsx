import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { cn } from '@shared/lib/cn'
import { usePopupOpenAnimation } from '@shared/hooks'
import type { Track } from '@entities/track'
import { ArtistLinks, CoverSourceBadge, CoverProviderBadge, ScLogo, YmLogo, YtmLogo, providerBrandColor } from '@entities/track'
import { useBadgePrefs } from '@shared/lib/badgePrefs'
import { placeSrcPopup } from '@shared/lib/srcPopupPos'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import { playSingleTrack, AddPopup, PlayStateOverlay } from '@features/player'
import { getAllProviders, getProvider, type ProfileData } from '@features/providers'
import { useProfileStore } from '@features/profile'
import { CardMarquee, ExpandDesc, toast, WindowedRows } from '@shared/ui'
import { useT, useLocale, t as tt, type TranslationKey } from '@shared/i18n'
import {
  TrackCtxMenu,
  saveTrackToLibrary,
  createPlaylistInline,
  usePlaylistStore,
  useFavStore,
  useLibStore,
  tracksCountLabel,
} from '@features/library'
import { useNavStore } from '@app/navigationStore'
import { Ico, type IconName } from '@shared/ui/icons/solar'
import { useSearchStore, type SearchTab, type RecentItem } from '../model/store'
import { useDetailOpen } from '../model/detailStore'
import {
  openArtistFromSearch,
  openPlaylistFromSearch,
  playSearchTrack,
  openRecentItem,
} from '../lib/openActions'
import { TrackRowCover } from './TrackRowCover'

/* ── Иконки page-search (экспортируются: их переиспользует SearchOverlay) ── */
export const IconSearch = () => <Ico name="search" width={16} height={16} style={{ flexShrink: 0, opacity: 0.5 }} />
export const IconClose = () => <Ico name="close" width={13} height={13} />
const PlayBadge = () => (
  <div className="sp-tc-play">
    <div className="sp-tc-play-btn">
      <Ico name="play" width="100%" height="100%" style={{ color: 'var(--accent)', marginLeft: 2 }} />
    </div>
  </div>
)
/* Плейлисты/альбомы не играют по клику, а открываются → стрелка вместо play. */
const OpenBadge = () => (
  <div className="sp-tc-play">
    <div className="sp-tc-play-btn">
      <Ico name="arrowRightStraight" width="100%" height="100%" style={{ color: 'var(--accent)' }} />
    </div>
  </div>
)
const PhTrack = () => <Ico name="note" width={22} height={22} style={{ opacity: 0.3 }} />
const PhArtist = () => <Ico name="user" width={24} height={24} />

/** Обложка с защитой от onerror-цикла (см. project_idle_cpu_backdrop): при
 *  ошибке — один раз падаем на плейсхолдер, без `src=''` ре-триггера. */
const Cover = ({ src, placeholder }: { src?: string | null; placeholder: ReactNode }) => {
  const [failed, setFailed] = useState(false)
  if (src && !failed) return <img src={src} loading="lazy" onError={() => setFailed(true)} />
  return <>{placeholder}</>
}

/* ── Карточки: разметка .sp-* (один вид на все провайдеры) ── */
const TrackCard = ({
  track,
  onPlay,
  onCtxMenu,
}: {
  track: Track
  onPlay: () => void
  onCtxMenu: (e: ReactMouseEvent<HTMLDivElement>, track: Track) => void
}) => (
  <div className="sp-track-card mqh" onClick={onPlay} onContextMenu={(e) => onCtxMenu(e, track)}>
    <div className="sp-tc-cover">
      <Cover src={track.cover} placeholder={<PhTrack />} />
      <CoverSourceBadge track={track} size={26} />
      <PlayBadge />
      <PlayStateOverlay trackId={track.id} size="card" />
    </div>
    <div className="sp-tc-info">
      <CardMarquee className="sp-tc-name">{track.name}</CardMarquee>
      <CardMarquee className="sp-tc-artist">
        <ArtistLinks artist={track.artist} scId={track.artistScId} permalink={track.artistPermalink} artistId={track.artistId} provider={track.artistProvider} />
      </CardMarquee>
    </div>
  </div>
)

/** «12 345» → «12K», «2 100 000» → «2.1M»; null, если счётчика нет. */
const fmtFollowers = (n?: number | null): string | null =>
  n == null
    ? null
    : n >= 1_000_000
      ? (n / 1_000_000).toFixed(1) + 'M'
      : n >= 1000
        ? (n / 1000).toFixed(0) + 'K'
        : String(n)

const ArtistCard = ({ artist, onOpen }: { artist: Artist; onOpen: () => void }) => {
  const t = useT()
  const followers = fmtFollowers(artist.followers)
  return (
  <div className="sp-artist-card mqh" onClick={onOpen} style={{ cursor: 'pointer' }}>
    {/* Плёнка со стрелкой прямо на круглой аватарке — как у плейлистов/альбомов
        (фон-подложку карточки на hover не рисуем). */}
    <div className="sp-ac-av">
      <Cover src={artist.avatar} placeholder={<PhArtist />} />
      <OpenBadge />
    </div>
    <CardMarquee className="sp-ac-name">{artist.name}</CardMarquee>
    {/* Подзаголовок — число подписчиков; если площадка его не отдала, остаётся «Артист». */}
    <CardMarquee className="sp-ac-sub">
      {followers ? t('search.followers', { n: followers }) : t('search.kind.artist')}
    </CardMarquee>
  </div>
  )
}

const PlaylistCard = ({ playlist, onOpen }: { playlist: Playlist; onOpen: () => void }) => (
  <div className="sp-track-card mqh" onClick={onOpen} style={{ cursor: 'pointer' }}>
    <div className="sp-tc-cover">
      <Cover src={playlist.cover} placeholder={<PhTrack />} />
      <CoverProviderBadge provider={playlist.source} size={26} />
      <OpenBadge />
    </div>
    <div className="sp-tc-info">
      <CardMarquee className="sp-tc-name">{playlist.title}</CardMarquee>
      <CardMarquee className="sp-tc-artist">
        {/* «{владелец} · {год} · N тр.» — год есть у альбомов, счётчик не у всех
            площадок (YTM не даёт его альбомам) — тогда сегмент опускаем. */}
        {[playlist.ownerName, playlist.year, tracksCountLabel(playlist.trackCount)]
          .filter(Boolean)
          .join(' · ')}
      </CardMarquee>
    </div>
  </div>
)

/* ── Строка трека (.tr) для вкладки «Треки» _spSearchListRowHTML ─ */
const TrackListRow = ({
  track,
  onPlay,
  onCtxMenu,
  onAddClick,
  widx,
}: {
  track: Track
  onPlay: () => void
  onCtxMenu: (e: ReactMouseEvent<HTMLElement>) => void
  onAddClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
  /** Индекс в оконном списке (data-widx — замер высоты строки WindowedRows). */
  widx?: number
}) => {
  const tr = useT()
  const isFav = useFavStore((s) => s.favs.has(track.id))
  const toggleFav = useFavStore((s) => s.toggleFav)
  const inLib = useLibStore((s) => s.tracks.some((t) => t.id === track.id))
  const onFav = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!inLib) saveTrackToLibrary(track) // SC-трек сперва персистим (ensurePersisted)
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
        </div>
        <div className="tra">
          <ArtistLinks artist={track.artist} scId={track.artistScId} permalink={track.artistPermalink} artistId={track.artistId} provider={track.artistProvider} />
        </div>
      </div>
      <div className="trac">
        <button className={`ib${isFav ? ' fav' : ''}`} onClick={onFav} aria-label={tr('player.aria.favAdd')}>
          <Ico name="heart" variant={isFav ? 'bold' : 'linear'} width={13} height={13} />
        </button>
        <button className="ib" onClick={onAddClick} aria-label={tr('player.aria.add')}>
          <Ico name="add" width={13} height={13} />
        </button>
      </div>
      <div className="trtime">
        {track.dur && <span className="trd">{track.dur}</span>}
        <button
          className="ib trmore"
          type="button"
          aria-label={tr('common.more')}
          onClick={(e) => {
            e.stopPropagation()
            onCtxMenu(e)
          }}
        >
          <Ico name="kebab" width={15} height={15} />
        </button>
      </div>
    </div>
  )
}

/* ── Табы-категории (.sp-filter-tabs) spFilterTabs ──────── */
const TABS: { id: SearchTab; labelKey: TranslationKey; icon: IconName }[] = [
  { id: 'all', labelKey: 'search.tab.all', icon: 'grid' },
  { id: 'tracks', labelKey: 'search.tab.tracks', icon: 'note' },
  { id: 'artists', labelKey: 'search.tab.artists', icon: 'user' },
  { id: 'playlists', labelKey: 'search.tab.playlists', icon: 'list' },
  { id: 'albums', labelKey: 'search.tab.albums', icon: 'vinyl' },
]

const FilterTabs = ({ tab, onTab }: { tab: SearchTab; onTab: (t: SearchTab) => void }) => {
  const tr = useT()
  return (
  <div className="sp-filter-tabs" id="spFilterTabs">
    {TABS.map((it) => (
      <button
        key={it.id}
        className={cn('sp-filter-btn', tab === it.id && 'active')}
        data-filter={it.id}
        onClick={() => onTab(it.id)}
      >
        <Ico name={it.icon} width={12} height={12} />
        {tr(it.labelKey)}
      </button>
    ))}
  </div>
  )
}

/* ── Дропдаун выбора источника ────────────────── */
const LibLogo = () => <Ico name="folder" width={16} height={16} />
const AllLogo = () => <Ico name="grid" width={16} height={16} />

/**
 * Иконка источника. Бренд-лого (SoundCloud / Яндекс) — общие из `@entities/track`,
 * красятся `currentColor`: по умолчанию акцентом, а на выделенной строке дропдауна
 * (`accent` фон) — белым (`accentText`), чтобы оставались видимыми. Лого библиотеки/
 * «все источники» нейтральны (наследуют цвет кнопки).
 */
/**
 * Иконка источника для дропдауна. `accentText` — пункт активен (на акцентном
 * фоне → белый для контраста). `brand` — режим брендовых цветов (настройка
 * `accentBadges` выключена): неактивные иконки красятся в фирменный цвет площадки.
 */
const sourceIcon = (id: string, accentText = false, brand = false): ReactNode => {
  if (id === 'soundcloud' || id === 'yandex' || id === 'ytmusic') {
    const Logo = id === 'soundcloud' ? ScLogo : id === 'ytmusic' ? YtmLogo : YmLogo
    // Бренд-цвет в приоритете (в т.ч. на активном пункте — фон-подсветка и так
    // показывает выбор, иначе иконка стала бы тёмной от --accent-text). Без
    // бренд-режима: на активном фоне белый, иначе акцент.
    const color =
      (brand ? providerBrandColor(id) : undefined) ??
      (accentText ? 'var(--accent-text,#fff)' : 'var(--accent)')
    return (
      <span style={{ display: 'flex', color }}>
        <Logo size={17} />
      </span>
    )
  }
  return id === 'local' ? <LibLogo /> : <AllLogo />
}
const sourceLabel = (id: string, providerLabel?: string): string =>
  id === 'all' ? tt('search.allSources') : providerLabel ?? id

export const SourceDropdown = ({ source, onSource }: { source: string; onSource: (s: string) => void }) => {
  useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Попап открывается «из иконки»: выбранный источник ложится ровно на кнопку.
  // Кнопка живёт у верхнего края страницы, поэтому раскладка почти всегда
  // зеркальная (активный первым, список вниз) — это и есть дефолт flip.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [flip, setFlip] = useState(true)
  const flipRef = useRef(true)
  flipRef.current = flip
  usePopupOpenAnimation(panelRef, pos)
  // Бренд-режим иконок (если настройка «акцентные бейджи» выключена).
  const brand = !useBadgePrefs((s) => s.accentBadges)
  // Дропдаун показывает ВСЕ площадки, включая ненастроенные: пользователь видит
  // полный список и может выбрать любую.
  const providers = getAllProviders()
  const options = ['all', ...providers.map((p) => p.id)]
  const labelOf = (id: string) => sourceLabel(id, providers.find((p) => p.id === id)?.label)
  // Стейл/невалидный source (id выключённого/удалённого провайдера в localStorage)
  // показываем как «Все источники» — иначе кнопка светит иконкой «all», но ни один
  // пункт не подсвечен, а поиск (через searchAll-фолбэк) и так идёт по всем.
  const effSource = options.includes(source) ? source : 'all'
  // Столбик только иконок: отдельной группой «все источники» + «моя библиотека»,
  // затем площадки в порядке реестра, и отдельной строкой у кнопки-анкера —
  // ВЫБРАННЫЙ источник, отделённый линией (она же индикатор выбора, подсветки
  // фоном нет). Сторона зависит от раскладки, см. `flip`.
  const meta = ['all', 'local'].filter((id) => options.includes(id) && id !== effSource)
  const plat = providers.map((p) => p.id).filter((id) => id !== 'local' && id !== effSource)

  const srcBtn = (id: string, active: boolean) => (
    <button
      key={id}
      aria-label={labelOf(id)}
      aria-current={active || undefined}
      onClick={() => {
        onSource(id)
        setOpen(false)
      }}
      style={{ color: active ? 'var(--accent)' : 'var(--text2)', cursor: active ? 'default' : 'pointer' }}
    >
      {sourceIcon(id, false, brand)}
    </button>
  )

  // Анкер — сама кнопка (обёртка .ym-srcdd по ней и обжата). Считаем во
  // вьюпорт-координатах и переводим в координаты обёртки: попап позиционируется
  // относительно неё, без портала.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const wrap = ref.current
    const p = panelRef.current
    if (!wrap || !p) return
    const wr = wrap.getBoundingClientRect()
    const r = placeSrcPopup(p, wr, flipRef.current)
    setFlip(r.flip)
    setPos({ left: r.left - wr.left, top: r.top - wr.top })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="ym-srcdd" style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
      <button
        id="ymSrcBtn"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, border: 'none', background: 'none',
          color: 'var(--muted)', borderRadius: '50%', cursor: 'pointer', transition: '.15s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--hover)')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
      >
        <span style={{ display: 'flex' }}>{sourceIcon(effSource, false, brand)}</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          className="bloom-dl-inner bloom-srcp srcp-round"
          style={{
            position: 'absolute', zIndex: 60,
            left: pos?.left ?? -9999, top: pos?.top ?? -9999,
            visibility: pos ? 'visible' : 'hidden',
            transformOrigin: flip ? 'top center' : 'bottom center',
          }}
        >
          {flip && srcBtn(effSource, true)}
          {flip && <div className="bloom-srcp-div" />}
          {meta.map((id) => srcBtn(id, false))}
          {!!meta.length && !!plat.length && <div className="bloom-srcp-div" />}
          {plat.map((id) => srcBtn(id, false))}
          {!flip && <div className="bloom-srcp-div" />}
          {!flip && srcBtn(effSource, true)}
        </div>
      )}
    </div>
  )
}

/* ── Выпадающая история поиска (.sp-hist) ─ */
const RecentDel = () => <Ico name="close" width={13} height={13} />
/** Плейсхолдер-иконка недавнего по типу. */
export const RecentKindIcon = ({ kind }: { kind: string }) => {
  const name: IconName = kind === 'artist' ? 'user' : kind === 'album' ? 'album' : kind === 'track' ? 'note' : 'list'
  return <Ico name={name} width={16} height={16} style={{ opacity: 0.5 }} />
}

/** Строка истории: недавний запрос ИЛИ недавно открытая сущность. */
export type RecentRow =
  | { type: 'search'; ts: number; q: string }
  | { type: 'item'; ts: number; item: RecentItem }

/**
 * Выпадающий список истории под строкой поиска (overlay). Объединяет недавние
 * запросы (иконка-лупа) и недавно открытое (обложка/иконка типа) в один список,
 * отсортированный по времени. Каждая строка — с крестиком удаления; внизу —
 * «Очистить историю».
 */
export const SearchHistoryDropdown = ({
  rows,
  onOpenItem,
  onApplySearch,
  onRemoveItem,
  onRemoveSearch,
}: {
  rows: RecentRow[]
  onOpenItem: (it: RecentItem) => void
  onApplySearch: (q: string) => void
  onRemoveItem: (id: string) => void
  onRemoveSearch: (q: string) => void
}) => {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  usePopupOpenAnimation(ref, rows.length > 0)
  // Ограничиваем высоту по нижнему краю окна, чтобы список не уходил за экран.
  const [maxH, setMaxH] = useState<number>()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // 130px снизу — запас под плеер-бар, 380px — потолок, чтобы список не растягивался на пол-экрана.
    const calc = () =>
      setMaxH(Math.min(380, Math.max(180, window.innerHeight - el.getBoundingClientRect().top - 130)))
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [rows.length])
  return (
    <div
      ref={ref}
      className="sp-hist"
      style={{ transformOrigin: 'top center', maxHeight: maxH }}
      // Клик по строке/крестику не должен снимать фокус с инпута — иначе дропдаун
      // закроется (onBlur) раньше, чем сработает onClick.
      onMouseDown={(e) => e.preventDefault()}
    >
      {rows.map((r) =>
        r.type === 'search' ? (
          <div key={`s:${r.q}`} className="sp-hist-row" onClick={() => onApplySearch(r.q)}>
            <span className="sp-hist-ico"><IconSearch /></span>
            <span className="sp-hist-text">{r.q}</span>
            <button
              className="sp-hist-del"
              aria-label={t('common.clear')}
              onClick={(e) => {
                e.stopPropagation()
                onRemoveSearch(r.q)
              }}
            >
              <RecentDel />
            </button>
          </div>
        ) : (
          <div key={`i:${r.item.id}`} className="sp-hist-row" onClick={() => onOpenItem(r.item)}>
            <span className="sp-hist-ico" style={{ borderRadius: r.item.round ? '50%' : undefined }}>
              {r.item.cover ? <img src={r.item.cover} alt="" /> : <RecentKindIcon kind={r.item.kind} />}
            </span>
            <span className="sp-hist-text">{r.item.title}</span>
            <button
              className="sp-hist-del"
              aria-label={t('common.clear')}
              onClick={(e) => {
                e.stopPropagation()
                onRemoveItem(r.item.id)
              }}
            >
              <RecentDel />
            </button>
          </div>
        ),
      )}
    </div>
  )
}

/* ── Мета-фильтры треков (.sp-dd дропдауны) ───────────────────────────── */
type DdOption = { id: string; label: string }

const Chev = () => <Ico name="arrowDown" className="sp-dd-chev" width={10} height={10} />

const SpDropdown = ({
  icon,
  label,
  value,
  options,
  onPick,
}: {
  icon: ReactNode
  label: string
  value: string
  options: DdOption[]
  onPick: (id: string) => void
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  usePopupOpenAnimation(menuRef, open)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  const isDefault = value === options[0]?.id
  const cur = options.find((o) => o.id === value)
  return (
    <div ref={ref} className={cn('sp-dd', open && 'open')}>
      <button className={cn('sp-dd-btn', !isDefault && 'active')} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span>{isDefault ? label : cur?.label ?? label}</span>
        <Chev />
      </button>
      <div className="sp-dd-menu" ref={menuRef} style={{ transformOrigin: 'top left' }}>
        {options.map((o) => (
          <button
            key={o.id}
            className={cn('sp-dd-opt', o.id === value && 'active')}
            onClick={() => {
              onPick(o.id)
              setOpen(false)
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const DUR_OPTS: { id: string; labelKey: TranslationKey }[] = [
  { id: 'all', labelKey: 'search.opt.anyF' },
  { id: 'short', labelKey: 'search.dur.short' },
  { id: 'mid', labelKey: 'search.dur.mid' },
  { id: 'long', labelKey: 'search.dur.long' },
]
const YEAR_OPTS: { id: string; labelKey?: TranslationKey; label?: string }[] = [
  { id: 'all', labelKey: 'search.opt.any' },
  { id: 'new', label: '2020+' },
  { id: '2010', labelKey: 'search.year.2010s' },
  { id: '2000', labelKey: 'search.year.2000s' },
  { id: 'old', labelKey: 'search.year.old' },
]
const SORT_OPTS: { id: string; labelKey: TranslationKey }[] = [
  { id: 'relevance', labelKey: 'search.sort.relevance' },
  { id: 'new', labelKey: 'search.sort.new' },
]

const IcoClock = () => <Ico name="clock" width={11} height={11} />
const IcoCal = () => <Ico name="calendar" width={11} height={11} />
const IcoSort = () => <Ico name="sort" width={11} height={11} />
const IcoGenre = () => <Ico name="note" width={11} height={11} />

/* ── Профиль по ссылке /username (hero + плейлисты + лайки) ── */
const ProfileView = ({
  profile,
  onOpenArtist,
  onApplyToAccount,
  onOpenPlaylist,
  onPlayTrack,
  onCtxMenu,
  onImportPlaylists,
  onImportLikes,
  onLikesAsPlaylist,
  onAddTrack,
}: {
  profile: ProfileData
  onOpenArtist: () => void
  onApplyToAccount: () => void
  onOpenPlaylist: (p: Playlist) => void
  onPlayTrack: (id: string) => void
  onCtxMenu: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
  onImportPlaylists: () => void
  onImportLikes: () => void
  onLikesAsPlaylist: () => void
  onAddTrack: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
}) => {
  const t = useT()
  const { artist, playlists, likes } = profile
  const [likesShown, setLikesShown] = useState(30) // «показать ещё» лайки (+30)
  const av = artist.avatar ?? null
  const followers = fmtFollowers(artist.followers)
  return (
    <div className="sp-profile">
      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'calc(var(--radius)*.8)', marginBottom: 16 }}>
        {av ? (
          <div style={{ position: 'absolute', inset: -30, background: `url(${av}) center top/cover`, filter: 'blur(38px)', opacity: 0.55, transform: 'scale(1.12)' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--hover)' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,.7) 100%)' }} />
        <div style={{ position: 'relative', zIndex: 2, padding: '24px 24px 22px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            onClick={onOpenArtist}
            style={{ width: 100, height: 100, borderRadius: '50%', background: 'var(--hover)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid rgba(var(--ovl-rgb),.2)', boxShadow: '0 8px 28px rgba(0,0,0,.6)', cursor: 'pointer' }}
          >
            <Cover src={av} placeholder={<PhArtist />} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>
              {artist.name}
            </div>
            {(artist.fullName || followers) && (
              <div style={{ fontSize: 12, color: 'rgba(var(--ovl-rgb),.45)' }}>
                {[artist.fullName, followers ? t('search.followers', { n: followers }) : null].filter(Boolean).join(' · ')}
              </div>
            )}
            {artist.description && (
              <ExpandDesc
                text={artist.description}
                style={{ fontSize: 12, color: 'rgba(var(--ovl-rgb),.35)', lineHeight: 1.6, marginTop: 7, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxWidth: 420, cursor: 'pointer' }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
              <button
                onClick={onOpenArtist}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'calc(var(--radius)*.6)', background: 'var(--text)', color: 'var(--bg)', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
              >
                <Ico name="play" variant="bold" width={10} height={10} />
                {t('search.tab.tracks')}
              </button>
              {/* «Профиль» — применить ник/аватар SoundCloud к аккаунту
. */}
              <button
                onClick={onApplyToAccount}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'calc(var(--radius)*.6)', background: 'rgba(var(--ovl-rgb),.12)', border: '1px solid rgba(var(--ovl-rgb),.18)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Ico name="user" width={10} height={10} />
                {t('search.profile')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Плейлисты */}
      {playlists.length > 0 && (
        <>
          <div className="sc-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{t('search.tab.playlists')} · {playlists.length}</span>
            <button
              onClick={onImportPlaylists}
              style={{ background: 'rgba(var(--ovl-rgb),.06)', border: '1px solid var(--border)', borderRadius: 'calc(var(--radius)*.5)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '3px 10px', fontFamily: 'inherit' }}
            >
              {t('search.importAll')}
            </button>
          </div>
          <div className="sp-pl-grid">
            {playlists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} onOpen={() => onOpenPlaylist(p)} />
            ))}
          </div>
        </>
      )}

      {/* Лайки */}
      {likes.length > 0 && (
        <>
          <div className="sc-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 4px' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{t('search.likes')} · {likes.length}</span>
            <div style={{ display: 'flex', gap: 5 }}>
              <button
                onClick={onImportLikes}
                style={{ background: 'var(--accent)', border: 'none', borderRadius: 'calc(var(--radius)*.5)', color: 'var(--accent-text,#fff)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '3px 10px', fontFamily: 'inherit' }}
              >
                {t('search.importAll')}
              </button>
              <button
                onClick={onLikesAsPlaylist}
                style={{ background: 'rgba(var(--ovl-rgb),.06)', border: '1px solid var(--border)', borderRadius: 'calc(var(--radius)*.5)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '3px 10px', fontFamily: 'inherit' }}
              >
                {t('search.asPlaylist')}
              </button>
            </div>
          </div>
          {/* Лайки — вертикальный список строк (удобно листать + «Показать ещё»). */}
          <div>
            {likes.slice(0, likesShown).map((t) => (
              <TrackListRow
                key={t.id}
                track={t}
                onPlay={() => onPlayTrack(t.id)}
                onCtxMenu={(e) => onCtxMenu(e, t)}
                onAddClick={(e) => onAddTrack(e, t)}
              />
            ))}
          </div>
          {likes.length > likesShown && (
            <button
              onClick={() => setLikesShown((n) => n + 30)}
              style={{
                display: 'block', width: '100%', marginTop: 8, padding: 9,
                borderRadius: 'var(--radius)', background: 'transparent',
                border: '1px solid var(--ovl-line)', color: 'var(--text2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {t('search.showMore')}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ── Скелет загрузки выдачи (переиспользует .sk-block из DetailView) ── */
const SkCard = () => (
  <div className="sp-track-card" style={{ pointerEvents: 'none' }}>
    <div className="sp-tc-cover"><div className="sk-block" style={{ width: '100%', height: '100%' }} /></div>
    <div className="sp-tc-info">
      <div className="sk-block" style={{ height: 12, width: '85%', borderRadius: 6, marginBottom: 7 }} />
      <div className="sk-block" style={{ height: 10, width: '55%', borderRadius: 6 }} />
    </div>
  </div>
)
const SkArtist = () => (
  <div className="sp-artist-card" style={{ pointerEvents: 'none' }}>
    <div className="sk-block" style={{ width: '88%', aspectRatio: 1, borderRadius: '50%' }} />
    {/* Отступы вручную: у карточки gap:0 (имя и подписчики стоят вплотную). */}
    <div className="sk-block" style={{ height: 12, width: '75%', borderRadius: 6, marginTop: 10 }} />
    <div className="sk-block" style={{ height: 10, width: '45%', borderRadius: 6, marginTop: 5 }} />
  </div>
)
const SkListRow = () => (
  <div className="sk-listrow">
    <div className="sk-block" style={{ width: 42, height: 42, borderRadius: 'calc(var(--radius)*.6)', flexShrink: 0 }} />
    <div className="sk-txt">
      <div className="sk-block" style={{ height: 12, width: '40%', borderRadius: 6, marginBottom: 7 }} />
      <div className="sk-block" style={{ height: 10, width: '25%', borderRadius: 6 }} />
    </div>
  </div>
)
const SkSecTitle = ({ w = 120 }: { w?: number }) => (
  <div className="sk-block" style={{ height: 16, width: w, borderRadius: 6, marginBottom: 14 }} />
)

/**
 * Скелет выдачи поиска: повторяет раскладку активного таба, чтобы при загрузке
 * ничего «не прыгало». Раньше тут был центральный спиннер — скелет живее.
 */
const SearchSkeleton = ({ tab }: { tab: SearchTab }) => {
  if (tab === 'tracks')
    return (
      <div className="sc-uni-section">
        <SkSecTitle />
        {Array.from({ length: 8 }).map((_, i) => (
          <SkListRow key={i} />
        ))}
      </div>
    )
  if (tab === 'artists')
    return (
      <div className="sc-uni-section">
        <SkSecTitle />
        <div className="sp-artist-grid">{Array.from({ length: 7 }).map((_, i) => <SkArtist key={i} />)}</div>
      </div>
    )
  if (tab === 'playlists' || tab === 'albums')
    return (
      <div className="sc-uni-section">
        <SkSecTitle />
        <div className="sp-pl-grid sp-pl-grid-lg">{Array.from({ length: 6 }).map((_, i) => <SkCard key={i} />)}</div>
      </div>
    )
  // 'all' — ряд карточек треков + ряд артистов
  return (
    <>
      <div className="sc-uni-section">
        <SkSecTitle />
        <div className="sp-track-grid">{Array.from({ length: 6 }).map((_, i) => <SkCard key={i} />)}</div>
      </div>
      <div className="sc-uni-section">
        <SkSecTitle w={90} />
        <div className="sp-artist-grid">{Array.from({ length: 7 }).map((_, i) => <SkArtist key={i} />)}</div>
      </div>
    </>
  )
}

export interface SearchPageProps {
  active: boolean
}

/**
 * Экран поиска `#page-search` (`.search-page` / `.sp-header` /
 * `.sp-*` карточки), но рендерит нормализованную выдачу ВСЕХ провайдеров
 * (@features/providers · searchAll) — один дизайн на все площадки.
 * ПКМ по треку → `TrackCtxMenu`:
 * play / в библиотеку / fav / в плейлист / в очередь. SC-трек при fav/добавлении
 * персистится в библиотеку (saveTrackToLibrary).
 */
export const SearchPage = ({ active }: SearchPageProps) => {
  const t = useT()
  useLocale()
  const query = useSearchStore((s) => s.query)
  const submitted = useSearchStore((s) => s.submitted)
  const results = useSearchStore((s) => s.results)
  const loading = useSearchStore((s) => s.loading)
  const searched = useSearchStore((s) => s.searched)
  const setQuery = useSearchStore((s) => s.setQuery)
  const runSearch = useSearchStore((s) => s.runSearch)
  const clear = useSearchStore((s) => s.clear)
  const source = useSearchStore((s) => s.source)
  const setSource = useSearchStore((s) => s.setSource)
  const tab = useSearchStore((s) => s.tab)
  const setTab = useSearchStore((s) => s.setTab)
  const durFilter = useSearchStore((s) => s.durFilter)
  const yearFilter = useSearchStore((s) => s.yearFilter)
  const genreFilter = useSearchStore((s) => s.genreFilter)
  const sortOrder = useSearchStore((s) => s.sortOrder)
  const setDurFilter = useSearchStore((s) => s.setDurFilter)
  const setYearFilter = useSearchStore((s) => s.setYearFilter)
  const setGenreFilter = useSearchStore((s) => s.setGenreFilter)
  const setSortOrder = useSearchStore((s) => s.setSortOrder)
  const loadMoreTracks = useSearchStore((s) => s.loadMoreTracks)
  const loadingMore = useSearchStore((s) => s.loadingMore)
  const recentSearches = useSearchStore((s) => s.recentSearches)
  const recentItems = useSearchStore((s) => s.recentItems)
  const removeRecentItem = useSearchStore((s) => s.removeRecentItem)
  const removeRecentSearch = useSearchStore((s) => s.removeRecentSearch)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const goNav = useNavStore((s) => s.goNav)
  const createPl = usePlaylistStore((s) => s.createPl)
  const reorderPlTracks = usePlaylistStore((s) => s.reorderPlTracks)
  const profile = useSearchStore((s) => s.profile)
  // Открыт ли оверлей детального вида — пока он есть, история под строкой поиска
  // не должна всплывать поверх него (см. blurInput при переходе из истории).
  const detailOpen = useDetailOpen()

  // Открытие детального вида + запись в «недавно открытые» — общие хелперы с
  // всплывающим поиском (см. lib/openActions).
  const openArtist = openArtistFromSearch
  const openPlaylist = openPlaylistFromSearch

  // ── Применить профиль SoundCloud к аккаунту: ник = username, аватар = avatar профиля. ──
  const applyProfileToAccount = () => {
    if (!profile) return
    const { name, avatar } = profile.artist
    useProfileStore.getState().setProfile({
      name,
      ...(avatar ? { avatar } : {}),
    })
    toast(t('search.toast.scApplied', { name }))
  }

  // ── Импорт из профиля ──
  const importLikes = () => {
    if (!profile) return
    let added = 0
    profile.likes.forEach((t) => {
      if (saveTrackToLibrary(t)) added++
    })
    toast(added ? t('search.toast.added', { n: added }) : t('search.toast.allInLib'))
  }
  const likesAsPlaylist = () => {
    if (!profile || !profile.likes.length) return
    // SC user-id (из entity id `sc_artist_<id>`) — источник «Обновить треки».
    const userId = profile.artist.id.replace(/^sc_artist_/, '')
    const plName = t('search.likesName', { name: profile.artist.name })
    const pl = createPl(plName, undefined, profile.artist.avatar ?? undefined, {
      sources: userId ? [{ kind: 'scLikes', userId, title: plName }] : undefined,
    })
    profile.likes.forEach((t) => saveTrackToLibrary(t))
    reorderPlTracks(pl.id, profile.likes.map((t) => t.id))
    toast(t('search.toast.plCreated', { n: profile.likes.length }))
  }
  const importPlaylists = async () => {
    if (!profile || !profile.playlists.length) return
    toast(t('search.toast.importing'))
    let ok = 0
    for (const p of profile.playlists) {
      try {
        const prov = getProvider(p.source ?? 'soundcloud')
        if (!prov?.getPlaylist) continue
        const { playlist, tracks: trs } = await prov.getPlaylist(p.id)
        // sourceUrl площадки — сразу источник «Обновить треки».
        const pl = createPl(playlist.title, undefined, playlist.cover ?? undefined, playlist.sourceUrl
          ? { sources: [{ kind: 'url', url: playlist.sourceUrl, title: playlist.title }] }
          : undefined)
        trs.forEach((t) => saveTrackToLibrary(t))
        reorderPlTracks(pl.id, trs.map((t) => t.id))
        ok++
      } catch {
        /* пропускаем неудачный плейлист */
      }
    }
    toast(ok ? t('search.toast.importedPl', { n: ok }) : t('search.toast.importFail'))
  }

  const { artists, playlists, albums, tracks } = results
  const empty = !artists.length && !playlists.length && !albums.length && !tracks.length

  // Фокус инпута — управляет показом выпадающей истории.
  const [focused, setFocused] = useState(false)
  // Зона табов+фильтров раскрывается только по наведению на саму строку поиска
  // (наведение на её собственную полоску ничего не открывает), а закрывается при
  // выходе курсора из общей верхней зоны — чтобы можно было спуститься к табам.
  const [filtersHover, setFiltersHover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Снять фокус с инпута при переходе из истории. `.sp-hist` гасит mousedown
  // (чтобы клик по строке не закрывал список через onBlur), поэтому инпут
  // сохраняет реальный DOM-фокус — без явного blur стрелочное событие фокуса
  // позже вернуло бы `focused=true`, и список всплыл бы поверх DetailView.
  const blurInput = () => {
    setFocused(false)
    inputRef.current?.blur()
  }

  // Контекстное меню трека + создание плейлиста под трек.
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; track: Track } | null>(null)
  // «Новый плейлист» из поиска: уходим в библиотеку и создаём плейлист с этим
  // (ещё не библиотечным) треком сразу в inline-редакте.
  const createPlForTrack = (track: Track | null) => {
    if (!track) return
    goNav('lib')
    createPlaylistInline({ track })
  }
  const onCtxMenu = (e: ReactMouseEvent<HTMLElement>, track: Track) => {
    e.preventDefault()
    setCtx({ pos: { x: e.clientX, y: e.clientY }, track })
  }

  // Поповер «+» для строк трек-списка (вкладка «Треки») — как в DetailView.
  const addAnchorRef = useRef<HTMLElement | null>(null)
  // Скролл-контейнер результатов (#spScScroll) — для оконной виртуализации.
  const spScrollRef = useRef<HTMLDivElement | null>(null)
  const [addTrack, setAddTrack] = useState<Track | null>(null)
  const onAddTrack = (e: ReactMouseEvent<HTMLElement>, track: Track) => {
    e.stopPropagation()
    const btn = e.currentTarget
    if (addTrack?.id === track.id && addAnchorRef.current === btn) {
      setAddTrack(null)
      return
    }
    addAnchorRef.current = btn
    setAddTrack(track)
  }

  // Live-поиска по вводу НЕТ: набор текста ничего не запрашивает, запрос уходит
  // только по Enter (runSearch сам определяет URL и резолвит ссылку в карточку).
  const onChange = (v: string) => {
    setQuery(v)
    // Поле опустошили — сбрасываем выдачу и возвращаем стартовый вид.
    if (!v.trim()) clear()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void runSearch()
  }

  // scPlaySearchResult/_scPlayStream: клик по
  // результату поиска ставит очередь ИЗ ОДНОГО трека, а не из всей выдачи.
  const playTrack = (id: string) => playSingleTrack(id)

  // Проигрывание трека ИЗ ПОИСКА + запись в «недавно открытые» и клик по элементу
  // «недавно открытые» — общие с всплывающим поиском (lib/openActions).
  const playTrackFromSearch = playSearchTrack
  const onRecentItem = openRecentItem

  // ── Client-side мета-фильтры треков (dur/year/genre) ──
  const trackSec = (dur?: string): number => {
    if (!dur) return 0
    const p = dur.split(':').map((x) => parseInt(x, 10))
    if (p.some((n) => Number.isNaN(n))) return 0
    return p.length === 2 ? p[0]! * 60 + p[1]! : p.length === 3 ? p[0]! * 3600 + p[1]! * 60 + p[2]! : 0
  }
  const passDur = (t: Track) => {
    if (durFilter === 'all') return true
    const s = trackSec(t.dur)
    return durFilter === 'short' ? s < 180 : durFilter === 'mid' ? s >= 180 && s <= 420 : s > 420
  }
  const passYear = (t: Track) => {
    if (yearFilter === 'all') return true
    const y = parseInt(t.year ?? '', 10)
    if (Number.isNaN(y)) return false
    return yearFilter === 'new' ? y >= 2020
      : yearFilter === '2010' ? y >= 2010 && y < 2020
      : yearFilter === '2000' ? y >= 2000 && y < 2010
      : y < 2000
  }
  const trackGenre = (t: Track): string => (t.genres && t.genres[0]) || ''
  const passGenre = (t: Track) =>
    !genreFilter || trackGenre(t).toLowerCase() === genreFilter.toLowerCase()
  const filteredTracks = tracks.filter((t) => passDur(t) && passYear(t) && passGenre(t))
  // Опции жанра — уникальные основные жанры из выдачи.
  const genreOptions: DdOption[] = [
    { id: 'all', label: t('search.opt.any') },
    ...Array.from(new Set(tracks.map(trackGenre).filter(Boolean)))
      .slice(0, 12)
      .map((g) => ({ id: g, label: g })),
  ]

  // Что показываем в теле — по ОТПРАВЛЕННОМУ запросу, а не по тексту в поле:
  // пока не нажали Enter, набор текста не двигает вёрстку и не гасит выдачу.
  const hasQuery = submitted.trim().length > 0
  // Пустой старт (нет запроса и профиля) → строка поиска по центру; история — в
  // выпадающем списке под строкой. Появился запрос → строка уезжает наверх.
  const centered = !hasQuery && !profile
  const showProfile = !loading && !!profile // ссылка на профиль /username — инлайн hero
  const showResults = !loading && !profile && hasQuery && !empty
  const showNotFound = !loading && !profile && hasQuery && searched && empty
  // Объединённая история (запросы + открытое) по убыванию времени — для дропдауна.
  const mergedRecents: RecentRow[] = [
    ...recentSearches.map((s) => ({ type: 'search' as const, ts: s.ts, q: s.q })),
    ...recentItems.map((it) => ({ type: 'item' as const, ts: it.ts ?? 0, item: it })),
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 12)
  // История прячется, как только в поле что-то набрали (даже до Enter).
  const showHistory = focused && !query.trim() && !detailOpen && mergedRecents.length > 0
  // Фильтрация секций по активному табу.
  const showTracks = (tab === 'all' || tab === 'tracks') && filteredTracks.length > 0
  const showArtists = (tab === 'all' || tab === 'artists') && artists.length > 0
  const showPlaylists = (tab === 'all' || tab === 'playlists') && playlists.length > 0
  const showAlbums = (tab === 'all' || tab === 'albums') && albums.length > 0
  // Мета-фильтры показываем когда видим треки (таб «Все»/«Треки» и они есть).
  const showMeta = showResults && (tab === 'all' || tab === 'tracks') && tracks.length > 0
  // Раскладка по табу: 'tracks' → вертикальный список; одиночные арт/пл/альб → wrap;
  // 'all' → горизонтальные ряды (.sp-filter-list / .sp-filter-wrap).
  const layoutClass =
    tab === 'tracks' ? 'sp-filter-list' : tab === 'all' ? '' : 'sp-filter-wrap'

  return (
    <div className={cn('page', active && 'active')} id="page-search" style={{ position: 'relative' }}>
      <div className={cn('search-page', centered && 'sp-centered')}>
        <div className="sp-spacer" aria-hidden />
        <div className="sp-top-zone" onMouseLeave={() => setFiltersHover(false)}>
        <div className="sp-header sp-header-sc" onMouseEnter={() => setFiltersHover(true)}>
          <div className="sp-inp-wrap">
            <IconSearch />
            <input
              ref={inputRef}
              id="spInput"
              value={query}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={t('search.placeholder')}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button id="spClear" className="visible" onClick={clear}>
                <IconClose />
              </button>
            )}
            <SourceDropdown source={source} onSource={setSource} />
            {showHistory && (
              <SearchHistoryDropdown
                rows={mergedRecents}
                onOpenItem={(it) => {
                  blurInput()
                  onRecentItem(it)
                }}
                onApplySearch={(q) => {
                  blurInput()
                  setQuery(q)
                  void runSearch(q)
                }}
                onRemoveItem={removeRecentItem}
                onRemoveSearch={removeRecentSearch}
              />
            )}
          </div>
        </div>

        {!profile && (
          <div className={cn('sp-filter-zone', filtersHover && 'open')}>
            <div className="sp-filter-zone-in">
            <FilterTabs tab={tab} onTab={setTab} />

            {showMeta && (
              <div
                id="spMetaFilters"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '2px 28px 10px',
                  flexShrink: 0, flexWrap: 'wrap',
                }}
              >
                <SpDropdown icon={<IcoClock />} label={t('search.dd.duration')} value={durFilter} options={DUR_OPTS.map((o) => ({ id: o.id, label: t(o.labelKey) }))} onPick={(v) => setDurFilter(v as never)} />
                <SpDropdown icon={<IcoCal />} label={t('lib.ti.year')} value={yearFilter} options={YEAR_OPTS.map((o) => ({ id: o.id, label: o.labelKey ? t(o.labelKey) : o.label! }))} onPick={(v) => setYearFilter(v as never)} />
                <SpDropdown icon={<IcoSort />} label={t('lib.plmenu.sort')} value={sortOrder} options={SORT_OPTS.map((o) => ({ id: o.id, label: t(o.labelKey) }))} onPick={(v) => setSortOrder(v as never)} />
                {genreOptions.length > 1 && (
                  <SpDropdown
                    icon={<IcoGenre />}
                    label={t('search.dd.genre')}
                    value={genreFilter ?? 'all'}
                    options={genreOptions}
                    onPick={(v) => setGenreFilter(v === 'all' ? null : v)}
                  />
                )}
              </div>
            )}
            </div>
          </div>
        )}
        </div>

        <div
          id="spScScroll"
          ref={spScrollRef}
          style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 28px 28px' }}
        >
          <div id="spScResults" className={layoutClass}>
            {loading && <SearchSkeleton tab={tab} />}

            {showProfile && profile && (
              <ProfileView
                profile={profile}
                onOpenArtist={() => openArtist(profile.artist)}
                onApplyToAccount={applyProfileToAccount}
                onOpenPlaylist={(p) => openPlaylist(p, 'playlist')}
                onPlayTrack={playTrack}
                onCtxMenu={onCtxMenu}
                onImportPlaylists={() => void importPlaylists()}
                onImportLikes={importLikes}
                onLikesAsPlaylist={likesAsPlaylist}
                onAddTrack={onAddTrack}
              />
            )}

            {showNotFound && (
              <div className="sc-status">{t('search.noResultsFor', { q: submitted })}</div>
            )}

            {showResults && (
              <>
                {showTracks && (
                  <div className="sc-uni-section" data-sp-section="tracks">
                    <div className="sp-sec-title">{t('search.tab.tracks')}</div>
                    <div className="sp-track-grid" id="spTrackGrid">
                      {/* Вкладка «Треки» → строки списка (.tr, оконная
                          виртуализация); «Все» → лента карточек. */}
                      {tab === 'tracks'
                        ? (
                            <WindowedRows
                              items={filteredTracks}
                              scrollRef={spScrollRef}
                              estimate={68}
                              renderItem={(t, i) => (
                                <TrackListRow
                                  key={t.id}
                                  track={t}
                                  widx={i}
                                  onPlay={() => playTrackFromSearch(t)}
                                  onCtxMenu={(e) => onCtxMenu(e, t)}
                                  onAddClick={(e) => onAddTrack(e, t)}
                                />
                              )}
                            />
                          )
                        : filteredTracks.map((t) => (
                            <TrackCard
                              key={t.id}
                              track={t}
                              onPlay={() => playTrackFromSearch(t)}
                              onCtxMenu={onCtxMenu}
                            />
                          ))}
                      {results.tracksHasMore && (
                        <button
                          className="sc-load-more-card"
                          id="spLoadMoreBtn"
                          disabled={loadingMore}
                          onClick={() => void loadMoreTracks()}
                        >
                          {loadingMore ? (
                            <div className="sc-spinner" />
                          ) : (
                            <Ico name="arrowRight" width={20} height={20} />
                          )}
                          {t('common.more')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {showArtists && (
                  <div className="sc-uni-section" data-sp-section="artists">
                    <div className="sp-sec-title">{t('search.tab.artists')}</div>
                    <div className="sp-artist-grid">
                      {artists.map((a) => (
                        <ArtistCard key={a.id} artist={a} onOpen={() => openArtist(a)} />
                      ))}
                    </div>
                  </div>
                )}

                {showPlaylists && (
                  <div className="sc-uni-section" data-sp-section="playlists">
                    <div className="sp-sec-title">{t('search.tab.playlists')}</div>
                    {/* Отдельным табом — крупная сетка (.sp-pl-grid-lg); в «Все» остаётся ряд. */}
                    <div className={cn('sp-pl-grid', tab !== 'all' && 'sp-pl-grid-lg')}>
                      {playlists.map((p) => (
                        <PlaylistCard key={p.id} playlist={p} onOpen={() => openPlaylist(p, 'playlist')} />
                      ))}
                    </div>
                  </div>
                )}

                {showAlbums && (
                  <div className="sc-uni-section" data-sp-section="albums">
                    <div className="sp-sec-title">{t('search.tab.albums')}</div>
                    <div className={cn('sp-pl-grid', tab !== 'all' && 'sp-pl-grid-lg')}>
                      {albums.map((p) => (
                        <PlaylistCard key={p.id} playlist={p} onOpen={() => openPlaylist(p, 'album')} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <TrackCtxMenu
        pos={ctx?.pos ?? null}
        track={ctx?.track ?? null}
        onClose={() => setCtx(null)}
        onCreatePlaylistForTrack={(id) =>
          createPlForTrack(tracks.find((t) => t.id === id) ?? null)
        }
      />

      {/* Поповер «+» для строк трек-списка: плейлисты + «В библиотеку». */}
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
