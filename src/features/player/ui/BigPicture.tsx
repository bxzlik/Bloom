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
  createPlaylistInline,
  TrackCtxMenu,
  useTagEditStore,
} from '@features/library'
import type { Track } from '@entities/track'
import { trackRegistry, ArtistLinks } from '@entities/track'
import { useNavStore } from '@app/navigationStore'
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
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * «Новый плейлист» из фуллскрина: закрываем оверлей, уходим в библиотеку и
 * создаём плейлист с этим треком сразу в inline-редакте.
 */
const createPlFromBp = (track: Track | null, trackId?: string) => {
  useBigPicStore.getState().closeBig()
  useNavStore.getState().goNav('lib')
  createPlaylistInline(track ? { track } : { trackId })
}

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
  const t = useT()
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

  const lyrView = useBigPicStore((s) => s.lyrView)

  // Выравнивание заголовка/артиста/текста следует настройке titleAlign плеера.
  const titleAlign = usePlayerViewStore((s) => s.titleAlign)
  const modeClass =
    panel === 'lyrics'
      ? ` bp-lyr-mode${lyrView === 'text' ? ' bp-lv-text' : ''}`
      : panel === 'queue'
        ? ' bp-q-mode'
        : ''
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
          aria-label={t('player.aria.queue')}
        >
          <Ico name="queue" width={16} height={16} />
        </button>
        <button
          className={`bp-top-btn${panel === 'lyrics' ? ' bp-lyr-active' : ''}`}
          id="bpLyricsBtn"
          onClick={toggleLyrics}
          aria-label={t('player.lyrics')}
        >
          <Ico name="lyrics" width={16} height={16} />
        </button>
        <button className="bp-top-btn" id="bpFontBtn" onClick={toggleFontPanel} aria-label={t('player.aria.textSettings')}>
          <Ico name="settings" width={16} height={16} />
        </button>
        <button className="bp-top-btn" onClick={closeBig} aria-label={t('player.aria.close')}>
          <Ico name="close" width={16} height={16} />
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
            <Ico name="note" width={64} height={64} />
          </div>
        )}
      </div>
      <TrackCtxMenu
        pos={coverCtx}
        track={curTrack}
        onClose={() => setCoverCtx(null)}
        onCreatePlaylistForTrack={(id) =>
          createPlFromBp(curTrack && curTrack.id === id ? curTrack : trackRegistry.get(id) ?? null, id)
        }
        onEditTags={(t) => {
          // Выходим из фуллскрина и открываем редактор через глобальный хост
          // (TagEditor внутри BigPicInner размонтировался бы при закрытии).
          useBigPicStore.getState().closeBig()
          useTagEditStore.getState().open(t)
        }}
      />
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
  const t = useT()
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const sliderType = usePlayerViewStore((s) => s.sliderType)
  const curId = useQueueStore((s) => s.curId)
  // Фото на thumb: своё фото («Кастомизация» → Слайдер) → обложка трека (только
  // при типе 'cover'). Никогда при волновом слайдере.
  const sliderPhoto = usePlayerStore((s) => s.sliderThumb)
  const artworkRaw = usePlayerStore((s) => s.artwork)
  const coverOverride = usePlayerStore((s) => s.coverOverride)
  const frozenCover = useOptStore((s) => s.frozenCover)
  const thumbCover = frozenCover ?? coverOverride ?? artworkRaw
  const photoSrc =
    sliderType === 'wave' ? null : sliderPhoto ?? (sliderType === 'cover' ? thumbCover : null)
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
    const step = e.shiftKey ? 5 : 1
    const t = Math.max(0, Math.min(d, audioEngine.currentTime + (e.deltaY < 0 ? step : -step)))
    seek(t)
  }

  return (
    <div className="bp-progress">
      <div className="bp-bar-wrap" id="bpBarWrap" onWheel={onWheel}>
        <canvas id="bpWaveCanvas" ref={waveRef} style={{ pointerEvents: 'none' }} />
        <div className="bp-bar-fill" id="bpFill" style={{ width: `${pct}%`, pointerEvents: 'none' }} />
        <div
          className="bp-bar-thumb"
          id="bpThumb"
          style={{
            left: `${pct}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            ...(photoSrc
              ? {
                  display: 'block',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'var(--card)',
                  boxShadow: '0 2px 8px rgba(0,0,0,.6),0 0 0 2px #090909',
                }
              : null),
          }}
        >
          {photoSrc && <img src={photoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
        <div
          id="bpSeek"
          aria-label={t('player.aria.seek')}
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
  const t = useT()
  const playing = usePlayerStore((s) => s.playing)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const smartShuffle = usePlayerStore((s) => s.smartShuffle)
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
      <button className={`cc${isFav ? '' : ' off'}`} id="bpFavBtn" onClick={toggleCurFav} aria-label={isFav ? t('player.aria.favRemove') : t('player.aria.favAdd')}>
        <Ico name="heart" variant={isFav ? 'bold' : 'linear'} width={18} height={18} />
      </button>
      <button className={`cc${repeat > 0 ? ' on' : ''}`} id="bpRepBtn" onClick={cycleRepeatMain} aria-label={t('player.aria.repeat')}>
        <Ico name="repeat" width={18} height={18} />
      </button>
      <button className="cc" onClick={prevTr} aria-label={t('player.aria.prev')}>
        <Ico name="prev" width={20} height={20} />
      </button>
      <button className="cc-play" id="bpPlayBtn" onClick={togglePlay} aria-label={playing ? t('player.aria.pause') : t('player.aria.play')}>
        {playing ? <Ico name="pause" width={20} height={20} /> : <Ico name="play" width={20} height={20} />}
      </button>
      <button className="cc" onClick={nextTr} aria-label={t('player.aria.next')}>
        <Ico name="next" width={20} height={20} />
      </button>
      <button className={`cc${shuffle ? ' on' : ''}`} id="bpShufBtn" onClick={toggleShuffleMain} aria-label={smartShuffle ? t('player.aria.smartShuffle') : t('player.aria.shuffle')}>
        <Ico name="shuffle" width={18} height={18} />
        {smartShuffle && <span className="cc-badge"><Ico name="stars" width={9} height={9} /></span>}
      </button>
      <button className="cc" id="bpAddBtn" onClick={openAdd} aria-label={t('player.aria.add')}>
        <Ico name="add" width={18} height={18} />
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
          if (curId) createPlFromBp(curTrack, curId)
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
  const t = useT()
  const fontSize = useBigPicStore((s) => s.fontSize)
  const offset = useBigPicStore((s) => s.offset)
  const panel = useBigPicStore((s) => s.panel)
  const lyrView = useBigPicStore((s) => s.lyrView)
  const setFontSize = useBigPicStore((s) => s.setFontSize)
  const setView = useBigPicStore((s) => s.setView)
  const adjustOffset = useBigPicStore((s) => s.adjustOffset)
  const resetOffset = useBigPicStore((s) => s.resetOffset)

  // Активный вид: «Обложка» = без панели текста, иначе раскладка текста.
  const view = panel === 'lyrics' ? lyrView : 'cover'
  const views = [
    { id: 'all', icon: 'eye', label: t('player.view.all') },
    { id: 'cover', icon: 'gallery', label: t('player.view.cover') },
    { id: 'text', icon: 'text', label: t('player.view.text') },
  ] as const

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
      <div className="bp-panel-sep" />
      <div className="bp-view">
        <div className="bp-view-label">{t('player.view.label')}</div>
        {views.map((v) => (
          <button
            key={v.id}
            className={`bp-view-opt${view === v.id ? ' bp-view-opt-active' : ''}`}
            onClick={() => setView(v.id)}
          >
            <Ico name={v.icon} width={16} height={16} />
            {v.label}
          </button>
        ))}
      </div>
      <div className="bp-panel-sep" />
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
