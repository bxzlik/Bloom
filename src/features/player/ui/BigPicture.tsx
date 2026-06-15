import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  useFavStore,
  useLibStore,
  usePlaylistStore,
  saveTrackToLibrary,
  TrackCtxMenu,
  NewPlaylistModal,
  TagEditor,
} from '@features/library'
import type { Track } from '@entities/track'
import { trackRegistry, ArtistLinks } from '@entities/track'
import { LyricsView } from '@features/lyrics'
import { usePlayerViewStore, useOptStore } from '@features/settings'
import { usePlayerStore } from '../model/store'
import { useQueueStore } from '../model/queueStore'
import { useBigPicStore, BP_FONT_SIZES } from '../model/bigPicStore'
import {
  togglePlay,
  prevTr,
  nextTr,
  seek,
  seekLive,
  toggleShuffleMain,
  cycleRepeatMain,
  toggleCurFav,
} from '../api/play'
import { audioEngine } from '../lib/audioEngine'
import { regenWave, hasWaveData, drawWaveTo } from '../lib/waveSlider'
import { MarqueeTitle } from './MarqueeTitle'
import { QueueBlock } from './QueueBlock'
import { AddPopup } from './AddPopup'

/**
 * Полноэкранный режим обложки (#bigPicOverlay) —
 * + `openBigPic`/`closeBigPic` + LyricsController.bp.
 *
 * Открывается кликом по обложке плеера (PagePlayer → renderCover) либо кнопкой
 * «Big picture» в нижнем баре. Внутри: крупная обложка (parallax/винил) + инфо +
 * прогресс (с волновым слайдером) + транспорт; боковые панели очередь/текст
 * (реюз QueueBlock/LyricsView) переключают раскладку bp-inner в строку.
 *
 * Стили — shared/styles/big-picture.css (#bigPicOverlay .bp-*). Перетаскивание окна/максимайз
 * — через `data-tauri-drag-region` на тайтлбаре и фоновых слоях (вместо webview
 * postMessage из).
 */
export const BigPicture = () => {
  const open = useBigPicStore((s) => s.open)
  const closeBig = useBigPicStore((s) => s.closeBig)

  // Esc закрывает. body overflow + скрытие тайтлбара.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBig()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const tb = document.getElementById('winTitlebar')
    if (tb) tb.style.visibility = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (tb) tb.style.visibility = ''
    }
  }, [open, closeBig])

  return (
    <div id="bigPicOverlay" className={open ? 'open' : ''}>
      {open && <BigPicInner />}
    </div>
  )
}

// ── Внутренности (монтируются только когда открыто — replay bpIn + scoped effects) ──

const BigPicInner = () => {
  const panel = useBigPicStore((s) => s.panel)
  const fontPanelOpen = useBigPicStore((s) => s.fontPanelOpen)
  const toggleQueue = useBigPicStore((s) => s.toggleQueue)
  const toggleLyrics = useBigPicStore((s) => s.toggleLyrics)
  const toggleFontPanel = useBigPicStore((s) => s.toggleFontPanel)
  const closeBig = useBigPicStore((s) => s.closeBig)

  const artworkRaw = usePlayerStore((s) => s.artwork)
  const coverOverride = usePlayerStore((s) => s.coverOverride)
  const frozenCover = useOptStore((s) => s.frozenCover)
  const artwork = frozenCover ?? coverOverride ?? artworkRaw

  // Выравнивание заголовка/артиста/текста следует настройке titleAlign плеера.
  const titleAlign = usePlayerViewStore((s) => s.titleAlign)
  const modeClass =
    panel === 'lyrics' ? ' bp-lyr-mode' : panel === 'queue' ? ' bp-q-mode' : ''
  const innerClass = `bp-inner bp-align-${titleAlign}${modeClass}`

  return (
    <>
      {/* Тайтлбар + фоновые слои = drag-зоны окна (двойной клик — максимайз). */}
      <div className="bp-titlebar" id="bpTitlebar" data-tauri-drag-region />
      <div className="bp-bg" data-tauri-drag-region />
      <div
        className="bp-blur"
        data-tauri-drag-region
        style={{ backgroundImage: artwork ? `url('${artwork}')` : 'none' }}
      />
      <div className="bp-vignette" data-tauri-drag-region />

      <div className="bp-top-actions">
        <button
          className={`bp-top-btn${panel === 'queue' ? ' bp-lyr-active' : ''}`}
          id="bpQueueBtn"
          onClick={toggleQueue}
          aria-label="Очередь"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="15" y2="18" /><circle cx="20" cy="18" r="2" />
          </svg>
        </button>
        <button
          className={`bp-top-btn${panel === 'lyrics' ? ' bp-lyr-active' : ''}`}
          id="bpLyricsBtn"
          onClick={toggleLyrics}
          aria-label="Текст песни"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="11" y2="18" />
          </svg>
        </button>
        <button className="bp-top-btn" id="bpFontBtn" onClick={toggleFontPanel} aria-label="Настройки текста">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button className="bp-top-btn" onClick={closeBig} aria-label="Закрыть">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {fontPanelOpen && <BpFontPanel />}

      <div className={innerClass}>
        <div className="bp-left">
          <BpCover artwork={artwork} />
          <BpInfo />
          <BpProgress />
          <BpControls />
        </div>
        {/* Текст (реюз LyricsView с собственным offset) */}
        <div className={`bp-lyr-wrap${panel === 'lyrics' ? ' bp-lyr-open' : ''}`} id="bpLyricsPanel">
          {panel === 'lyrics' && <BpLyrics />}
        </div>
        {/* Очередь (реюз QueueBlock) */}
        <div className={`bp-q-wrap${panel === 'queue' ? ' bp-q-open' : ''}`} id="bpQueuePanel">
          {panel === 'queue' && <QueueBlock similarIcon />}
        </div>
      </div>
    </>
  )
}

// ── Обложка (parallax + винил + ПКМ-ctx + add-popup) ───────────────────────

const BpCover = ({ artwork }: { artwork: string | null }) => {
  const curId = useQueueStore((s) => s.curId)
  const playing = usePlayerStore((s) => s.playing)
  const playerStyle = usePlayerViewStore((s) => s.playerStyle)
  const parallax = usePlayerViewStore((s) => s.parallax)
  const coverRef = useRef<HTMLDivElement>(null)

  const curTrack =
    useLibStore((s) => (curId ? s.tracks.find((t) => t.id === curId) ?? null : null)) ??
    (curId ? trackRegistry.get(curId) ?? null : null)

  const [coverCtx, setCoverCtx] = useState<{ x: number; y: number } | null>(null)
  const [pendingNewPl, setPendingNewPl] = useState<string | null>(null)
  const [tagEditTrack, setTagEditTrack] = useState<Track | null>(null)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const allTracks = useLibStore((s) => s.tracks)

  useEffect(() => {
    if (!parallax && coverRef.current) coverRef.current.style.transform = ''
  }, [parallax])

  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!parallax) return
    const cover = coverRef.current
    if (!cover) return
    const rect = cover.getBoundingClientRect()
    const dx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const dy = ((e.clientY - rect.top) / rect.height) * 2 - 1
    cover.style.transform = `perspective(600px) rotateX(${-dy * 12}deg) rotateY(${dx * 12}deg) scale(1.03)`
  }
  const onLeave = () => {
    if (coverRef.current) coverRef.current.style.transform = ''
  }

  const vinyl = playerStyle === 'vinyl'
  const vinylCls = vinyl ? ` bp-vinyl-mode bp-vinyl-spin${playing ? '' : ' bp-vinyl-paused'}` : ''

  return (
    <>
      <div
        className={`bp-cover${vinylCls}`}
        ref={coverRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onContextMenu={(e) => {
          if (!curTrack) return
          e.preventDefault()
          e.stopPropagation()
          setCoverCtx({ x: e.clientX, y: e.clientY })
        }}
      >
        {artwork ? (
          <img id="bpCoverImg" src={artwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div className="bp-cover-empty" style={{ display: 'flex' }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        )}
      </div>
      <TrackCtxMenu
        pos={coverCtx}
        track={curTrack}
        onClose={() => setCoverCtx(null)}
        onCreatePlaylistForTrack={(id) => setPendingNewPl(id)}
        onEditTags={(t) => setTagEditTrack(t)}
      />
      <NewPlaylistModal
        open={pendingNewPl !== null}
        onClose={() => setPendingNewPl(null)}
        onCreated={(plId) => {
          if (pendingNewPl) {
            if (curTrack && curTrack.id === pendingNewPl && !allTracks.some((x) => x.id === curTrack.id))
              saveTrackToLibrary(curTrack)
            addTrackToPl(plId, pendingNewPl)
            setPendingNewPl(null)
          }
        }}
      />
      <TagEditor track={tagEditTrack} onClose={() => setTagEditTrack(null)} />
    </>
  )
}

// ── Инфо (marquee-заголовок + артист) ──────────────────────────────────────

const BpInfo = () => {
  const title = usePlayerStore((s) => s.title)
  const artist = usePlayerStore((s) => s.artist)
  const curId = useQueueStore((s) => s.curId)
  const curTrack =
    useLibStore((s) => (curId ? s.tracks.find((t) => t.id === curId) ?? null : null)) ??
    (curId ? trackRegistry.get(curId) ?? null : null)
  return (
    <div className="bp-info">
      {/* Заголовок (бейдж площадки в полноэкранном режиме не показываем). */}
      <div className="bp-title-row">
        <MarqueeTitle
          text={title || '—'}
          wrapClass="bp-title-wrap"
          textClass="bp-title"
          scrollingClass="bp-scrolling"
          offsetVar="--bp-off"
        />
      </div>
      <div className="bp-artist" id="bpArtist">
        <ArtistLinks artist={artist} scId={curTrack?.artistScId} permalink={curTrack?.artistPermalink} artistId={curTrack?.artistId} provider={curTrack?.artistProvider} />
      </div>
    </div>
  )
}

// ── Прогресс (волновой слайдер + перемотка pointer) ─────────────────────────

const BpProgress = () => {
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const sliderType = usePlayerViewStore((s) => s.sliderType)
  const curId = useQueueStore((s) => s.curId)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const [dragFrac, setDragFrac] = useState<number | null>(null)
  const pct = dragFrac != null ? dragFrac * 100 : duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  useEffect(() => {
    if (sliderType !== 'wave') return
    if (!hasWaveData()) regenWave()
    drawWaveTo(waveRef.current, pct)
  }, [pct, sliderType, curId])

  useEffect(() => {
    if (sliderType !== 'wave') return
    const onResize = () => drawWaveTo(waveRef.current, pct)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pct, sliderType])

  const seekAtPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration) return
    const r = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    setDragFrac(frac)
    seekLive(frac * duration)
  }
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration) return
    e.currentTarget.setPointerCapture(e.pointerId)
    seekAtPointer(e)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAtPointer(e)
  }
  const endDrag = () => {
    if (dragFrac != null && duration) seek(dragFrac * duration)
    setDragFrac(null)
  }
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const d = audioEngine.duration
    if (!d) return
    const t = Math.max(0, Math.min(d, audioEngine.currentTime + (e.deltaY < 0 ? 1 : -1)))
    seek(t)
  }

  return (
    <div className="bp-progress">
      <div className="bp-bar-wrap" id="bpBarWrap" onWheel={onWheel}>
        <canvas id="bpWaveCanvas" ref={waveRef} style={{ pointerEvents: 'none' }} />
        <div className="bp-bar-fill" id="bpFill" style={{ width: `${pct}%`, pointerEvents: 'none' }} />
        <div className="bp-bar-thumb" id="bpThumb" style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
        <div
          id="bpSeek"
          aria-label="Перемотка"
          style={{ position: 'absolute', inset: '-8px 0', cursor: 'pointer', touchAction: 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
      <div className="bp-times">
        <span id="bpCurt">{fmtTime(position)}</span>
        <span id="bpDurt">{fmtTime(duration)}</span>
      </div>
    </div>
  )
}

// ── Транспорт (fav/repeat/prev/play/next/shuffle/add) ───────────────────────

const BpControls = () => {
  const playing = usePlayerStore((s) => s.playing)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const curId = useQueueStore((s) => s.curId)
  const isFav = useFavStore((s) => (curId ? s.favs.has(curId) : false))
  const inLib = useLibStore((s) => (curId ? s.tracks.some((t) => t.id === curId) : false))
  const curTrack =
    useLibStore((s) => (curId ? s.tracks.find((t) => t.id === curId) ?? null : null)) ??
    (curId ? trackRegistry.get(curId) ?? null : null)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)

  const addAnchorRef = useRef<HTMLElement | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pendingNewPl, setPendingNewPl] = useState<string | null>(null)
  const openAdd = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const btn = e.currentTarget
    if (addOpen && addAnchorRef.current === btn) {
      setAddOpen(false)
      return
    }
    addAnchorRef.current = btn
    setAddOpen(true)
  }

  return (
    <div className="bp-ctrl">
      <button className={`cc${isFav ? '' : ' off'}`} id="bpFavBtn" onClick={toggleCurFav} aria-label={isFav ? 'Убрать из «Любимое»' : 'В «Любимое»'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
      </button>
      <button className={`cc${repeat > 0 ? ' on' : ''}`} id="bpRepBtn" onClick={cycleRepeatMain} aria-label="Повтор">
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      </button>
      <button className="cc" onClick={prevTr} aria-label="Предыдущий">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
          <polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth={2} />
        </svg>
      </button>
      <button className="cc-play" id="bpPlayBtn" onClick={togglePlay} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
        {playing ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" /></svg>
        )}
      </button>
      <button className="cc" onClick={nextTr} aria-label="Следующий">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
          <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth={2} />
        </svg>
      </button>
      <button className={`cc${shuffle ? ' on' : ''}`} id="bpShufBtn" onClick={toggleShuffleMain} aria-label="Перемешать">
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" strokeLinecap="round" />
          <path d="m18 2 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2" strokeLinecap="round" />
          <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8" strokeLinecap="round" />
          <path d="m18 14 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="cc" id="bpAddBtn" onClick={openAdd} aria-label="Добавить">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <AddPopup
        open={addOpen}
        onClose={() => setAddOpen(false)}
        anchorRef={addAnchorRef}
        hasTrack={!!curId}
        canAddToLib={!!curTrack && !inLib}
        trackId={curId ?? undefined}
        onAddToLib={() => {
          if (curTrack) saveTrackToLibrary(curTrack)
        }}
        onPickPlaylist={(plId) => {
          if (curTrack) {
            saveTrackToLibrary(curTrack)
            addTrackToPl(plId, curTrack.id)
          }
        }}
        onCreateNewPlaylist={() => {
          if (curId) setPendingNewPl(curId)
        }}
      />
      <NewPlaylistModal
        open={pendingNewPl !== null}
        onClose={() => setPendingNewPl(null)}
        onCreated={(plId) => {
          if (pendingNewPl) {
            if (curTrack && curTrack.id === pendingNewPl) saveTrackToLibrary(curTrack)
            addTrackToPl(plId, pendingNewPl)
            setPendingNewPl(null)
          }
        }}
      />
    </div>
  )
}

// ── Текст в BigPicture (реюз LyricsView + собственный шрифт/оффсет) ──────────

const BpLyrics = () => {
  const fontSize = useBigPicStore((s) => s.fontSize)
  const offset = useBigPicStore((s) => s.offset)
  const sz = BP_FONT_SIZES[fontSize] ?? BP_FONT_SIZES[3]!
  return (
    <LyricsView
      className="bp-lyr-scroll"
      id="bpLyricsScroll"
      active
      offsetSec={offset}
      style={
        {
          '--bp-lyr-fs': `${sz.normal}px`,
          '--bp-lyr-fs-active': `${sz.active}px`,
        } as React.CSSProperties
      }
    />
  )
}

// ── Попап настроек шрифта/оффсета ───────────────────────────────────────────

const BpFontPanel = () => {
  const fontSize = useBigPicStore((s) => s.fontSize)
  const offset = useBigPicStore((s) => s.offset)
  const setFontSize = useBigPicStore((s) => s.setFontSize)
  const adjustOffset = useBigPicStore((s) => s.adjustOffset)
  const resetOffset = useBigPicStore((s) => s.resetOffset)
  return (
    <div id="bpFontPanel" className="bp-font-panel">
      <div className="bp-font-sizes">
        {[0, 1, 2, 3].map((sz) => (
          <button
            key={sz}
            className={`bp-font-sz${fontSize === sz ? ' bp-font-sz-active' : ''}`}
            data-sz={sz}
            onClick={() => setFontSize(sz)}
          >
            A
          </button>
        ))}
      </div>
      <div className="bp-font-offset">
        <button className="bp-font-off-btn" onClick={() => adjustOffset(-0.5)}>
          −
        </button>
        <span id="bpOffsetVal" onClick={resetOffset} style={{ cursor: 'pointer' }}>
          {(offset >= 0 ? '+' : '') + offset.toFixed(1)}s
        </span>
        <button className="bp-font-off-btn" onClick={() => adjustOffset(0.5)}>
          +
        </button>
      </div>
    </div>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────────

const fmtTime = (s: number): string => {
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec < 10 ? '0' : ''}${sec}`
}
