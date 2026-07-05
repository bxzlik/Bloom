import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { WaveCard } from '@features/wave'
import { useT, t as tt } from '@shared/i18n'
import {
  useLibStore,
  useHistoryStore,
  usePlaylistStore,
  usePlEditStore,
  useFavStore,
  TrackCtxMenu,
  TagEditor,
  PlMenu,
  AddFromLibModal,
  createPlaylistInline,
  tracksLabel,
  type Playlist,
} from '@features/library'
import {
  usePlayerStore,
  useQueueStore,
  togglePlay,
  playSingleTrack,
  loadPlay,
  loadResume,
  restoreResumeQueue,
  legacySourceLabel,
  PlayStateOverlay,
  type PlaySource,
} from '@features/player'
import { seek, seekLive } from '@features/player/api/play'
import { trackRegistry, ArtistLinks, CoverSourceBadge, CoverProviderBadge, type Track } from '@entities/track'
import { PlaylistCover } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'
import { useNavStore } from '../navigationStore'
import { DiscoverSections } from './DiscoverSections'

/**
 * Главная страница
 *
 * Секции: «Моя волна» (WaveCard) + «Продолжить» (если есть трек) | Любимые/История
 * | Недавно слушали | Плейлисты.
 */
export const HomePage = ({ active }: { active: boolean }) => {
  // ПКМ по треку (продолжить / трек дня / недавнее) → TrackCtxMenu.
  const [trackCtx, setTrackCtx] = useState<{ pos: { x: number; y: number }; track: Track } | null>(null)
  const [tagEditTrack, setTagEditTrack] = useState<Track | null>(null)
  // ПКМ по плейлисту → PlMenu (cursor-mode).
  const [plCtx, setPlCtx] = useState<{ x: number; y: number; pl: Playlist } | null>(null)
  const [addToPlId, setAddToPlId] = useState<string | null>(null)
  const selectPlaylist = useLibStore((s) => s.selectPlaylist)
  const goNav = useNavStore((s) => s.goNav)
  const startEdit = usePlEditStore((s) => s.startEdit)
  // Блок «Моя волна + Продолжить» скрыт на пустой библиотеке.
  const hasTracks = useLibStore((s) => s.tracks.length > 0)

  // Пока идёт скролл — вешаем .is-scrolling, чтобы CSS поставил на паузу тяжёлый
  // SVG-фильтр фаербола «Моей волны» (feTurbulence/feDisplacementMap не
  // композитятся на GPU и перерисовывают вьюпорт каждый кадр → jank при листании).
  // Снимаем класс через паузу простоя, анимация возобновляется.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let idle: number | undefined
    const onScroll = () => {
      if (idle === undefined) el.classList.add('is-scrolling')
      else window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        el.classList.remove('is-scrolling')
        idle = undefined
      }, 160)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (idle !== undefined) window.clearTimeout(idle)
    }
  }, [])

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
      <div className="home-scroll" ref={scrollRef}>
        {hasTracks && (
          <div className="home-actions">
            <WaveCard />
            <ContinueCard onTrackCtx={onTrackCtx} />
          </div>
        )}
        <QuickGrid />
        <DiscoverSections active={active} onTrackCtx={onTrackCtx} />
        <RecentSection onTrackCtx={onTrackCtx} />
        <PlaylistsSection
          onPlCtx={onPlCtx}
          onNewPl={() => {
            goNav('lib')
            createPlaylistInline()
          }}
        />
      </div>

      {/* ПКМ-меню трека (продолжить / трек дня / недавнее) */}
      <TrackCtxMenu
        pos={trackCtx?.pos ?? null}
        track={trackCtx?.track ?? null}
        onClose={() => setTrackCtx(null)}
        onCreatePlaylistForTrack={(id) => {
          const tr = trackRegistry.get(id)
          goNav('lib')
          createPlaylistInline(tr ? { track: tr } : { trackId: id })
        }}
        onEditTags={(t) => setTagEditTrack(t)}
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
        heroSub={plCtx ? tracksLabel(plCtx.pl.trs.length) : ''}
        playlist={plCtx?.pl ?? null}
        folderPath={null}
        onEdit={(id) => {
          goNav('lib')
          selectPlaylist(id)
          startEdit(id)
        }}
        onAddTracks={(id) => setAddToPlId(id)}
      />
      <AddFromLibModal open={addToPlId !== null} onClose={() => setAddToPlId(null)} playlistId={addToPlId} />
    </div>
  )
}

// ── резолв трека (библиотека → реестр площадок) ─────────────────────────────

const findTrack = (id: string, libTracks: Track[]): Track | undefined =>
  libTracks.find((t) => t.id === id) ?? trackRegistry.get(id)

/**
 * Источник плейлиста для бейджа: строковый id провайдера, если ВСЕ треки из
 * одной площадки, иначе null (смешанный/локальный). Совместимо с
 * `CoverProviderBadge`. См. аналогичную логику в LibGridOverview.
 */
const playlistProvider = (trs: string[], libTracks: Track[]): string | null => {
  const tracks = trs.map((id) => findTrack(id, libTracks)).filter((t): t is Track => !!t)
  if (!tracks.length) return null
  if (tracks.every((t) => t._ym)) return 'yandex'
  if (tracks.every((t) => t._ytm)) return 'ytmusic'
  if (tracks.every((t) => t._sp)) return 'spotify'
  if (tracks.every((t) => t._sc)) return 'soundcloud'
  return null
}

// ── Продолжить ─────────────────────────────────────────────────────────────

const NoteSvg = ({ size = 22 }: { size?: number }) => <Ico name="note" width={size} height={size} />

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
    case 'single': return s.name
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
    return <Ico name="heart" variant="bold" width={11} height={11} />
  }
  if (kind === 'wave') {
    return <Ico name="wave" variant="bold" width={12} height={12} style={{ color: 'var(--accent)' }} />
  }
  if (kind === 'pl') {
    return <Ico name="list" width={11} height={11} />
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
  const favs = useFavStore((s) => s.favs)
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
        label={sourceLabel(source)}
        iconKind={li.kind}
        iconCover={li.cover}
        pos={position}
        dur={duration}
        playing={playing}
        stateText={playing ? tr('home.nowPlaying') : tr('home.paused')}
        stateActive={playing}
        isFav={favs.has(curId)}
        onToggleFav={() => useFavStore.getState().toggleFav(curId)}
        onTogglePlay={() => togglePlay()}
        onSeekLive={seekLive}
        onSeekCommit={seek}
        onResume={() => goNav('player')}
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
      label={legacySourceLabel(r.source)}
      iconKind={iconKind}
      iconCover={iconCover}
      pos={r.pos || 0}
      dur={parseDur(t.dur)}
      playing={false}
      stateText={resumeStateLabel(r.state, r.savedAt)}
      stateActive={false}
      isFav={favs.has(t.id)}
      onToggleFav={() => useFavStore.getState().toggleFav(t.id)}
      onTogglePlay={() => {
        // Ещё не играет (восстановление после рестарта) — запускаем, без перехода.
        const id = restoreResumeQueue(r)
        if (id) void loadPlay(id)
      }}
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
  label,
  iconKind,
  iconCover,
  pos,
  dur,
  playing,
  stateText,
  stateActive,
  isFav,
  onToggleFav,
  onTogglePlay,
  onSeekLive,
  onSeekCommit,
  onResume,
  onContextMenu,
}: {
  cover: string | null
  title: string
  artist: string
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
  isFav: boolean
  onToggleFav: () => void
  /** Play/pause по кнопке — БЕЗ перехода в плеер. */
  onTogglePlay: () => void
  /** Live-seek во время перетаскивания (только у играющего трека). */
  onSeekLive?: (sec: number) => void
  /** Финальная перемотка на отпускании. Наличие = полоса перематываемая. */
  onSeekCommit?: (sec: number) => void
  /** Клик по карточке (обложка/пустое место) — открыть плеер. */
  onResume: () => void
  onContextMenu?: (e: ReactMouseEvent) => void
}) => {
  const t = useT()
  const barRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const lastFracRef = useRef(0)
  const [dragFrac, setDragFrac] = useState<number | null>(null)
  const seekable = !!onSeekCommit

  // Попап кнопки «!» — источник + активность. Fixed-портал у кнопки (как в
  // WaveCard): попап рендерится в body, иначе overflow:hidden карточки/скролл
  // главной его обрежут. `cx` — центр кнопки, попап центрируется translateX(-50%).
  const [infoPos, setInfoPos] = useState<{ top: number; cx: number } | null>(null)
  const infoBtnRef = useRef<HTMLButtonElement>(null)
  const infoRef = useRef<HTMLDivElement>(null)
  usePopupOpenAnimation(infoRef, infoPos)
  const toggleInfo = () => {
    if (infoPos) {
      setInfoPos(null)
      return
    }
    const r = infoBtnRef.current?.getBoundingClientRect()
    if (!r) return
    // Открываем НАД кнопкой: якорим низ попапа к верху кнопки (translateY(-100%)).
    setInfoPos({ top: r.top - 8, cx: r.left + r.width / 2 })
  }
  // Ресайз/скролл → координаты fixed-попапа устаревают, закрываем.
  useLayoutEffect(() => {
    if (!infoPos) return
    const close = () => setInfoPos(null)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [infoPos])
  const pct = dragFrac != null ? dragFrac * 100 : dur > 0 ? Math.min(100, (pos / dur) * 100) : 0
  const shownPos = dragFrac != null ? dragFrac * dur : pos

  // Перемотка-скраб по образцу оверлея (режим «Полоса», attachSeek):
  // pointerdown + setPointerCapture, гейт по флагу dragging (надёжнее
  // hasPointerCapture); заливка идёт за курсором без transition-лага.
  const applyAt = (clientX: number) => {
    const el = barRef.current
    if (!el || !dur || !onSeekLive) return
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    lastFracRef.current = f
    setDragFrac(f)
    onSeekLive(f * dur)
  }
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dur || !seekable) return
    if (e.button !== 0) return // только ЛКМ — ПКМ/СКМ не двигают полосу
    e.stopPropagation()
    e.preventDefault()
    draggingRef.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* no-op */
    }
    applyAt(e.clientX)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) applyAt(e.clientX)
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* no-op */
    }
    if (dur && onSeekCommit) onSeekCommit(lastFracRef.current * dur)
    setDragFrac(null)
  }

  return (
    <div className="home-continue-card" id="homeContinueCard" onContextMenu={onContextMenu}>
      <div className="hcc-row">
        {/* Клик по обложке открывает полноэкранный плеер. */}
        <div className="hcc-cover" id="homeCcCover" onClick={onResume}>
          {cover ? <img src={cover} alt="" /> : <NoteSvg />}
        </div>
        <button
          className="hcc-play-btn"
          onClick={(e) => {
            e.stopPropagation()
            onTogglePlay()
          }}
          aria-label={playing ? t('player.aria.pause') : t('home.resume')}
        >
          {playing ? (
            <Ico name="pause" variant="bold" width={14} height={14} />
          ) : (
            <Ico name="play" variant="bold" width={14} height={14} />
          )}
        </button>
        {/* Полоса-пилюля: название внутри, заливка прогресса. У живого трека —
            перематываемая (drag/click = seek). У восстановленного из резюма
            (не перематываемая) клик = продолжить воспроизведение. */}
        <div
          ref={barRef}
          className={`hcc-seek${seekable ? ' is-seekable' : ''}`}
          onPointerDown={seekable ? onDown : undefined}
          onPointerMove={seekable ? onMove : undefined}
          onPointerUp={seekable ? onUp : undefined}
          onPointerCancel={seekable ? onUp : undefined}
          onClick={seekable ? undefined : () => onTogglePlay()}
        >
          <div
            className="hcc-seek-fill"
            style={{ width: `${pct}%`, ...(dragFrac != null ? { transition: 'none' } : null) }}
          />
          <div className="hcc-seek-label">
            <div className="hcc-seek-main">
              <span className="hcc-seek-title">{title}</span>
              {artist && artist !== '—' && <span className="hcc-seek-artist">{artist}</span>}
            </div>
            <span className="hcc-seek-times">{fmtTime(shownPos)} / {fmtTime(dur)}</span>
          </div>
          {/* «!» — источник и активность спрятаны в попап (портал в body). Внутри
              полосы, поэтому глушим pointerdown/click, чтобы не перематывать. */}
          <button
            ref={infoBtnRef}
            className={`hcc-seek-info${infoPos ? ' active' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              toggleInfo()
            }}
            aria-label={t('home.info')}
            aria-haspopup="menu"
            aria-expanded={infoPos !== null}
          >
            <Ico name="info" width={16} height={16} />
          </button>
        </div>
        <button
          className={`hcc-icon-btn hcc-like${isFav ? ' active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFav()
          }}
          aria-label={t('home.favTracks')}
        >
          <Ico name="heart" variant={isFav ? 'bold' : undefined} width={16} height={16} />
        </button>
        <button
          className="hcc-icon-btn hcc-dots"
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu?.(e)
          }}
          aria-label={t('common.more')}
        >
          <Ico name="kebab" width={16} height={16} />
        </button>
      </div>
      {infoPos &&
        createPortal(
          <>
            {/* клик мимо — закрыть */}
            <div onClick={() => setInfoPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 8000 }} />
            <div style={{ position: 'fixed', top: infoPos.top, left: infoPos.cx, zIndex: 8001, transform: 'translate(-50%, -100%)' }}>
              <div ref={infoRef} className="hcc-info-pop" role="menu">
                <div className="hcc-info-item">
                  <span className="hcc-info-ico">
                    <ContinueSourceIcon kind={iconKind} cover={iconCover} />
                  </span>
                  <span className="hcc-info-txt">
                    <span className="hcc-info-cap">{t('home.srcLabel')}</span>
                    <span className="hcc-info-val">{label}</span>
                  </span>
                </div>
                <div className="hcc-info-item">
                  <span className="hcc-info-ico">
                    <span className={`hcc-info-dot${stateActive ? ' is-playing' : ''}`} />
                  </span>
                  <span className="hcc-info-txt">
                    <span className="hcc-info-cap">{t('home.actLabel')}</span>
                    <span className="hcc-info-val">{stateText}</span>
                  </span>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
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
          <Ico name="heart" variant="bold" width={18} height={18} />
        </div>
        <div className="hqc-info">
          <div className="hqc-title">{t('home.favTracks')}</div>
          <div className="hqc-sub">{t('home.favSub')}</div>
        </div>
      </div>
      <div className="home-quick-card home-quick-card-hist" onClick={() => open('history')}>
        <div className="hqc-icon">
          <Ico name="clock" width={18} height={18} />
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
            onClick={() => playSingleTrack(t.id)}
            onContextMenu={(e) => onTrackCtx(e, t)}
          >
            <div className="hc-cover">
              {t.cover ? <img src={t.cover} alt="" /> : <NoteSvg size={24} />}
              <CoverSourceBadge track={t} size={24} />
              <div className="hc-play-overlay">
                <div className="hc-play-btn">
                  <Ico name="play" width="100%" height="100%" style={{ color: 'var(--accent)', marginLeft: 2 }} />
                </div>
              </div>
              <PlayStateOverlay trackId={t.id} size="card" />
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
  const libTracks = useLibStore((s) => s.tracks)
  const libById = useMemo(() => new Map(libTracks.map((tr) => [tr.id, tr])), [libTracks])
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
            <div className="hpc-cover" style={pl.cover ? undefined : { background: 'transparent' }}>
              {pl.cover ? <img src={pl.cover} alt="" /> : <PlaylistCover covers={pl.trs.map((id) => (libById.get(id) ?? trackRegistry.get(id))?.cover)} seed={pl.id} />}
              <CoverProviderBadge provider={playlistProvider(pl.trs, libTracks)} size={24} />
              <div className="hpc-play-overlay">
                <div className="hpc-play-btn">
                  <Ico name="play" width="100%" height="100%" style={{ color: 'var(--accent)', marginLeft: 2 }} />
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
          <Ico name="add" width={18} height={18} />
          {t('common.new')}
        </button>
      </div>
    </div>
  )
}
