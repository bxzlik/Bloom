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
import { ArtistLinks, CoverSourceBadge, CoverProviderBadge, ScLogo, YmLogo, YtmLogo, SpLogo, providerBrandColor, trackRegistry } from '@entities/track'
import { useBadgePrefs } from '@shared/lib/badgePrefs'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import { playFromSource, AddPopup } from '@features/player'
import { getAllProviders, getProvider, type ProfileData } from '@features/providers'
import { useProfileStore } from '@features/profile'
import { toast } from '@shared/ui'
import { useT, useLocale, t as tt, type TranslationKey } from '@shared/i18n'
import {
  TrackCtxMenu,
  NewPlaylistModal,
  saveTrackToLibrary,
  usePlaylistStore,
  useFavStore,
  useLibStore,
} from '@features/library'
import { useSearchStore, looksLikeUrl, type SearchTab, type RecentItem } from '../model/store'
import { useDetailStore, type DetailTarget } from '../model/detailStore'

/* ── Иконки page-search ─────────────────────────────── */
const IconSearch = () => (
  <svg
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
    style={{ flexShrink: 0, opacity: 0.5 }}
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)
const IconClose = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
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
const PhTrack = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.3 }}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
)
const PhArtist = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

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
  <div className="sp-track-card" onClick={onPlay} onContextMenu={(e) => onCtxMenu(e, track)}>
    <div className="sp-tc-cover">
      <Cover src={track.cover} placeholder={<PhTrack />} />
      <CoverSourceBadge track={track} size={26} />
      <PlayBadge />
    </div>
    <div className="sp-tc-info">
      <div className="sp-tc-name">{track.name}</div>
      <div className="sp-tc-artist">
        <ArtistLinks artist={track.artist} scId={track.artistScId} permalink={track.artistPermalink} artistId={track.artistId} provider={track.artistProvider} />
      </div>
    </div>
  </div>
)

const ArtistCard = ({ artist, onOpen }: { artist: Artist; onOpen: () => void }) => {
  const t = useT()
  return (
  <div className="sp-artist-card" onClick={onOpen} style={{ cursor: 'pointer' }}>
    <div className="sp-ac-av">
      <Cover src={artist.avatar} placeholder={<PhArtist />} />
    </div>
    <div className="sp-ac-name">{artist.name}</div>
    <div className="sp-ac-sub">{t('search.kind.artist')}</div>
  </div>
  )
}

const PlaylistCard = ({ playlist, onOpen }: { playlist: Playlist; onOpen: () => void }) => (
  <div className="sp-track-card" onClick={onOpen} style={{ cursor: 'pointer' }}>
    <div className="sp-tc-cover">
      <Cover src={playlist.cover} placeholder={<PhTrack />} />
      <CoverProviderBadge provider={playlist.source} size={26} />
      <PlayBadge />
    </div>
    <div className="sp-tc-info">
      <div className="sp-tc-name">{playlist.title}</div>
      <div className="sp-tc-artist">
        {playlist.ownerName ? `${playlist.ownerName} · ` : ''}
        {playlist.trackCount ?? 0} тр.
      </div>
    </div>
  </div>
)

/* ── Строка трека (.tr) для вкладки «Треки» _spSearchListRowHTML ─ */
const TrackListRow = ({
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
        <button className={`ib${isFav ? ' fav' : ''}`} onClick={onFav} aria-label={tr('player.aria.favAdd')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
        </button>
        <button className="ib" onClick={onAddClick} aria-label={tr('player.aria.add')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      {track.dur && <div className="trd">{track.dur}</div>}
    </div>
  )
}

/* ── Табы-категории (.sp-filter-tabs) spFilterTabs ──────── */
const TABS: { id: SearchTab; labelKey: TranslationKey; icon: ReactNode }[] = [
  {
    id: 'all',
    labelKey: 'search.tab.all',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'tracks',
    labelKey: 'search.tab.tracks',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    id: 'artists',
    labelKey: 'search.tab.artists',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'playlists',
    labelKey: 'search.tab.playlists',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
        <circle cx="3" cy="6" r="1" fill="currentColor" /><circle cx="3" cy="12" r="1" fill="currentColor" /><circle cx="3" cy="18" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'albums',
    labelKey: 'search.tab.albums',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
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
        {it.icon}
        {tr(it.labelKey)}
      </button>
    ))}
  </div>
  )
}

/* ── Дропдаун выбора источника ────────────────── */
const LibLogo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
)
const AllLogo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

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
  if (id === 'soundcloud' || id === 'yandex' || id === 'ytmusic' || id === 'spotify') {
    const Logo = id === 'soundcloud' ? ScLogo : id === 'ytmusic' ? YtmLogo : id === 'spotify' ? SpLogo : YmLogo
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

const SourceDropdown = ({ source, onSource }: { source: string; onSource: (s: string) => void }) => {
  useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  usePopupOpenAnimation(panelRef, open)
  // Бренд-режим иконок (если настройка «акцентные бейджи» выключена).
  const brand = !useBadgePrefs((s) => s.accentBadges)
  // Дропдаун показывает ВСЕ площадки (вкл. ненастроенные — напр. Spotify без
  // Premium): пользователь видит полный список и может выбрать любую.
  const providers = getAllProviders()
  const options = ['all', ...providers.map((p) => p.id)]
  const labelOf = (id: string) => sourceLabel(id, providers.find((p) => p.id === id)?.label)
  // Стейл/невалидный source (id выключённого/удалённого провайдера в localStorage)
  // показываем как «Все источники» — иначе кнопка светит иконкой «all», но ни один
  // пункт не подсвечен, а поиск (через searchAll-фолбэк) и так идёт по всем.
  const effSource = options.includes(source) ? source : 'all'

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
          style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 60,
            display: 'flex', flexDirection: 'column', gap: 2, padding: 6,
            background: 'color-mix(in srgb,var(--block-color),var(--text) 1%)', border: '1px solid var(--border)',
            borderRadius: 'calc(var(--radius)*.85)', boxShadow: '0 10px 34px rgba(0,0,0,.45)', minWidth: 160,
            transformOrigin: 'top right',
          }}
        >
          {options.map((id) => {
            const active = id === effSource
            return (
              <button
                key={id}
                onClick={() => {
                  onSource(id)
                  setOpen(false)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  border: 'none', borderRadius: 'calc(var(--radius)*.6)', cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 12, fontWeight: active ? 700 : 500,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--accent-text,#fff)' : 'var(--text2)', transition: '.15s', textAlign: 'left',
                }}
                onMouseOver={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--hover)'
                }}
                onMouseOut={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ display: 'flex', width: 18, justifyContent: 'center' }}>{sourceIcon(id, active, brand)}</span>
                {labelOf(id)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Выпадающая история поиска (.sp-hist) ─ */
const RecentDel = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
/** Плейсхолдер-иконка недавнего по типу. */
const RecentKindIcon = ({ kind }: { kind: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ opacity: 0.5 }}>
    {kind === 'artist' ? (
      <>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
      </>
    ) : kind === 'album' ? (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="3" x2="12" y2="9" />
      </>
    ) : kind === 'track' ? (
      <>
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </>
    ) : (
      <>
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
      </>
    )}
  </svg>
)

/** Строка истории: недавний запрос ИЛИ недавно открытая сущность. */
type RecentRow =
  | { type: 'search'; ts: number; q: string }
  | { type: 'item'; ts: number; item: RecentItem }

/**
 * Выпадающий список истории под строкой поиска (overlay). Объединяет недавние
 * запросы (иконка-лупа) и недавно открытое (обложка/иконка типа) в один список,
 * отсортированный по времени. Каждая строка — с крестиком удаления; внизу —
 * «Очистить историю».
 */
const SearchHistoryDropdown = ({
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
    const calc = () => setMaxH(Math.max(180, window.innerHeight - el.getBoundingClientRect().top - 16))
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

const Chev = () => (
  <svg className="sp-dd-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

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

const IcoClock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
)
const IcoCal = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
)
const IcoSort = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="11" y1="18" x2="13" y2="18" /></svg>
)
const IcoGenre = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
)

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
  onCtxMenu: (e: ReactMouseEvent<HTMLDivElement>, track: Track) => void
  onImportPlaylists: () => void
  onImportLikes: () => void
  onLikesAsPlaylist: () => void
  onAddTrack: (e: ReactMouseEvent<HTMLElement>, track: Track) => void
}) => {
  const t = useT()
  const { artist, playlists, likes } = profile
  const [likesShown, setLikesShown] = useState(30) // «показать ещё» лайки (+30)
  const av = artist.avatar ?? null
  const followers =
    artist.followers != null
      ? artist.followers >= 1_000_000
        ? (artist.followers / 1_000_000).toFixed(1) + 'M'
        : artist.followers >= 1000
          ? (artist.followers / 1000).toFixed(0) + 'K'
          : String(artist.followers)
      : null
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
            style={{ width: 100, height: 100, borderRadius: '50%', background: 'var(--hover)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid rgba(255,255,255,.2)', boxShadow: '0 8px 28px rgba(0,0,0,.6)', cursor: 'pointer' }}
          >
            <Cover src={av} placeholder={<PhArtist />} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>
              {artist.name}
            </div>
            {(artist.fullName || followers) && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>
                {[artist.fullName, followers ? t('search.followers', { n: followers }) : null].filter(Boolean).join(' · ')}
              </div>
            )}
            {artist.description && (
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', lineHeight: 1.6, marginTop: 7, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxWidth: 420 }}>
                {artist.description}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
              <button
                onClick={onOpenArtist}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'calc(var(--radius)*.6)', background: '#fff', color: '#111', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" /></svg>
                {t('search.tab.tracks')}
              </button>
              {/* «Профиль» — применить ник/аватар SoundCloud к аккаунту
. */}
              <button
                onClick={onApplyToAccount}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'calc(var(--radius)*.6)', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
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
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', borderRadius: 'calc(var(--radius)*.5)', color: 'var(--text2)', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: '3px 10px', fontFamily: 'inherit' }}
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
                style={{ background: 'var(--accent)', border: 'none', borderRadius: 'calc(var(--radius)*.5)', color: 'var(--accent-text,#fff)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', padding: '3px 10px', fontFamily: 'inherit' }}
              >
                {t('search.importAll')}
              </button>
              <button
                onClick={onLikesAsPlaylist}
                style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', borderRadius: 'calc(var(--radius)*.5)', color: 'var(--text2)', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: '3px 10px', fontFamily: 'inherit' }}
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
                border: '1px solid rgba(255,255,255,var(--wb))', color: 'var(--text2)',
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
  const pushRecentItem = useSearchStore((s) => s.pushRecentItem)
  const removeRecentItem = useSearchStore((s) => s.removeRecentItem)
  const removeRecentSearch = useSearchStore((s) => s.removeRecentSearch)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const createPl = usePlaylistStore((s) => s.createPl)
  const reorderPlTracks = usePlaylistStore((s) => s.reorderPlTracks)
  const profile = useSearchStore((s) => s.profile)
  const openDetail = useDetailStore((s) => s.open)

  // Открытие детального вида + запись в «недавно открытые» (author — в подзаголовок).
  const openTarget = (t: DetailTarget, author?: string) => {
    pushRecentItem({ ...t, author })
    openDetail(t)
  }
  const openArtist = (a: Artist) =>
    openTarget({
      kind: 'artist',
      providerId: a.source ?? 'soundcloud',
      id: a.id,
      title: a.name,
      cover: a.avatar ?? null,
      round: true,
    }) // у артиста автора нет → подзаголовок «Артист»
  const openPlaylist = (p: Playlist, kind: 'album' | 'playlist') =>
    openTarget(
      {
        kind,
        providerId: p.source ?? 'soundcloud',
        id: p.id,
        title: p.title,
        cover: p.cover ?? null,
        subtitle: t('search.tracksCount', { n: p.trackCount ?? 0 }),
        round: false,
      },
      p.ownerName, // автор/владелец → «{owner} · Плейлист/Альбом»
    )

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
    // scLikes = SC user-id (из entity id `sc_artist_<id>`) — для «Обновить треки».
    const scLikes = profile.artist.id.replace(/^sc_artist_/, '') || undefined
    const pl = createPl(t('search.likesName', { name: profile.artist.name }), undefined, profile.artist.avatar ?? undefined, {
      scLikes,
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
        const pl = createPl(playlist.title, undefined, playlist.cover ?? undefined)
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

  // Контекстное меню трека + создание плейлиста под трек.
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; track: Track } | null>(null)
  const [pendingNewPlTrack, setPendingNewPlTrack] = useState<Track | null>(null)
  const onCtxMenu = (e: ReactMouseEvent<HTMLDivElement>, track: Track) => {
    e.preventDefault()
    setCtx({ pos: { x: e.clientX, y: e.clientY }, track })
  }

  // Поповер «+» для строк трек-списка (вкладка «Треки») — как в DetailView.
  const addAnchorRef = useRef<HTMLElement | null>(null)
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

  // Debounce live-поиска по вводу; Enter — сразу.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const onChange = (v: string) => {
    setQuery(v)
    clearTimeout(timer.current)
    if (!v.trim()) {
      clear()
      return
    }
    // Ссылка резолвится дольше (delay 800), текст — 350. Обе ветки
    // через runSearch: он сам определяет URL и резолвит в карточку.
    const delay = looksLikeUrl(v.trim()) ? 800 : 350
    timer.current = setTimeout(() => void runSearch(v), delay)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      clearTimeout(timer.current)
      void runSearch()
    }
  }

  // scPlaySearchResult/_scPlayStream: клик по
  // результату поиска ставит очередь ИЗ ОДНОГО трека, а не из всей выдачи.
  const playTrack = (id: string) => playFromSource([id], null, id)

  // Проигрывание трека ИЗ ПОИСКА + запись в «недавно открытые».
  const playTrackFromSearch = (t: Track) => {
    pushRecentItem({
      kind: 'track',
      providerId: t._ym ? 'yandex' : t._ytm ? 'ytmusic' : t._sp ? 'spotify' : t._sc ? 'soundcloud' : 'local',
      id: t.id,
      title: t.name,
      cover: t.cover ?? null,
      author: t.artist, // → подзаголовок «{артист} · Трек»
      round: false,
    })
    playFromSource([t.id], null, t.id)
  }

  // Клик по элементу «недавно открытые»: трек → играть (с ре-резолвом по id после
  // рестарта); артист/альбом/плейлист → открыть DetailView.
  const onRecentItem = (it: RecentItem) => {
    if (it.kind === 'track') {
      pushRecentItem(it) // наверх
      const found =
        useLibStore.getState().tracks.some((t) => t.id === it.id) || !!trackRegistry.get(it.id)
      if (found) {
        playFromSource([it.id], null, it.id)
        return
      }
      const prov = getProvider(it.providerId)
      void prov?.resolveTrackById?.(it.id).then((t) => {
        if (t) playFromSource([t.id], null, t.id)
      })
      return
    }
    openTarget({
      kind: it.kind,
      providerId: it.providerId,
      id: it.id,
      title: it.title,
      cover: it.cover ?? null,
      subtitle: it.subtitle,
      round: it.round,
    })
  }

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

  // Что показываем в теле.
  const hasQuery = query.trim().length > 0
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
  const showHistory = focused && !hasQuery && mergedRecents.length > 0
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
        <div className="sp-header sp-header-sc">
          <div className="sp-inp-wrap">
            <IconSearch />
            <input
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
                  setFocused(false)
                  onRecentItem(it)
                }}
                onApplySearch={(q) => {
                  setFocused(false)
                  setQuery(q)
                  void runSearch(q)
                }}
                onRemoveItem={removeRecentItem}
                onRemoveSearch={removeRecentSearch}
              />
            )}
          </div>
        </div>

        {!profile && <FilterTabs tab={tab} onTab={setTab} />}

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

        <div
          id="spScScroll"
          style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 28px 28px' }}
        >
          <div id="spScResults" className={layoutClass}>
            {loading && (
              <div className="sc-status">
                <div className="sc-spinner" />
                {t('search.searching')}
              </div>
            )}

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
                      {/* Вкладка «Треки» → строки списка (.tr); «Все» → лента карточек. */}
                      {tab === 'tracks'
                        ? filteredTracks.map((t) => (
                            <TrackListRow
                              key={t.id}
                              track={t}
                              onPlay={() => playTrackFromSearch(t)}
                              onCtxMenu={(e) => onCtxMenu(e, t)}
                              onAddClick={(e) => onAddTrack(e, t)}
                            />
                          ))
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
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
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
                    <div className="sp-pl-grid">
                      {playlists.map((p) => (
                        <PlaylistCard key={p.id} playlist={p} onOpen={() => openPlaylist(p, 'playlist')} />
                      ))}
                    </div>
                  </div>
                )}

                {showAlbums && (
                  <div className="sc-uni-section" data-sp-section="albums">
                    <div className="sp-sec-title">{t('search.tab.albums')}</div>
                    <div className="sp-pl-grid">
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
          setPendingNewPlTrack(tracks.find((t) => t.id === id) ?? null)
        }
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
        onCreateNewPlaylist={() => setPendingNewPlTrack(addTrack)}
      />
    </div>
  )
}
