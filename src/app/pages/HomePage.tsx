import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { WaveCard } from '@features/wave'
import { useT, t as tt } from '@shared/i18n'
import {
  useLibStore,
  useHistoryStore,
  usePlaylistStore,
  TrackCtxMenu,
  NewPlaylistModal,
  TagEditor,
  PlMenu,
  AddFromLibModal,
  saveTrackToLibrary,
  type Playlist,
} from '@features/library'
import {
  usePlayerStore,
  useQueueStore,
  togglePlay,
  playFromSource,
  loadPlay,
  loadResume,
  restoreResumeQueue,
  legacySourceLabel,
  type PlaySource,
} from '@features/player'
import { trackRegistry, ArtistLinks, type Track } from '@entities/track'
import { useGamesStore, GamepadIcon } from '@features/games'
import { useNavStore } from '../navigationStore'
import { StatsModal } from './StatsModal'

/**
 * Главная страница (#page-home) — макет.
 *
 * Секции: «Моя волна» (WaveCard) + «Продолжить» (если есть трек) | Любимые/История
 * | статистика | Игры | Плейлисты. Отложено (скрыты по дефолту): «Трек
 * дня», «Недавно слушали», авто-резюм (bloom_resume), статистика-модалка, игры.
 */
export const HomePage = ({ active }: { active: boolean }) => {
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)

  // ПКМ по треку (продолжить / трек дня / недавнее) → TrackCtxMenu.
  const [trackCtx, setTrackCtx] = useState<{ pos: { x: number; y: number }; track: Track } | null>(null)
  const [pendingNewPl, setPendingNewPl] = useState<string | null>(null)
  const [tagEditTrack, setTagEditTrack] = useState<Track | null>(null)
  // ПКМ по плейлисту → PlMenu (cursor-mode).
  const [plCtx, setPlCtx] = useState<{ x: number; y: number; pl: Playlist } | null>(null)
  const [editPlId, setEditPlId] = useState<string | null>(null)
  const [addToPlId, setAddToPlId] = useState<string | null>(null)
  const [newPlOpen, setNewPlOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const selectPlaylist = useLibStore((s) => s.selectPlaylist)
  // Блок «Моя волна + Продолжить» скрыт на пустой библиотеке.
  const hasTracks = useLibStore((s) => s.tracks.length > 0)

  const onTrackCtx = (e: ReactMouseEvent, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    setTrackCtx({ pos: { x: e.clientX, y: e.clientY }, track })
  }
  const onPlCtx = (e: ReactMouseEvent, pl: Playlist) => {
    e.preventDefault()
    e.stopPropagation()
    setPlCtx({ x: e.clientX, y: e.clientY, pl })
  }

  return (
    <div className={`page${active ? ' active' : ''}`} id="page-home">
      <div className="home-scroll">
        {hasTracks && (
          <div className="home-actions">
            <WaveCard />
            <ContinueCard onTrackCtx={onTrackCtx} />
          </div>
        )}
        <QuickGrid />
        <StatsBar onOpen={() => setStatsOpen(true)} />
        <TrackOfDay onTrackCtx={onTrackCtx} />
        <GamesCard />
        <RecentSection onTrackCtx={onTrackCtx} />
        <PlaylistsSection onPlCtx={onPlCtx} onNewPl={() => setNewPlOpen(true)} />
      </div>

      {/* ПКМ-меню трека (продолжить / трек дня / недавнее) */}
      <TrackCtxMenu
        pos={trackCtx?.pos ?? null}
        track={trackCtx?.track ?? null}
        onClose={() => setTrackCtx(null)}
        onCreatePlaylistForTrack={(id) => setPendingNewPl(id)}
        onEditTags={(t) => setTagEditTrack(t)}
      />
      <NewPlaylistModal
        open={pendingNewPl !== null}
        onClose={() => setPendingNewPl(null)}
        onCreated={(plId) => {
          if (pendingNewPl) {
            const t = trackRegistry.get(pendingNewPl)
            if (t && !useLibStore.getState().tracks.some((x) => x.id === t.id)) saveTrackToLibrary(t)
            addTrackToPl(plId, pendingNewPl)
            setPendingNewPl(null)
          }
        }}
      />
      <TagEditor track={tagEditTrack} onClose={() => setTagEditTrack(null)} />

      {/* ПКМ-меню плейлиста */}
      <PlMenu
        open={plCtx !== null}
        onClose={() => setPlCtx(null)}
        cursorX={plCtx?.x ?? null}
        cursorY={plCtx?.y ?? null}
        mode="pl"
        heroName={plCtx?.pl.name ?? ''}
        heroSub={plCtx ? `${plCtx.pl.trs.length} тр.` : ''}
        playlist={plCtx?.pl ?? null}
        folderPath={null}
        onEdit={(id) => setEditPlId(id)}
        onAddTracks={(id) => setAddToPlId(id)}
      />
      <NewPlaylistModal open={editPlId !== null} onClose={() => setEditPlId(null)} editPlaylistId={editPlId} />
      <AddFromLibModal open={addToPlId !== null} onClose={() => setAddToPlId(null)} playlistId={addToPlId} />

      {/* «Новый» плейлист с главной — после создания открываем его в библиотеке */}
      <NewPlaylistModal
        open={newPlOpen}
        onClose={() => setNewPlOpen(false)}
        onCreated={(id) => selectPlaylist(id)}
      />

      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
    </div>
  )
}

// ── резолв трека (библиотека → реестр площадок) ─────────────────────────────

const findTrack = (id: string, libTracks: Track[]): Track | undefined =>
  libTracks.find((t) => t.id === id) ?? trackRegistry.get(id)

// ── Продолжить ─────────────────────────────────────────────────────────────

const NoteSvg = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
)

const sourceLabel = (s: PlaySource): string => {
  if (!s) return tt('lib.allTracks')
  switch (s.kind) {
    case 'lib-all': return tt('lib.allTracks')
    case 'lib-fav': return tt('home.favTracks')
    case 'lib-history': return tt('lib.history')
    case 'playlist': return s.name
    case 'folder': return s.name
    case 'sc': return s.label
    case 'wave': return s.label
  }
}

/** Тип иконки источника карточки «Продолжить». */
type SrcIconKind = 'fav' | 'wave' | 'pl' | 'note'

const srcIconKindLive = (s: PlaySource): { kind: SrcIconKind; cover: string | null } => {
  if (!s) return { kind: 'note', cover: null }
  switch (s.kind) {
    case 'lib-fav': return { kind: 'fav', cover: null }
    case 'wave': return { kind: 'wave', cover: null }
    case 'playlist': return { kind: 'pl', cover: s.cover ?? null }
    default: return { kind: 'note', cover: null } // lib-all/lib-history/folder/sc
  }
}

/** Иконка источника по типу. */
const ContinueSourceIcon = ({ kind, cover }: { kind: SrcIconKind; cover: string | null }) => {
  if (kind === 'pl' && cover) {
    return <img src={cover} alt="" style={{ width: 16, height: 16, borderRadius: 'calc(var(--radius)*0.4)', objectFit: 'cover', flexShrink: 0 }} />
  }
  if (kind === 'fav') {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    )
  }
  if (kind === 'wave') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--accent)' }}>
        <rect x="2" y="9" width="2.6" height="6" rx="1.3" /><rect x="6.4" y="6" width="2.6" height="12" rx="1.3" /><rect x="10.8" y="3" width="2.6" height="18" rx="1.3" /><rect x="15.2" y="7" width="2.6" height="10" rx="1.3" /><rect x="19.6" y="10" width="2.6" height="4" rx="1.3" />
      </svg>
    )
  }
  if (kind === 'pl') {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    )
  }
  return <NoteSvg size={11} />
}

const fmtTime = (sec: number): string => {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

/**
 * Метка состояния карточки «Продолжить» после рестарта: пауза → «На паузе», иначе «время с
 * последнего прослушивания» (Только что / X мин. назад / X ч. назад / Вчера / X дн. назад).
 */
const resumeStateLabel = (state: string | undefined, savedAt: number | undefined): string => {
  if (state === 'paused') return tt('home.paused')
  if (savedAt && savedAt > 0) {
    const diff = Math.floor((Date.now() - savedAt) / 1000)
    if (diff < 60) return tt('home.justNow')
    if (diff < 3600) return tt('home.minsAgo', { n: Math.floor(diff / 60) })
    if (diff < 86400) return tt('home.hoursAgo', { n: Math.floor(diff / 3600) })
    if (diff < 172800) return tt('home.yesterday')
    return tt('home.daysAgo', { n: Math.floor(diff / 86400) })
  }
  return tt('home.paused')
}

const ContinueCard = ({ onTrackCtx }: { onTrackCtx: (e: ReactMouseEvent, t: Track) => void }) => {
  const tr = useT()
  const curId = useQueueStore((s) => s.curId)
  const source = useQueueStore((s) => s.source)
  const title = usePlayerStore((s) => s.title)
  const artist = usePlayerStore((s) => s.artist)
  const artwork = usePlayerStore((s) => s.artwork)
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const playing = usePlayerStore((s) => s.playing)
  const libTracks = useLibStore((s) => s.tracks)
  const goNav = useNavStore((s) => s.goNav)

  // Живой трек этой сессии — показываем из плеера; play/pause + переход.
  if (curId) {
    const liveTrack = findTrack(curId, libTracks)
    const li = srcIconKindLive(source)
    return (
      <ContinueView
        cover={artwork}
        title={title || '—'}
        artist={artist || '—'}
        artistScId={liveTrack?.artistScId}
        artistPermalink={liveTrack?.artistPermalink}
        artistId={liveTrack?.artistId}
        artistProvider={liveTrack?.artistProvider}
        label={sourceLabel(source)}
        iconKind={li.kind}
        iconCover={li.cover}
        pos={position}
        dur={duration}
        playing={playing}
        stateText={playing ? tr('home.nowPlaying') : tr('home.paused')}
        stateActive={playing}
        onResume={() => {
          togglePlay()
          goNav('player')
        }}
        onContextMenu={liveTrack ? (e) => onTrackCtx(e, liveTrack) : undefined}
      />
    )
  }

  // Нет живого трека — восстанавливаем из сохранённого резюма (после рестарта).
  const r = loadResume()
  if (!r) return null
  // Снимок трека хранится в самом резюме (для SC-треков после рестарта); фолбэк — реестр/библиотека.
  const t = r.track ?? findTrack(r.id, libTracks)
  if (!t) return null
  // Иконка источника из-формата резюма (fav/wave/pl/прочее).
  const st = r.source?.type
  const iconKind: SrcIconKind = st === 'fav' ? 'fav' : st === 'wave' ? 'wave' : st === 'pl' ? 'pl' : 'note'
  const iconCover =
    st === 'pl' && r.source?.plId
      ? usePlaylistStore.getState().playlists.find((p) => p.id === r.source!.plId)?.cover ?? null
      : null
  return (
    <ContinueView
      cover={t.cover ?? null}
      title={t.name || '—'}
      artist={t.artist || '—'}
      artistScId={t.artistScId}
      artistPermalink={t.artistPermalink}
      artistId={t.artistId}
      artistProvider={t.artistProvider}
      label={legacySourceLabel(r.source)}
      iconKind={iconKind}
      iconCover={iconCover}
      pos={r.pos || 0}
      dur={parseDur(t.dur)}
      playing={false}
      stateText={resumeStateLabel(r.state, r.savedAt)}
      stateActive={false}
      onResume={() => {
        const id = restoreResumeQueue(r)
        if (id) {
          void loadPlay(id)
          goNav('player')
        }
      }}
      onContextMenu={(e) => onTrackCtx(e, t)}
    />
  )
}

const ContinueView = ({
  cover,
  title,
  artist,
  artistScId,
  artistPermalink,
  artistId,
  artistProvider,
  label,
  iconKind,
  iconCover,
  pos,
  dur,
  playing,
  stateText,
  stateActive,
  onResume,
  onContextMenu,
}: {
  cover: string | null
  title: string
  artist: string
  artistScId?: number | null
  artistPermalink?: string | null
  artistId?: string | null
  artistProvider?: string | null
  label: string
  iconKind: SrcIconKind
  iconCover: string | null
  pos: number
  dur: number
  playing: boolean
  /** Текст состояния (Сейчас играет / На паузе / X мин. назад). */
  stateText: string
  /** Активное проигрывание — для зелёной подсветки is-playing. */
  stateActive: boolean
  onResume: () => void
  onContextMenu?: (e: ReactMouseEvent) => void
}) => {
  const t = useT()
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0
  return (
    <div className="home-continue-card" id="homeContinueCard" onClick={onResume} onContextMenu={onContextMenu}>
      <div className="hcc-meta">
        <div className="hcc-source" id="homeCcSource">
          <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <ContinueSourceIcon kind={iconKind} cover={iconCover} />
          </span>
          <span>{label}</span>
        </div>
        <div className={`hcc-state${stateActive ? ' is-playing' : ''}`}>{stateText}</div>
      </div>
      <div className="hcc-row">
        <div className="hcc-cover" id="homeCcCover">
          {cover ? <img src={cover} alt="" /> : <NoteSvg />}
        </div>
        <div className="hcc-body">
          <div className="hcc-top">
            <div className="hcc-title">{title}</div>
            <div className="hcc-artist">
              <ArtistLinks artist={artist} scId={artistScId} permalink={artistPermalink} artistId={artistId} provider={artistProvider} />
            </div>
          </div>
          <div className="hcc-progress">
            <div className="hcc-bar-wrap"><div className="hcc-bar-fill" style={{ width: `${pct}%` }} /></div>
            <div className="hcc-times"><span>{fmtTime(pos)}</span><span>{fmtTime(dur)}</span></div>
          </div>
        </div>
        <button
          className="hcc-play-btn"
          onClick={(e) => {
            e.stopPropagation()
            onResume()
          }}
          aria-label={playing ? t('player.aria.pause') : t('home.resume')}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" /></svg>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Любимые / История ──────────────────────────────────────────────────────

const QuickGrid = () => {
  const t = useT()
  const goNav = useNavStore((s) => s.goNav)
  const selectBuiltin = useLibStore((s) => s.selectBuiltin)
  const open = (m: 'fav' | 'history') => {
    goNav('lib')
    selectBuiltin(m)
  }
  return (
    <div className="home-quick-grid">
      <div className="home-quick-card home-quick-card-fav" onClick={() => open('fav')}>
        <div className="hqc-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.5}>
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
        </div>
        <div className="hqc-info">
          <div className="hqc-title">{t('home.favTracks')}</div>
          <div className="hqc-sub">{t('home.favSub')}</div>
        </div>
      </div>
      <div className="home-quick-card home-quick-card-hist" onClick={() => open('history')}>
        <div className="hqc-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="hqc-info">
          <div className="hqc-title">{t('lib.history')}</div>
          <div className="hqc-sub">{t('home.historySub')}</div>
        </div>
      </div>
    </div>
  )
}

// ── Статистика ─────────────────────────────────────────────────────────────

const parseDur = (dur: string | undefined): number => {
  if (!dur || dur === '—') return 0
  const p = dur.split(':').map(Number)
  if (p.some((n) => Number.isNaN(n))) return 0
  if (p.length === 2) return p[0]! * 60 + p[1]!
  if (p.length === 3) return p[0]! * 3600 + p[1]! * 60 + p[2]!
  return 0
}

const StatsBar = ({ onOpen }: { onOpen: () => void }) => {
  const t = useT()
  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)
  // Прослушивания берём из истории (count) — playCount на треках не ведётся.
  const { totalSec, totalPlays } = useMemo(() => {
    let sec = 0
    let plays = 0
    for (const e of entries) {
      plays += e.count || 0
      const t = findTrack(e.id, tracks)
      if (t) sec += parseDur(t.dur) * (e.count || 0)
    }
    return { totalSec: sec, totalPlays: plays }
  }, [entries, tracks])
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  return (
    <div className="home-stats-bar" id="homeStatsBar" onClick={onOpen}>
      <div className="hsb-item">
        <span className="hsb-num">{totalPlays || tracks.length}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ opacity: 0.5 }}>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <span className="hsb-sep">{t('home.per')}</span>
      <div className="hsb-item"><span className="hsb-num">{h}</span><span className="hsb-unit">{t('home.hShort')}</span></div>
      <div className="hsb-item"><span className="hsb-num">{m}</span><span className="hsb-unit">{t('home.mShort')}</span></div>
      <div style={{ position: 'absolute', right: 16, bottom: 0, display: 'flex', alignItems: 'flex-end', gap: 5, pointerEvents: 'none', height: '100%' }}>
        {[55, 80, 40, 70].map((hpct, i) => (
          <div key={i} style={{ width: 12, height: `${hpct}%`, background: 'rgba(255,255,255,.13)', borderRadius: '3px 3px 0 0' }} />
        ))}
      </div>
    </div>
  )
}

// ── Игры ───────────────────────────────────────────────────────────────────

const GamesCard = () => {
  const t = useT()
  return (
  <div className="home-games-card" onClick={() => useGamesStore.getState().openModal()}>
    <div className="home-games-card-left">
      <div className="home-games-card-icon">
        <GamepadIcon size={35} />
      </div>
      <div className="home-games-card-title">{t('home.games')}</div>
    </div>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }} />
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#059669,#0891b2)' }} />
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#dc2626,#ea580c)' }} />
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#d97706,#ca8a04)' }} />
    </div>
  </div>
  )
}

// ── Трек дня ───────────────────────────────────────────────────────────────

const PlaySmall = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
  </svg>
)

/** Номер суток по МСК (UTC+3). Меняется ровно в 00:00 МСК. */
const mskDayNumber = (): number => Math.floor((Date.now() + 3 * 3600 * 1000) / 86400000)

const TrackOfDay = ({ onTrackCtx }: { onTrackCtx: (e: ReactMouseEvent, t: Track) => void }) => {
  const t = useT()
  const tracks = useLibStore((s) => s.tracks)
  const goNav = useNavStore((s) => s.goNav)
  // Состояние = номер МСК-суток; авто-обновление в 00:00 МСК даже при открытом окне.
  const [day, setDay] = useState(mskDayNumber)
  useEffect(() => {
    const msToMidnight = 86400000 - ((Date.now() + 3 * 3600 * 1000) % 86400000)
    const id = window.setTimeout(() => setDay(mskDayNumber()), msToMidnight + 500)
    return () => window.clearTimeout(id)
  }, [day])

  // Стабильный выбор внутри суток: индексируем в отсортированную по id копию,
  // чтобы переупорядочивание библиотеки в течение дня не меняло трек дня.
  const tod = useMemo(() => {
    if (!tracks.length) return null
    const sorted = [...tracks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    return sorted[day % sorted.length] ?? null
  }, [tracks, day])
  if (!tod) return null

  const play = () => {
    playFromSource([tod.id], { kind: 'lib-all' }, tod.id)
    goNav('player')
  }
  return (
    <div id="homeTodSection">
      <div className="home-tod" id="homeTodCard" onClick={play} onContextMenu={(e) => onTrackCtx(e, tod)}>
        <div className="home-tod-cover">
          {tod.cover ? <img src={tod.cover} alt="" /> : <NoteSvg />}
        </div>
        <div className="home-tod-info">
          <div className="home-tod-label">✦ {t('home.trackOfDay')}</div>
          <div className="home-tod-name">{tod.name}</div>
          <div className="home-tod-artist">
            <ArtistLinks artist={tod.artist} scId={tod.artistScId} permalink={tod.artistPermalink} artistId={tod.artistId} provider={tod.artistProvider} />
          </div>
        </div>
        <button
          className="home-tod-play"
          onClick={(e) => {
            e.stopPropagation()
            play()
          }}
          aria-label={t('home.playDaily')}
        >
          <PlaySmall />
        </button>
      </div>
    </div>
  )
}

// ── Недавно слушали ──────────────────────────────────────────────────────────

const RecentSection = ({ onTrackCtx }: { onTrackCtx: (e: ReactMouseEvent, t: Track) => void }) => {
  const tr = useT()
  const entries = useHistoryStore((s) => s.entries)
  const libTracks = useLibStore((s) => s.tracks)
  const recent = useMemo(() => {
    const out: Track[] = []
    const seen = new Set<string>()
    for (const e of entries) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      const t = findTrack(e.id, libTracks)
      if (t) out.push(t)
      if (out.length >= 12) break
    }
    return out
  }, [entries, libTracks])
  if (!recent.length) return null

  return (
    <div className="home-section" id="homeRecentSection">
      <div className="home-recent-hdr">{tr('home.recent')}</div>
      <div className="home-cards" id="homeRecentCards">
        {recent.map((t) => (
          <div
            className="home-card"
            key={t.id}
            onClick={() => playFromSource([t.id], { kind: 'lib-all' }, t.id)}
            onContextMenu={(e) => onTrackCtx(e, t)}
          >
            <div className="hc-cover">
              {t.cover ? <img src={t.cover} alt="" /> : <NoteSvg size={24} />}
              <div className="hc-play-overlay">
                <div className="hc-play-btn">
                  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1" strokeLinejoin="round" style={{ marginLeft: 2 }}>
                    <path d="M7.5 4.5C7.5 3.4 8.7 2.7 9.6 3.3l11 7.5c.9.5.9 1.9 0 2.4l-11 7.5C8.7 21.3 7.5 20.6 7.5 19.5V4.5z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="hc-name">{t.name}</div>
            <div className="hc-artist">
              <ArtistLinks artist={t.artist} scId={t.artistScId} permalink={t.artistPermalink} artistId={t.artistId} provider={t.artistProvider} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Плейлисты ──────────────────────────────────────────────────────────────

const PlaylistsSection = ({
  onPlCtx,
  onNewPl,
}: {
  onPlCtx: (e: ReactMouseEvent, pl: Playlist) => void
  onNewPl: () => void
}) => {
  const t = useT()
  const playlists = usePlaylistStore((s) => s.playlists)
  const goNav = useNavStore((s) => s.goNav)
  const selectPlaylist = useLibStore((s) => s.selectPlaylist)
  const openPl = (id: string) => {
    goNav('lib')
    selectPlaylist(id)
  }
  return (
    <div className="home-section">
      <div className="home-section-hdr">{t('search.tab.playlists')}</div>
      <div className="home-pl-grid" id="homePlGrid">
        {playlists.map((pl) => (
          <div className="home-pl-card" key={pl.id} onClick={() => openPl(pl.id)} onContextMenu={(e) => onPlCtx(e, pl)}>
            <div className="hpc-cover">
              {pl.cover ? <img src={pl.cover} alt="" /> : <NoteSvg size={24} />}
              <div className="hpc-play-overlay">
                <div className="hpc-play-btn">
                  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1" strokeLinejoin="round" style={{ marginLeft: 2 }}>
                    <path d="M7.5 4.5C7.5 3.4 8.7 2.7 9.6 3.3l11 7.5c.9.5.9 1.9 0 2.4l-11 7.5C8.7 21.3 7.5 20.6 7.5 19.5V4.5z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="hpc-name">{pl.name}</div>
            <div className="hpc-sub">{tt('lib.grid.tracks', { n: pl.trs.length })}</div>
          </div>
        ))}
        <button
          className="home-pl-new"
          onClick={() => {
            goNav('lib')
            onNewPl()
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('common.new')}
        </button>
      </div>
    </div>
  )
}
