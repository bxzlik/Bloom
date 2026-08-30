import {
  useEffect,
  useLayoutEffect,
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
import { LyricsView, useLyricsBtnVisible, useLyricsStore } from '@features/lyrics'
import { usePlayerViewStore, useOptStore, type TrackAnimKind } from '@features/settings'
import { usePlayerStore } from '../model/store'
import { useQueueStore } from '../model/queueStore'
import { useBigPicStore, BP_FONT_SIZES, type BpPanel } from '../model/bigPicStore'
import {
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
import { TrackSwap } from './TrackSwap'
import { PlayPauseButton } from './PlayPauseButton'
import { QueueBlock } from './QueueBlock'
import { AddPopup } from './AddPopup'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Длительности анимаций выхода — DOM живёт ровно столько, сколько идёт
 * соответствующий keyframes в animations.css (bpSheetOut / bpPanelOut).
 * Меняешь тайминг в CSS — меняй и здесь.
 */
const BP_SHEET_OUT_MS = 460
const BP_PANEL_OUT_MS = 240
/** Переезд левой колонки (FLIP) при смене раскладки — только JS, без CSS-пары. */
const BP_FLIP_MS = 420

/**
 * Позиция обложки внутри левой колонки — ОТНОСИТЕЛЬНО оверлея, а не вьюпорта:
 * так замер не сбивается transform'ом шторки, если раскладка меняется прямо во
 * время въезда фуллскрина. `null` — колонка скрыта (вид «Текст»), ехать нечему.
 */
const coverPos = (left: HTMLElement | null): { x: number; y: number } | null => {
  const cov = left?.querySelector('.bp-cover')
  const ov = document.getElementById('bigPicOverlay')
  if (!cov || !ov) return null
  const c = cov.getBoundingClientRect()
  if (!c.width) return null
  const o = ov.getBoundingClientRect()
  return { x: c.left - o.left, y: c.top - o.top }
}

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

  // Оверлей переживает closeBig ещё на время bpSheetOut — эти миллисекунды
  // шторка уезжает вниз. 'closing' = стор уже закрыт, DOM ещё жив.
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>(open ? 'open' : 'closed')
  useEffect(() => {
    if (open) setPhase('open')
    else setPhase((p) => (p === 'closed' ? 'closed' : 'closing'))
  }, [open])
  useEffect(() => {
    if (phase !== 'closing') return
    const id = window.setTimeout(() => setPhase('closed'), BP_SHEET_OUT_MS)
    return () => window.clearTimeout(id)
  }, [phase])
  const visible = phase !== 'closed'

  // Esc закрывает. body overflow + скрытие тайтлбара — до конца анимации выхода,
  // иначе тайтлбар окна проступил бы сквозь ещё едущую шторку.
  useEffect(() => {
    if (!visible) return
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
  }, [visible, closeBig])

  return (
    <div id="bigPicOverlay" className={visible ? `open${phase === 'closing' ? ' bp-closing' : ''}` : ''}>
      {visible && <BigPicInner />}
    </div>
  )
}

// ── Внутренности (монтируются только когда открыто — replay анимаций + scoped effects) ──

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
  const lyricsBtnVisible = useLyricsBtnVisible(panel === 'lyrics')

  // Анимация смены трека («Плеер» → Анимация смены трека → Полный экран).
  // Обложка (вместе с размытой подложкой) и подпись — независимо.
  const coverAnim = usePlayerViewStore((s) => s.trackAnim.big.cover)
  const textAnim = usePlayerViewStore((s) => s.trackAnim.big.text)
  const curId = useQueueStore((s) => s.curId)

  // Эффективная панель отстаёт от стора на время анимации выхода: пока очередь
  // или текст уезжают вправо, раскладка (.bp-inner) остаётся прежней — иначе
  // колонка схлопнулась бы в центр раньше, чем панель успела уехать.
  const [ph, setPh] = useState<{ p: BpPanel; closing: boolean }>({ p: panel, closing: false })
  useEffect(() => {
    setPh((prev) =>
      panel !== 'none'
        ? prev.p === panel && !prev.closing
          ? prev
          : { p: panel, closing: false }
        : prev.p === 'none'
          ? prev
          : { p: prev.p, closing: true },
    )
  }, [panel])
  useEffect(() => {
    if (!ph.closing) return
    const id = window.setTimeout(() => setPh({ p: 'none', closing: false }), BP_PANEL_OUT_MS)
    return () => window.clearTimeout(id)
  }, [ph.closing])
  const shownPanel = ph.p

  // FLIP: при смене раскладки обложка (вместе со всей левой колонкой) не
  // прыгает из центра к краю окна, а доезжает (см. coverPos выше).
  const leftRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<{ x: number; y: number } | null>(null)
  // Между сменами раскладки окно могло поменять размер — иначе прошлый замер
  // протух бы и колонка уехала не туда.
  useEffect(() => {
    const onResize = () => {
      posRef.current = coverPos(leftRef.current)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useLayoutEffect(() => {
    const el = leftRef.current
    const prev = posRef.current
    const next = coverPos(el)
    posRef.current = next
    if (!el || !prev || !next) return
    const dx = prev.x - next.x
    const dy = prev.y - next.y
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px,${dy}px)`
    void el.offsetWidth // без reflow браузер склеит оба стиля в один кадр
    el.style.transition = `transform ${BP_FLIP_MS}ms cubic-bezier(.22,1,.36,1)`
    el.style.transform = 'translate(0,0)'
    // Снимаем inline-трансформ: оставленный, он был бы containing block для
    // fixed-потомков (попапы ♥/+) и держал бы композиторный слой.
    const id = window.setTimeout(() => {
      el.style.transition = ''
      el.style.transform = ''
    }, BP_FLIP_MS + 40)
    return () => window.clearTimeout(id)
  }, [shownPanel, lyrView])

  // Авто-текст: на каждый заход в фуллскрин панель текста включается сама, как
  // только текст для трека найден (status → ready). Ручное переключение панели
  // гасит `autoLyr` — дальше раскладка живёт как оставили, даже при смене трека.
  const autoLyr = useBigPicStore((s) => s.autoLyr)
  const lyricsStatus = useLyricsStore((s) => s.status)
  useEffect(() => {
    if (!autoLyr) return
    // 'loading'/'idle' — промежуточные состояния при смене трека, панель не дёргаем.
    if (lyricsStatus === 'ready') useBigPicStore.setState({ panel: 'lyrics', lyrView: 'all' })
    else if (lyricsStatus === 'empty') useBigPicStore.setState({ panel: 'none' })
  }, [autoLyr, lyricsStatus])

  // Прячем верхние кнопки, пока курсор вне окна приложения (fade-out).
  const [cursorOut, setCursorOut] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const onLeave = () => setCursorOut(true)
    const onEnter = () => setCursorOut(false)
    root.addEventListener('mouseleave', onLeave)
    root.addEventListener('mouseenter', onEnter)
    return () => {
      root.removeEventListener('mouseleave', onLeave)
      root.removeEventListener('mouseenter', onEnter)
    }
  }, [])

  // Выравнивание заголовка/артиста/текста следует настройке titleAlign плеера.
  const titleAlign = usePlayerViewStore((s) => s.titleAlign)
  // Раскладка следует за эффективной панелью (shownPanel), а не за стором.
  const modeClass =
    shownPanel === 'lyrics'
      ? ` bp-lyr-mode${lyrView === 'text' ? ' bp-lv-text' : ''}`
      : shownPanel === 'queue'
        ? ' bp-q-mode'
        : ' bp-cov-mode'
  // bp-chrome-out — ♥/+ на обложке и транспорт гаснут вместе с верхними
  // кнопками, пока курсор вне окна.
  const innerClass = `bp-inner bp-align-${titleAlign}${modeClass}${cursorOut ? ' bp-chrome-out' : ''}`

  return (
    <>
      {/* Тайтлбар + фоновые слои = drag-зоны окна (двойной клик — максимайз). */}
      <div className="bp-titlebar" id="bpTitlebar" data-tauri-drag-region />
      <div className="bp-bg" data-tauri-drag-region />
      {/* Размытая подложка = та же обложка → перетекает вместе с ней. Всегда
          затуханием, даже при слайде: смещать подложку нельзя — она растянута
          scale(1.25) и дрейфует, край вылез бы в кадр. */}
      <TrackSwap id={curId} kind={coverAnim === 'none' ? 'none' : 'fade'} fill className="bp-blur-swap">
        <div
          className="bp-blur"
          data-tauri-drag-region
          style={{ backgroundImage: artwork ? `url('${artwork}')` : 'none' }}
        />
      </TrackSwap>
      <div className="bp-vignette" data-tauri-drag-region />

      {/* Выход — отдельной кнопкой слева (стрелка вниз = «свернуть фуллскрин»). */}
      <div className={`bp-top-left${cursorOut ? ' bp-chrome-hidden' : ''}`}>
        <button className="bp-top-btn" onClick={closeBig} aria-label={t('player.aria.close')}>
          <Ico name="arrowDown" width={17} height={17} />
        </button>
      </div>

      <div className={`bp-top-actions${cursorOut ? ' bp-chrome-hidden' : ''}`}>
        <button
          className={`bp-top-btn${panel === 'queue' ? ' bp-lyr-active' : ''}`}
          id="bpQueueBtn"
          onClick={toggleQueue}
          aria-label={t('player.aria.queue')}
        >
          <Ico name="sidebar" width={15} height={15} />
        </button>
        {lyricsBtnVisible && (
          <button
            className={`bp-top-btn${panel === 'lyrics' ? ' bp-lyr-active' : ''}`}
            id="bpLyricsBtn"
            onClick={toggleLyrics}
            aria-label={t('player.lyrics')}
          >
            <Ico name="lyrics" width={15} height={15} />
          </button>
        )}
        <button className="bp-top-btn" id="bpFontBtn" onClick={toggleFontPanel} aria-label={t('player.aria.textSettings')}>
          <Ico name="settings" width={15} height={15} />
        </button>
      </div>

      {fontPanelOpen && <BpFontPanel />}

      <div className={innerClass}>
        {/* .bp-left — грид «пустая строка / обложка / всё остальное»: обложка
            стоит ровно по центру высоты окна во всех режимах, подпись с
            транспортом висят под ней (см. big-picture.css). */}
        <div className="bp-left" ref={leftRef}>
          <BpCover artwork={artwork} anim={coverAnim} />
          <div className="bp-below">
            <BpInfo anim={textAnim} />
            {/* Без боковых панелей прогресс уезжает вниз окна (см. ниже). */}
            {shownPanel !== 'none' && <BpProgress />}
            <BpControls />
          </div>
        </div>
        {/* Текст (реюз LyricsView с собственным offset) */}
        <div
          className={`bp-lyr-wrap${shownPanel === 'lyrics' ? ' bp-lyr-open' : ''}${ph.closing ? ' bp-panel-out' : ''}`}
          id="bpLyricsPanel"
        >
          {shownPanel === 'lyrics' && <BpLyrics />}
        </div>
        {/* Очередь (реюз QueueBlock) */}
        <div
          className={`bp-q-wrap${shownPanel === 'queue' ? ' bp-q-open' : ''}${ph.closing ? ' bp-panel-out' : ''}`}
          id="bpQueuePanel"
        >
          {shownPanel === 'queue' && <QueueBlock />}
        </div>
      </div>

      {/* Вид «только обложка»: полоса прогресса во всю ширину внизу окна.
          Рендерим вне .bp-inner — иначе FLIP-трансформ левой колонки стал бы
          для неё containing block (position:fixed) и таскал бы её за собой. */}
      {shownPanel === 'none' && <BpProgress bottom />}
    </>
  )
}

// ── Обложка (parallax + винил + ПКМ-ctx + add-popup) ───────────────────────

const BpCover = ({ artwork, anim }: { artwork: string | null; anim: TrackAnimKind }) => {
  const t = useT()
  const curId = useQueueStore((s) => s.curId)
  const playing = usePlayerStore((s) => s.playing)
  const playerStyle = usePlayerViewStore((s) => s.playerStyle)
  const parallax = usePlayerViewStore((s) => s.parallax)
  const coverRef = useRef<HTMLDivElement>(null)

  const curTrack =
    useLibStore((s) => (curId ? s.tracks.find((t) => t.id === curId) ?? null : null)) ??
    (curId ? trackRegistry.get(curId) ?? null : null)

  // ♥/+ живут на обложке (как в плеере, .cov-fav/.cov-add).
  const isFav = useFavStore((s) => (curId ? s.favs.has(curId) : false))
  const inLib = useLibStore((s) => (curId ? s.tracks.some((tr) => tr.id === curId) : false))
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
        <TrackSwap id={curId} kind={anim} fill>
          {artwork ? (
            <img id="bpCoverImg" src={artwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div className="bp-cover-empty" style={{ display: 'flex' }}>
              <Ico name="note" width={64} height={64} />
            </div>
          )}
        </TrackSwap>
        <button
          className={`bp-cov-fav${isFav ? '' : ' off'}`}
          id="bpFavBtn"
          onClick={(e) => {
            e.stopPropagation()
            toggleCurFav()
          }}
          aria-label={isFav ? t('player.aria.favRemove') : t('player.aria.favAdd')}
        >
          <Ico name="heart" variant={isFav ? 'bold' : 'linear'} width={20} height={20} />
        </button>
        <button className="bp-cov-add" id="bpAddBtn" onClick={openAdd} aria-label={t('player.aria.add')}>
          <Ico name="addCircle" width={22} height={22} />
        </button>
      </div>
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

const BpInfo = ({ anim }: { anim: TrackAnimKind }) => {
  const title = usePlayerStore((s) => s.title)
  const artist = usePlayerStore((s) => s.artist)
  const curId = useQueueStore((s) => s.curId)
  const curTrack =
    useLibStore((s) => (curId ? s.tracks.find((t) => t.id === curId) ?? null : null)) ??
    (curId ? trackRegistry.get(curId) ?? null : null)
  return (
    <TrackSwap id={curId} kind={anim} layerClass="bp-info">
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
    </TrackSwap>
  )
}

// ── Прогресс (волновой слайдер + перемотка pointer) ─────────────────────────

const BpProgress = ({ bottom = false }: { bottom?: boolean }) => {
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
    <div className={`bp-progress${bottom ? ' bp-progress-bottom' : ''}`}>
      {/* bp-seeking снимает транзишн заливки на время перетаскивания: при
          обычном воспроизведении он сглаживает редкие тики позиции, а под
          курсором превращался в отставание полосы от ползунка (в плеере
          транзишена нет вовсе — там перемотка 1-в-1). */}
      <div
        className={`bp-bar-wrap${dragFrac != null ? ' bp-seeking' : ''}`}
        id="bpBarWrap"
        onWheel={onWheel}
        style={{ ['--sl-pct' as string]: pct } as React.CSSProperties}
      >
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

// ── Транспорт (repeat/prev/play/next/shuffle) ───────────────────────────────

const BpControls = () => {
  const t = useT()
  const shuffle = usePlayerStore((s) => s.shuffle)
  const smartShuffle = usePlayerStore((s) => s.smartShuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  // Размеры транспорта одинаковы во всех режимах (боксы — в big-picture.css).
  const sm = 22
  const md = 24
  const play = 26

  // ♥/+ переехали на обложку (BpCover) — здесь только транспорт.
  return (
    <div className="bp-ctrl">
      <button className={`cc${repeat > 0 ? ' on' : ''}`} id="bpRepBtn" onClick={cycleRepeatMain} aria-label={t('player.aria.repeat')}>
        <Ico name="repeat" width={sm} height={sm} />
        {/* «Повтор плейлиста» — иконка списка, «повтор одного» — цифра в
            акцентном кружке; те же бейджи, что на странице плеера и в баре
            (RepeatAllBadge / RepeatOneBadge). Позиция бейджей задана в
            big-picture.css: боксы тут крупнее (46px), угол по умолчанию
            отстоял бы от иконки. */}
        {repeat === 1 && <span className="cc-badge"><Ico name="list" width={9} height={9} /></span>}
        {repeat === 2 && <span className="cc-badge num" style={{ fontSize: 8, fontWeight: 700 }}>1</span>}
      </button>
      <button className="cc" onClick={prevTr} aria-label={t('player.aria.prev')}>
        <Ico name="prev" width={md} height={md} />
      </button>
      <PlayPauseButton size={play} id="bpPlayBtn" />
      <button className="cc" onClick={nextTr} aria-label={t('player.aria.next')}>
        <Ico name="next" width={md} height={md} />
      </button>
      <button className={`cc${shuffle ? ' on' : ''}`} id="bpShufBtn" onClick={toggleShuffleMain} aria-label={smartShuffle ? t('player.aria.smartShuffle') : t('player.aria.shuffle')}>
        <Ico name="shuffle" width={sm} height={sm} />
        {smartShuffle && <span className="cc-badge"><Ico name="stars" width={9} height={9} /></span>}
      </button>
    </div>
  )
}

// ── Текст в BigPicture (реюз LyricsView + собственный шрифт/оффсет) ──────────

const BpLyrics = () => {
  const fontSize = useBigPicStore((s) => s.fontSize)
  const offset = useBigPicStore((s) => s.offset)
  const st = usePlayerViewStore((s) => s.lyricsStyle.big)
  const sz = BP_FONT_SIZES[fontSize] ?? BP_FONT_SIZES[3]!
  return (
    <LyricsView
      className="bp-lyr-scroll"
      id="bpLyricsScroll"
      active
      fill={st.fill}
      fx={st.fx}
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
  // Без текста раскладки с текстом («Всё»/«Текст») выбирать не из чего —
  // остаётся только «Обложка».
  const lyricsAvail = useLyricsBtnVisible(panel === 'lyrics')
  const views = (
    [
      { id: 'all', icon: 'eye', label: t('player.view.all') },
      { id: 'cover', icon: 'gallery', label: t('player.view.cover') },
      { id: 'text', icon: 'text', label: t('player.view.text') },
    ] as const
  ).filter((v) => lyricsAvail || v.id === 'cover')

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
