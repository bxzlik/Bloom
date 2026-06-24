import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  useFavStore,
  useLibStore,
  usePlaylistStore,
  saveTrackToLibrary,
  createPlaylistInline,
  TrackCtxMenu,
  TagEditor,
} from '@features/library'
import type { Track } from '@entities/track'
import { trackRegistry, ArtistLinks, providerBrandColor } from '@entities/track'
import { useNavStore } from '@app/navigationStore'
import { useBadgePrefs } from '@shared/lib/badgePrefs'
import { useT } from '@shared/i18n'
import { usePlayerStore } from '../model/store'
import { useQueueStore } from '../model/queueStore'
import { useEqStore } from '../model/eqStore'
import { useBigPicStore } from '../model/bigPicStore'
import {
  togglePlay,
  prevTr,
  nextTr,
  seek,
  seekLive,
  setVol,
  toggleMuteMain,
  toggleShuffleMain,
  cycleRepeatMain,
  toggleCurFav,
  playFromCurrentQueue,
  trackProviderId,
} from '../api/play'
import { audioEngine } from '../lib/audioEngine'
import { regenWave, hasWaveData, drawWaveTo } from '../lib/waveSlider'
import { vizSetCanvas, vizStart, vizStop } from '../lib/visualizer'
import { QueueBlock } from './QueueBlock'
import { LyricsQueueBlock } from './LyricsQueueBlock'
import { MarqueeTitle } from './MarqueeTitle'
import { AddPopup } from './AddPopup'
import { SpeedPicker } from './SpeedPicker'
import { SourcePicker, providerLogo } from './SourcePicker'
import { DlMenu } from './DlMenu'
import { EqPanel } from './EqPanel'
import { SPEEDS, useSpeedStore } from '../model/speedStore'
import { LyricsPanel, LyricsToggleButton, useLyricsStore } from '@features/lyrics'
import { DislikeButton } from '@features/wave'
import { usePlayerViewStore, useThemeStore, useOptStore } from '@features/settings'
import { toast } from '@shared/ui'
import { SkipBack, SkipForward, Play, Pause, Volume1, Volume2, VolumeX } from 'lucide-react'

/**
 * «Новый плейлист» из плеера: закрываем фуллскрин (если открыт), уходим в
 * библиотеку и создаём плейлист с этим треком сразу в inline-редакте.
 */
const createPlFromPlayer = (id: string) => {
  const tr = useLibStore.getState().tracks.find((x) => x.id === id) ?? trackRegistry.get(id) ?? null
  useBigPicStore.getState().closeBig()
  useNavStore.getState().goNav('lib')
  createPlaylistInline(tr ? { track: tr } : { trackId: id })
}

/**
 * page-player — главное представление плеера (#page-player).
 *
 * MVP-скоуп: empty state + active state (cover, title, artist, progress, 5
 * кнопок управления, громкость + fav/add).
 *
 * Сделано: очередь (#playerQueueBlock), lyrics overlay (#lyricsPanel),
 * текст-вместо-очереди (#lyricsQueueBlock), след.трек (#nextTrackBlock),
 * стиль vinyl + large (style-large grid-ветка), wave-слайдер (#waveCanvas),
 * визуализатор (#vizWrap + AnalyserNode), speed picker, dislike, lyrics-toggle,
 * SC badge, marquee.
 *
 * Отложено: vizPhoto (фон-картинка визуализатора вместо баров).
 */
export const PagePlayer = ({ active }: { active: boolean }) => {
  const curId = useQueueStore((s) => s.curId)
  return (
    <div className={`page${active ? ' active' : ''}`} id="page-player">
      {!curId ? <EmptyState /> : <PlayerContent />}
    </div>
  )
}

// ── empty ────────────────────────────────────────────────────────────────

/** Список каомодзи `_kao`. */
const KAOMOJI = [
  '(◕‿◕)', ';)', '(^‿^)', 'ʕ•ᴥ•ʔ', '(ﾉ◕ヮ◕)ﾉ', '٩(◕‿◕。)۶', '(✿◠‿◠)', '(*^▽^*)', 'ヽ(^Д^)ノ',
  '(づ￣³￣)づ', '(。♥‿♥。)', '(｡◕‿◕｡)', 'ヾ(≧▽≦*)ノ', '(ᵔᴥᵔ)', '(¬‿¬)', ':)', ':D', ':]', ':3', ':*',
  ':P', ':O', 'xD', 'XD', ';P', 'B)', '=)', '=D', ':(', ":'(", ':/', ':|', '>:(', 'D:', '>:)', 'o_O',
  'O_o', 'o_o', '0_0', '^_^', '^-^', '-_-', 'u_u', 'UwU', 'OwO', '(•ᴗ•)', '(˘ω˘)', '(*˘︶˘*)', '(ಠ‿ಠ)',
  '(¯▿¯)', '(￣▽￣)', '╰(*°▽°*)╯', '(⁀ᗢ⁀)', '(っ˘ω˘ς)', '(⌒‿⌒)', '(˶˃ ᵕ ˂˶)', 'ヽ(♡‿♡)ノ', '(´• ω •`)',
  '(人•͈ᴗ•͈)', '꒰ᐢ. .ᐢ꒱', '(=^･ω･^=)', 'ฅ^•ﻌ•^ฅ', '(ง •̀_•́)ง', '(눈_눈)', 'ლ(ಠ益ಠლ)', '(ノಠ益ಠ)ノ',
  'щ(ಠ益ಠщ)', '(╯°□°）╯', '┻━┻ ︵ヽ(°□°)ﾉ︵ ┻━┻', '(◣_◢)', '( ˘︹˘ )', '(╥_╥)', '(っ °Д °;)っ',
  'Σ(°△°|||)', '(⊙_⊙)', '( •_•)', '( •_•)>⌐■-■', '(⌐■_■)', '¯\\_(ツ)_/¯', '(งツ)ว', '(ó﹏ò｡)',
  '(｡•́︿•̀｡)', '(っ˘̩╭╮˘̩)っ', '(T_T)', '( ´･･)ﾉ(._.`)', '(˶•༝•˶)', '(˘▾˘)', 'ヾ(•ω•`)o', '(≧◡≦)',
  '╮(￣▽￣)╭',
]

/**
 * Каомодзи-бокс пустого плеера: по клику меняется на случайный другой с
 * fade-анимацией. CSS — #homeKaomojiText.kao-fade.
 */
const KaomojiBox = () => {
  const [idx, setIdx] = useState(0)
  const [fading, setFading] = useState(false)
  const next = () => {
    if (fading) return
    setFading(true)
    window.setTimeout(() => {
      setIdx((prev) => {
        let n = prev
        while (n === prev && KAOMOJI.length > 1) n = Math.floor(Math.random() * KAOMOJI.length)
        return n
      })
      setFading(false)
    }, 350)
  }
  return (
    <div className="home-kaomoji" style={{ fontSize: 18, height: 42, padding: '0 14px' }} onClick={next}>
      <span id="homeKaomojiText" className={fading ? 'kao-fade' : undefined}>{KAOMOJI[idx]}</span>
    </div>
  )
}

const EmptyState = () => {
  const t = useT()
  return (
  <div
    id="playerEmpty"
    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <KaomojiBox />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{t('player.selectTrack')}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
          {t('player.selectTrackSub')}
        </div>
      </div>
    </div>
  </div>
  )
}

// ── active ───────────────────────────────────────────────────────────────

const PlayerContent = () => {
  const t = useT()
  const title = usePlayerStore((s) => s.title)
  const artist = usePlayerStore((s) => s.artist)
  const artworkRaw = usePlayerStore((s) => s.artwork)
  const coverOverride = usePlayerStore((s) => s.coverOverride)
  // Замороженный кадр GIF-обложки (оптимизация при расфокусе) перекрывает всё.
  const frozenCover = useOptStore((s) => s.frozenCover)
  // Кастомная обложка (раздел «Кастомизация») перекрывает обложку трека.
  const artwork = frozenCover ?? coverOverride ?? artworkRaw
  const playing = usePlayerStore((s) => s.playing)
  const volume = usePlayerStore((s) => s.volume)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const curId = useQueueStore((s) => s.curId)
  const isLoading = useQueueStore((s) => s.loadingId !== null && s.loadingId === s.curId)
  const isFav = useFavStore((s) => (curId ? s.favs.has(curId) : false))
  const inLib = useLibStore((s) => (curId ? s.tracks.some((t) => t.id === curId) : false))
  const curTrack =
    useLibStore((s) => (curId ? s.tracks.find((t) => t.id === curId) ?? null : null)) ??
    (curId ? trackRegistry.get(curId) ?? null : null)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const speedIdx = useSpeedStore((s) => s.idx)

  // Раздел «Плеер»: выравнивание заголовка + эффекты обложки (ambient/parallax).
  // NB: accent/ambientGlow подписываем ИМПЕРАТИВНО в effect ниже (не реактивно),
  // иначе смена акцента (в т.ч. авто-акцент на каждый трек) перерисовывала бы
  // весь PlayerContent с очередью → лаг тоггла авто-акцента при игре.
  const titleAlign = usePlayerViewStore((s) => s.titleAlign)
  const parallax = usePlayerViewStore((s) => s.parallax)
  const queuePos = usePlayerViewStore((s) => s.queuePos)
  const hideQueue = usePlayerViewStore((s) => s.hideQueue)
  const playerStyle = usePlayerViewStore((s) => s.playerStyle)
  const lyricsInQueue = usePlayerViewStore((s) => s.lyricsInQueue)
  const showNextTrack = usePlayerViewStore((s) => s.showNextTrack)
  const lyricsOpen = useLyricsStore((s) => s.open)
  const coverRef = useRef<HTMLDivElement>(null)

  // Текст вместо очереди:
  // когда настройка включена и панель текста открыта — место очереди занимает
  // блок текста (#lyricsQueueBlock), а overlay над обложкой не рендерим.
  const lyricsInQueueActive = lyricsInQueue && lyricsOpen
  // Пластинка: круглая обложка + вращение (пауза анимации, когда стоит).
  const vinyl = playerStyle === 'vinyl'
  // Большой плеер: grid-раскладка `.style-large` (обложка крупно + нижний бар).
  const large = playerStyle === 'large'
  // Кино: grid-раскладка `.style-cinema` — как large, но без нижнего бара,
  // инфо/прогресс/контролы накладываются на крупную обложку.
  const cinema = playerStyle === 'cinema'
  // Общая grid-раскладка (large + cinema): обложка крупно + очередь сбоку.
  const gridLayout = large || cinema

  // Speed picker (анкор — кнопка скорости в левой части транспорта).
  const speedBtnRef = useRef<HTMLButtonElement>(null)
  const [speedOpen, setSpeedOpen] = useState(false)
  // Меню скачивания (анкор — кнопка #dlMenuBtn слева от скорости).
  const dlBtnRef = useRef<HTMLButtonElement>(null)
  const [dlOpen, setDlOpen] = useState(false)
  // Выбор площадки текущего трека (анкор — бейдж-кнопка в транспорте).
  const srcBtnRef = useRef<HTMLButtonElement>(null)
  const [srcOpen, setSrcOpen] = useState(false)
  const curProviderId = trackProviderId(curTrack)
  // Цвет кнопки-триггера площадки: бренд-цвет текущей площадки (если включён режим
  // брендовых бейджей) либо акцент.
  const srcBtnColor =
    (!useBadgePrefs((s) => s.accentBadges) ? providerBrandColor(curProviderId) : undefined) ?? 'var(--accent)'
  // Бейдж площадки показываем только для сетевых треков (SoundCloud/Яндекс).
  const isNetworkTrack = curProviderId !== 'local'
  // Эквалайзер (анкор — кнопка EQ в правом слоте транспорта).
  const eqBtnRef = useRef<HTMLButtonElement>(null)
  const [eqOpen, setEqOpen] = useState(false)
  const eqActive = useEqStore((s) => s.active)

  // Ctx-меню по ПКМ на обложке текущего трека (
  // `oncontextmenu="if(curId){showCtx(event,curId)}"`).
  const [coverCtx, setCoverCtx] = useState<{ x: number; y: number } | null>(null)
  // Ctx-меню по ПКМ на блоке «Следующий трек».
  const [nextCtx, setNextCtx] = useState<{ track: Track; x: number; y: number } | null>(null)
  const [tagEditTrack, setTagEditTrack] = useState<Track | null>(null)

  // AddPopup для cov-add и mainCovAdd. Анкор подменяется по клику.
  // Toggle: повторный клик на ту же кнопку закрывает попап.
  const addAnchorRef = useRef<HTMLElement | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const openAddPopup = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const btn = e.currentTarget
    if (addOpen && addAnchorRef.current === btn) {
      setAddOpen(false)
      return
    }
    addAnchorRef.current = btn
    setAddOpen(true)
  }

  // Sync fav в playerStore (если меняется вне плеера).
  useEffect(() => {
    usePlayerStore.setState({ fav: isFav })
  }, [isFav])

  // Ambient Glow — свечение обложки в цвет акцента.
  // accent/ambientGlow слушаем ИМПЕРАТИВНО через store.subscribe — чтобы их
  // изменения не ре-рендерили PlayerContent (см. NB выше). artwork/curId как
  // deps — обложка меняется через ре-рендер всё равно.
  useEffect(() => {
    const apply = () => {
      const cover = coverRef.current
      if (!cover) return
      if (!usePlayerViewStore.getState().ambientGlow) {
        cover.style.boxShadow = 'none'
        return
      }
      const rgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '136,136,136'
      cover.style.boxShadow = `0 0 60px 10px rgba(${rgb},.28), 0 0 120px 20px rgba(${rgb},.12)`
    }
    apply()
    const unTheme = useThemeStore.subscribe((s, p) => {
      if (s.accent !== p.accent) apply()
    })
    const unView = usePlayerViewStore.subscribe((s, p) => {
      if (s.ambientGlow !== p.ambientGlow) apply()
    })
    return () => {
      unTheme()
      unView()
    }
  }, [artwork, curId])

  // Parallax — сброс трансформа при выключении.
  useEffect(() => {
    if (!parallax && coverRef.current) coverRef.current.style.transform = ''
  }, [parallax])

  // Parallax 3D-наклон обложки по мыши.
  const onCoverMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!parallax) return
    const cover = coverRef.current
    if (!cover) return
    const rect = cover.getBoundingClientRect()
    const dx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const dy = ((e.clientY - rect.top) / rect.height) * 2 - 1
    cover.style.transform = `perspective(600px) rotateX(${-dy * 12}deg) rotateY(${dx * 12}deg) scale(1.03)`
  }
  const onCoverLeave = () => {
    if (!parallax || !coverRef.current) return
    coverRef.current.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)'
  }

  const onWheelVol = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const cur = usePlayerStore.getState().volume
    setVol(Math.min(100, Math.max(0, cur + (e.deltaY < 0 ? 1 : -1))))
  }

  // ── Общие JSX-куски (та же область видимости → те же хендлеры/рефы) ──────
  // Используются и стандартной, и «большой» (style-large) раскладками.
  const coverImg = artwork ? (
    <img src={artwork} alt="" />
  ) : (
    <div className="ps-cover-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" style={{ opacity: 0.12 }}>
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  )
  const favOverlayBtn = (
    <button onClick={toggleCurFav} className={`cov-fav${isFav ? '' : ' off'}`} aria-label={isFav ? t('player.aria.favRemove') : t('player.aria.favAdd')}>
      <HeartSvg size={18} filled={isFav} />
    </button>
  )
  const addOverlayBtn = (
    <button className="cov-add" aria-label={t('player.aria.add')} onClick={openAddPopup}>
      <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  )
  // Клик по обложке открывает полноэкранный режим: кроме кликов по fav/add и когда открыта панель текста.
  const onCoverClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t.closest('.cov-fav') || t.closest('.cov-add')) return
    if (t.closest('#lyricsPanel') || (lyricsOpen && !lyricsInQueue)) return
    useBigPicStore.getState().openBig()
  }
  // withBtns=false в large: fav/add уезжают в sl-bottom-info.
  const renderCover = (withBtns: boolean) => (
    <div
      ref={coverRef}
      className={`ps-cover${vinyl ? ` vinyl-mode vinyl-spin${playing ? '' : ' vinyl-paused'}` : ''}`}
      style={{ position: 'relative', cursor: 'pointer' }}
      onMouseMove={onCoverMove}
      onMouseLeave={onCoverLeave}
      onClick={onCoverClick}
      onContextMenu={(e) => {
        if (!curTrack) return
        e.preventDefault()
        e.stopPropagation()
        setCoverCtx({ x: e.clientX, y: e.clientY })
      }}
    >
      {coverImg}
      {/* Спиннер пока резолвится/буферизуется стрим. */}
      {isLoading && (
        <div className="ps-cover-loading">
          <div className="sc-spinner" />
        </div>
      )}
      {withBtns && favOverlayBtn}
      {withBtns && addOverlayBtn}
      {/* Панель текста — overlay поверх обложки (#lyricsPanel). При «тексте
          вместо очереди» overlay не нужен — текст уходит в область очереди. */}
      {!lyricsInQueue && <LyricsPanel />}
    </div>
  )
  const titleRowNode = (
    <div
      id="psTitleRow"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}
    >
      <TitleCopyOnClick title={title || t('player.notSelected')} artist={artist} />
    </div>
  )
  const artistNode = (
    <div className="ps-artist">
      <ArtistLinks artist={artist} scId={curTrack?.artistScId} permalink={curTrack?.artistPermalink} artistId={curTrack?.artistId} provider={curTrack?.artistProvider} />
    </div>
  )
  // ── Отдельные кнопки транспорта (вынесены, чтобы переставлять по группам) ──
  const dlBtnNode = (
    <button
      ref={dlBtnRef}
      className="cc"
      id="dlMenuBtn"
      aria-label={t('player.aria.download')}
      onClick={(e) => {
        e.stopPropagation()
        setDlOpen((v) => !v)
      }}
    >
      <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </button>
  )
  const speedBtnNode = (
    <button
      ref={speedBtnRef}
      className="cc"
      id="speedBtn"
      aria-label={t('player.aria.speed')}
      onClick={(e) => {
        e.stopPropagation()
        setSpeedOpen((v) => !v)
      }}
      style={{ fontSize: 10, fontWeight: 800, minWidth: 34 }}
    >
      <span id="speedLabel" style={{ color: SPEEDS[speedIdx] === 1 ? undefined : 'var(--accent)' }}>
        {SPEEDS[speedIdx] === 1 ? '1×' : SPEEDS[speedIdx] + '×'}
      </span>
    </button>
  )
  // Бейдж-кнопка площадки: открывает выбор площадки для переключения текущего
  // трека на её версию. Только для сетевых треков (SoundCloud/Яндекс).
  const srcBtnNode = isNetworkTrack ? (
    <button
      ref={srcBtnRef}
      className={`cc${srcOpen ? ' on' : ''}`}
      id="srcSwitchBtn"
      aria-label={t('player.aria.source')}
      onClick={(e) => {
        e.stopPropagation()
        setSrcOpen((v) => !v)
      }}
      style={{ color: srcBtnColor }}
    >
      {providerLogo(curProviderId, 16)}
    </button>
  ) : null
  const eqBtnNode = (
    <button
      ref={eqBtnRef}
      className={`cc${eqActive ? ' on' : ''}`}
      id="eqBtn"
      aria-label={t('player.aria.eq')}
      onClick={(e) => {
        e.stopPropagation()
        setEqOpen((v) => !v)
      }}
    >
      <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" strokeLinecap="round">
        <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    </button>
  )

  const transportNode = (
    <div className="ps-ctrl" style={{ width: '100%' }}>
      <div style={{ width: 124, display: 'flex', alignItems: 'center' }}>{dlBtnNode}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <button className={`cc${repeat > 0 ? ' on' : ''}`} onClick={cycleRepeatMain} aria-label={t('player.aria.repeat')} style={{ position: 'relative' }}>
          <RepeatSvg size={18} />
          {repeat === 2 && <RepeatOneBadge />}
        </button>
        <button className="cc" onClick={prevTr} aria-label={t('player.aria.prev')}>
          <PrevSvg size={20} />
        </button>
        <button className="cc-play" onClick={togglePlay} aria-label={playing ? t('player.aria.pause') : t('player.aria.play')}>
          {playing ? <PauseSvg size={18} /> : <PlaySvg size={18} />}
        </button>
        <button className="cc" onClick={nextTr} aria-label={t('player.aria.next')}>
          <NextSvg size={20} />
        </button>
        <button className={`cc${shuffle ? ' on' : ''}`} onClick={toggleShuffleMain} aria-label={t('player.aria.shuffle')}>
          <ShuffleSvg size={18} />
        </button>
      </div>
      {/* Правый слот транспорта: дизлайк (волна) + переключатель текста. */}
      <div style={{ width: 124, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <DislikeButton />
        <LyricsToggleButton />
      </div>
    </div>
  )

  // Группы у громкости: площадка — в
  // отдельном боксе, эквалайзер + скорость — во втором. Каждая группа — `.ps-ctrl`
  // (рамка-квадрат), как у блока fav/add.
  const ctrlGroupsNode = (
    <>
      {srcBtnNode && <div className="ps-ctrl" style={{ flexShrink: 0, padding: 6 }}>{srcBtnNode}</div>}
      <div className="ps-ctrl" style={{ flexShrink: 0, gap: 2, padding: 6 }}>
        {eqBtnNode}
        {speedBtnNode}
      </div>
    </>
  )

  const volumeNode = (
    <div className="ps-ctrl" style={{ flex: 1, justifyContent: 'flex-start' }} onWheel={onWheelVol}>
      <button className="cc" onClick={toggleMuteMain} aria-label="Mute">
        <VolSvg size={18} v={volume} />
      </button>
      <VolumeSlider volume={volume} />
      <span className="vol-pct">{volume}</span>
    </div>
  )
  // В большом стиле громкость — компактная кнопка-иконка с вертикальным поп-апом
  // (как в нижнем баре #miniPlayer), а не инлайн-слайдер.
  const volumeNodeLarge = (
    <div className="ps-ctrl" style={{ flexShrink: 0, padding: 6 }}>
      <VolumePopupBtn volume={volume} onWheel={onWheelVol} />
    </div>
  )
  const modalsNode = (
    <>
      {/* Ctx-меню по ПКМ на обложке текущего трека */}
      <TrackCtxMenu
        pos={coverCtx}
        track={curTrack}
        onClose={() => setCoverCtx(null)}
        onCreatePlaylistForTrack={(id) => createPlFromPlayer(id)}
        onEditTags={(t) => setTagEditTrack(t)}
      />
      {/* Ctx-меню для блока «Следующий трек» */}
      <TrackCtxMenu
        pos={nextCtx ? { x: nextCtx.x, y: nextCtx.y } : null}
        track={nextCtx?.track ?? null}
        onClose={() => setNextCtx(null)}
        onCreatePlaylistForTrack={(id) => createPlFromPlayer(id)}
        onEditTags={(t) => setTagEditTrack(t)}
      />
      <TagEditor track={tagEditTrack} onClose={() => setTagEditTrack(null)} />
      <SpeedPicker open={speedOpen} onClose={() => setSpeedOpen(false)} anchorRef={speedBtnRef} />
      <SourcePicker
        open={srcOpen}
        onClose={() => setSrcOpen(false)}
        anchorRef={srcBtnRef}
        currentProviderId={curProviderId}
      />
      <EqPanel open={eqOpen} onClose={() => setEqOpen(false)} anchorRef={eqBtnRef} />
      <DlMenu
        open={dlOpen}
        onClose={() => setDlOpen(false)}
        anchorRef={dlBtnRef}
        track={curTrack}
        coverOverride={coverOverride}
      />
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
          // SC-трек сперва персистим (иначе после рестарта не зарезолвится).
          if (curTrack) {
            saveTrackToLibrary(curTrack)
            addTrackToPl(plId, curTrack.id)
          }
        }}
        onCreateNewPlaylist={() => {
          if (curId) createPlFromPlayer(curId)
        }}
      />
    </>
  )

  // Классы/стиль #playerContent: общая логика очереди + ветка style-large.
  const queueClass =
    hideQueue && !lyricsInQueueActive
      ? 'queue-hidden'
      : gridLayout
        ? queuePos === 'left'
          ? 'queue-left'
          : '' // в large/cinema дефолт grid = очередь справа
        : queuePos === 'left'
          ? 'queue-left'
          : queuePos === 'right'
            ? 'queue-right'
            : ''
  const pcClassName = [
    large ? 'style-large' : cinema ? 'style-cinema' : '',
    titleAlign === 'left' ? 'title-left' : titleAlign === 'right' ? 'title-right' : '',
    queueClass,
    lyricsInQueueActive ? 'lyrics-in-queue' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const pcStyle: React.CSSProperties = gridLayout
    ? { display: 'grid', flex: 1, overflow: 'hidden', gap: 8, padding: 8 }
    : { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: 8, padding: 8 }

  // ── Кино (style-cinema): grid обложка(кр.) + очередь; инфо/прогресс/контролы
  // накладываются оверлеем на низ обложки (нет отдельного нижнего бара). ──────
  if (cinema) {
    return (
      <div id="playerContent" className={pcClassName} style={pcStyle}>
        <div className="sl-cover-wrap" key="sl-cover-wrap">
          {/* renderCover(false): свои оверлеи ниже (тайтл + ♥/bigpic/+). */}
          {renderCover(false)}
          {/* Тайтл/артист по центру обложки — прячется при наведении. */}
          <div className="cn-center-title">
            {titleRowNode}
            {artistNode}
          </div>
          {/* ♥ · на весь экран · + — на месте тайтла, появляются по наведению. */}
          <div className="cn-hover-actions">
            {favOverlayBtn}
            <button
              className="cn-bigpic"
              aria-label={t('player.aria.bigPic')}
              onClick={(e) => {
                e.stopPropagation()
                useBigPicStore.getState().openBig()
              }}
            >
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
            {addOverlayBtn}
          </div>
          <div className="cn-overlay">
            <div className="cn-progress">
              <PsProgress />
            </div>
            {/* Транспорт отдельной строкой (без рамки): download | плеер | дизлайк. */}
            {transportNode}
            {/* Громкость — полным слайдером в своей строке + source/eq/скорость. */}
            <div className="cn-vol-row">
              {volumeNode}
              {ctrlGroupsNode}
            </div>
          </div>
        </div>
        {/* Прямые дети #playerContent с явным key (см. коммент в large-ветке). */}
        <QueueBlock key="player-queue" />
        {lyricsInQueueActive && <LyricsQueueBlock key="lyrics-queue" active />}
        {modalsNode}
      </div>
    )
  }

  // ── Большой плеер (style-large): grid обложка(кр.) + нижний бар ───────────
  // _slSetup: обложка крупно с прогрессом-оверлеем; под ней
  // нижний бар (инфо+fav/add | транспорт | громкость); очередь справа/слева.
  if (large) {
    return (
      <div id="playerContent" className={pcClassName} style={pcStyle}>
        <div className="sl-cover-wrap" key="sl-cover-wrap">
          {renderCover(false)}
          <div className="sl-progress">
            <PsProgress />
          </div>
        </div>
        <div className="sl-bottom" key="sl-bottom">
          <div className="sl-bottom-info">
            <div>
              <div className="sl-text-wrap">
                {titleRowNode}
                {artistNode}
              </div>
            </div>
            {favOverlayBtn}
            {addOverlayBtn}
          </div>
          {/* ps-right: первый div скрыт CSS, второй = транспорт. */}
          <div className="ps-right">
            <div />
            <div>{transportNode}</div>
          </div>
          <div className="sl-vol-wrap sl-vol-compact">{volumeNodeLarge}{ctrlGroupsNode}</div>
        </div>
        {/* Прямые дети #playerContent с явным key — позиционно-независимое
            сопоставление: QueueBlock сохраняется при переключении стандарт↔large
            (НЕ внутри массива, иначе ключ префиксуется позицией массива). */}
        <QueueBlock key="player-queue" />
        {lyricsInQueueActive && <LyricsQueueBlock key="lyrics-queue" active />}
        {modalsNode}
      </div>
    )
  }

  return (
    <div id="playerContent" className={pcClassName} style={pcStyle}>
      <div
        id="playerMainBlock"
        key="player-main-block"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          gap: 8,
          flex: '1 1 0',
          minHeight: 0,
        }}
      >
        <div
          className="player-section"
          style={{
            borderRadius: 'var(--radius)',
            border: '1px solid rgba(255,255,255,var(--wb))',
            margin: 0,
          }}
        >
          {/* COVER + fav/add overlays */}
          {renderCover(true)}

          <div className="ps-right">
            <div>
              {titleRowNode}
              {artistNode}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                width: '100%',
                maxWidth: 750,
                margin: '0 auto',
              }}
            >
              {/* VISUALIZER — анимация частот (скрыт когда выключен/в large). */}
              <VizBlock />

              {/* PROGRESS — изолирован в подкомпонент: тик timeupdate
                  перерисовывает только его, а не весь PlayerContent (с очередью)
                  → во время игры тогглы/интеракции не лагают. */}
              <PsProgress />

              {/* TRANSPORT */}
              {transportNode}

              {/* VOLUME + cov-btns (fav/add) + group-боксы (площадка | eq+скорость) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                {volumeNode}
                <div className="ps-ctrl" id="mainCovBtnsWrap" style={{ flexShrink: 0, gap: 2 }}>
                  {/* `.off` → нейтральный цвет (без него #mainCovFav красный по
                      умолчанию, CSS line 104). toggle .off. */}
                  <button
                    className={`cc${isFav ? '' : ' off'}`}
                    id="mainCovFav"
                    onClick={toggleCurFav}
                    aria-label={isFav ? t('player.aria.favRemove') : t('player.aria.favAdd')}
                  >
                    <HeartSvg size={14} filled={isFav} />
                  </button>
                  <button
                    className="cc"
                    id="mainCovAdd"
                    onClick={openAddPopup}
                    aria-label={t('player.aria.add')}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
                {ctrlGroupsNode}
              </div>

              {/* Следующий трек под контролами — только при
                  скрытой очереди и включённой настройке «Показать следующий трек». */}
              {hideQueue && showNextTrack && (
                <NextTrackBlock onContextMenu={(track, x, y) => setNextCtx({ track, x, y })} />
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Прямые дети #playerContent с явным key (см. коммент в large-ветке). */}
      <QueueBlock key="player-queue" />
      {lyricsInQueueActive && <LyricsQueueBlock key="lyrics-queue" active />}
      {modalsNode}
    </div>
  )
}

// ── next track block (#nextTrackBlock, renderNextTrackBlock) ──────────

const NextTrackBlock = ({
  onContextMenu,
}: {
  onContextMenu: (track: Track, x: number, y: number) => void
}) => {
  const t = useT()
  const queue = useQueueStore((s) => s.queue)
  const curId = useQueueStore((s) => s.curId)
  const allTracks = useLibStore((s) => s.tracks)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const nextId = useMemo(() => {
    if (!curId) return null
    const i = queue.indexOf(curId)
    return i >= 0 && i + 1 < queue.length ? queue[i + 1] ?? null : null
  }, [queue, curId])
  const track = nextId
    ? allTracks.find((t) => t.id === nextId) ?? trackRegistry.get(nextId) ?? null
    : null

  const isFav = useFavStore((s) => (nextId ? s.favs.has(nextId) : false))
  const toggleFav = useFavStore((s) => s.toggleFav)

  // AddPopup — локальный для этого блока (как в QueueBlock).
  // Toggle: повторный клик на «+» закрывает попап.
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

  if (!track) return null
  const inLib = allTracks.some((x) => x.id === track.id)
  return (
    <div
      id="nextTrackBlock"
      style={{
        flexShrink: 0,
        borderRadius: 'calc(var(--radius)*1.2)',
        border: '1px solid rgba(255,255,255,var(--wb))',
        background: 'var(--block-bg)',
        padding: '10px 14px 12px',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em', opacity: 0.9 }}>
        {t('player.nextUp')}
      </div>
      <div
        className="tr"
        style={{ marginBottom: 0, cursor: 'pointer' }}
        onClick={() => playFromCurrentQueue(track.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(track, e.clientX, e.clientY)
        }}
      >
        <div className="trcov">
          {track.cover ? (
            <img src={track.cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" style={{ opacity: 0.4 }}>
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          )}
        </div>
        <div className="tri">
          <div className="trn">{track.name}</div>
          <div className="tra">
            <ArtistLinks artist={track.artist} scId={track.artistScId} permalink={track.artistPermalink} artistId={track.artistId} provider={track.artistProvider} />
          </div>
        </div>
        <div className="trac">
          <button
            className={`ib${isFav ? ' fav' : ''}`}
            type="button"
            aria-label={isFav ? t('player.aria.favRemove') : t('player.aria.favAdd')}
            onClick={(e) => {
              e.stopPropagation()
              // SC-трек не в библиотеке → сперва персистим (иначе не попадёт в «Любимое»).
              if (!inLib) saveTrackToLibrary(track)
              toggleFav(track.id)
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          </button>
          <button className="ib" type="button" aria-label={t('player.aria.add')} onClick={openAdd}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <div className="trd">{track.dur}</div>
      </div>
      <AddPopup
        open={addOpen}
        onClose={() => setAddOpen(false)}
        anchorRef={addAnchorRef}
        hasTrack
        canAddToLib={!inLib}
        trackId={track.id}
        onAddToLib={() => saveTrackToLibrary(track)}
        onPickPlaylist={(plId) => {
          // SC-трек сперва персистим (иначе после рестарта не зарезолвится).
          saveTrackToLibrary(track)
          addTrackToPl(plId, track.id)
        }}
        onCreateNewPlaylist={() => createPlFromPlayer(track.id)}
      />
    </div>
  )
}

// ── визуализатор (#vizWrap + WebAudio AnalyserNode, toggleViz/_vizDraw) ──
// Скрыт в large. Рендерится только в стандартной раскладке.

const VizBlock = () => {
  const vizEnabled = usePlayerViewStore((s) => s.vizEnabled)
  const playing = usePlayerStore((s) => s.playing)
  // Фото визуализатора (раздел «Кастомизация»): показывается вместо canvas-баров
  // и форсит видимость #vizWrap даже при выключенном визуализаторе.
  const vizPhoto = usePlayerStore((s) => s.vizPhoto)
  // «Оптимизация»: визуализатор приостановлен (окно не в фокусе/свёрнуто) +
  // замороженный кадр GIF-фото визуализатора.
  const vizPaused = useOptStore((s) => s.vizPaused)
  const frozenViz = useOptStore((s) => s.frozenViz)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    // Переподписка на vizPhoto: canvas рендерится условно, при снятии фото нужно
    // заново зарегистрировать его ref в движке визуализатора.
    vizSetCanvas(canvasRef.current)
    return () => vizSetCanvas(null)
  }, [vizPhoto])
  useEffect(() => {
    // Запуск только при включённом визуализаторе И идущем воспроизведении И БЕЗ
    // фото (с фото анализатор не нужен) И не приостановлен оптимизацией.
    if (vizEnabled && playing && !vizPhoto && !vizPaused) vizStart(audioEngine.element)
    else vizStop()
    return () => vizStop()
  }, [vizEnabled, playing, vizPhoto, vizPaused])
  const visible = vizEnabled || !!vizPhoto
  return (
    <div
      id="vizWrap"
      style={{
        position: 'relative',
        height: 54,
        margin: '2px 0',
        display: visible ? undefined : 'none',
        border: '1px solid rgba(255,255,255,var(--wb))',
        borderRadius: 'calc(var(--radius) * 0.55)',
        background: 'var(--block-bg)',
        overflow: 'hidden',
      }}
    >
      {vizPhoto ? (
        <img
          id="vizPhotoEl"
          src={frozenViz ?? vizPhoto}
          alt=""
          style={{ width: '100%', height: 54, borderRadius: 'calc(var(--radius) * 0.55)', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <canvas
          id="vizCanvas"
          ref={canvasRef}
          style={{ width: '100%', height: 54, borderRadius: 'calc(var(--radius) * 0.55)', opacity: 0.85, display: 'block' }}
        />
      )}
    </div>
  )
}

// ── progress (изолирован от PlayerContent ради перф во время игры) ────────

const PsProgress = () => {
  const t = useT()
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  // Волновой слайдер: узор генерится на трек, рисуется на canvas по позиции.
  const sliderType = usePlayerViewStore((s) => s.sliderType)
  const curId = useQueueStore((s) => s.curId)
  // Фото на thumb слайдера. Приоритет: своё фото («Кастомизация» → Слайдер) →
  // обложка трека (только при типе 'cover'). Никогда при волновом слайдере.
  const sliderPhoto = usePlayerStore((s) => s.sliderThumb)
  const artworkRaw = usePlayerStore((s) => s.artwork)
  const coverOverride = usePlayerStore((s) => s.coverOverride)
  const frozenCover = useOptStore((s) => s.frozenCover)
  const thumbCover = frozenCover ?? coverOverride ?? artworkRaw
  const photoSrc =
    sliderType === 'wave' ? null : sliderPhoto ?? (sliderType === 'cover' ? thumbCover : null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  // Локальный drag-state (доля 0..1): пока тащим — показываем drag, иначе
  // позицию из store. Избегает «дёрганья» от timeupdate во время drag.
  const [dragFrac, setDragFrac] = useState<number | null>(null)
  const pct =
    dragFrac != null ? dragFrac * 100 : duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  // Новый узор волны на каждый трек.
  useEffect(() => {
    regenWave()
  }, [curId])

  // Перерисовка волны на изменение позиции/типа слайдера/трека.
  useEffect(() => {
    if (sliderType !== 'wave') return
    if (!hasWaveData()) regenWave()
    drawWaveTo(waveRef.current, pct)
  }, [pct, sliderType, curId])

  // Перерисовка при ресайзе окна (canvas backing store зависит от ширины).
  useEffect(() => {
    if (sliderType !== 'wave') return
    const onResize = () => drawWaveTo(waveRef.current, pct)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pct, sliderType])

  // Перемотка pointer-based: доля считается
  // напрямую из clientX по ширине дорожки — БЕЗ оффсета нативного range-ползунка
  // (он insets на полширины большого пальца → визуально «левее курсора»).
  const seekAtPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration) return
    const r = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    setDragFrac(frac)
    seekLive(frac * duration) // live-seek без IPC-пуша
  }
  const onProgDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration) return
    e.currentTarget.setPointerCapture(e.pointerId)
    seekAtPointer(e)
  }
  const onProgMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAtPointer(e)
  }
  const endProgDrag = () => {
    // Финальный пуш позиции в Rust (Discord/mirror-окна) один раз на отпускании.
    if (dragFrac != null && duration) seek(dragFrac * duration)
    setDragFrac(null)
  }
  const onProgWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const d = audioEngine.duration
    if (!d) return
    const t = Math.max(0, Math.min(d, audioEngine.currentTime + (e.deltaY < 0 ? 1 : -1)))
    seek(t)
  }
  return (
    <div>
      <div className="ps-bar-wrap" id="psWrap" onWheel={onProgWheel}>
        <div className="ps-bar-fill" id="psFill" style={{ width: `${pct}%`, pointerEvents: 'none' }} />
        {/* Волновой слайдер: видимость через body.slider-wave (CSS). */}
        <canvas id="waveCanvas" ref={waveRef} style={{ pointerEvents: 'none' }} />
        <div
          className="ps-bar-thumb"
          id="psThumb"
          style={{
            left: `${pct}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            // Фото-thumb: показываем кружок-картинку поверх любого типа (кроме wave).
            ...(photoSrc
              ? {
                  display: 'block',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'var(--card)',
                  boxShadow: '0 2px 6px rgba(0,0,0,.5),0 0 0 2px var(--bg)',
                }
              : null),
          }}
        >
          {photoSrc && <img src={photoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
        {/* Прозрачная зона захвата (увеличенная по высоте, как было у input inset:-7px). */}
        <div
          id="prog"
          aria-label={t('player.aria.seek')}
          style={{ position: 'absolute', inset: '-7px 0', cursor: 'pointer', touchAction: 'none' }}
          onPointerDown={onProgDown}
          onPointerMove={onProgMove}
          onPointerUp={endProgDrag}
          onPointerCancel={endProgDrag}
        />
      </div>
      <div className="ps-times">
        <span>{fmt(position)}</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  )
}

// ── title с marquee + клик-копирование ──────────────────────────────────

const TitleCopyOnClick = ({ title, artist }: { title: string; artist: string }) => {
  const t = useT()
  const onClick = () => {
    if (!title) return
    const text = title + (artist ? ' — ' + artist : '')
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast(t('player.toast.copied')))
      .catch(() => toast(t('player.toast.copyError')))
  }
  return (
    <MarqueeTitle
      text={title}
      wrapClass="ps-title-wrap"
      textClass="ps-title"
      scrollingClass="ps-scrolling"
      offsetVar="--ps-off"
      onClick={onClick}
      style={{ maxWidth: '100%' }}
    />
  )
}

// ── sub ──────────────────────────────────────────────────────────────────

const VolumeSlider = ({ volume }: { volume: number }) => {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const sl = ref.current
    if (!sl) return
    const pct = volume
    sl.style.background = `linear-gradient(to right,var(--accent) 0%,var(--accent) ${pct}%,var(--border) ${pct}%,var(--border) 100%)`
  }, [volume])
  return (
    <input
      ref={ref}
      type="range"
      className="vol-sl"
      min={0}
      max={100}
      value={volume}
      onChange={(e) => setVol(Number(e.target.value))}
      style={{ flex: 1, width: 'auto' }}
    />
  )
}

/**
 * Компактная громкость для большого стиля — иконка-кнопка, по клику открывает
 * вертикальный поп-ап с дорожкой (как Volume в нижнем баре #miniPlayer). Бейдж
 * с числом при наведении. Поп-ап раскрывается вверх (бар внизу страницы).
 */
const VolumePopupBtn = ({ volume, onWheel }: { volume: number; onWheel: (e: ReactWheelEvent<HTMLDivElement>) => void }) => {
  const t = useT()
  const btnRef = useRef<HTMLButtonElement>(null)
  const [popupOpen, setPopupOpen] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <div onWheel={onWheel} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        ref={btnRef}
        className="cc"
        onClick={() => setPopupOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={t('player.aria.volume')}
        style={{ position: 'relative' }}
      >
        <VolSvg size={18} v={volume} />
        {hover && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -3,
              fontSize: 9,
              fontWeight: 700,
              lineHeight: 1,
              padding: '1px 3px',
              borderRadius: 6,
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              fontVariantNumeric: 'tabular-nums',
              pointerEvents: 'none',
            }}
          >
            {Math.round(volume)}
          </span>
        )}
      </button>
      {popupOpen && <VertVolPopup volume={volume} anchorRef={btnRef} onClose={() => setPopupOpen(false)} />}
    </div>
  )
}

/**
 * Вертикальный поп-ап громкости (fixed-портал у кнопки), раскрытие вверх.
 * Drag/click/колесо по дорожке = громкость, закрытие по клику снаружи.
 */
const VertVolPopup = ({
  volume,
  anchorRef,
  onClose,
}: {
  volume: number
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const btn = anchorRef.current
    const pop = popupRef.current
    if (!btn || !pop) return
    const r = btn.getBoundingClientRect()
    const pw = pop.offsetWidth || 44
    const ph = pop.offsetHeight || 168
    let left = r.left + r.width / 2 - pw / 2
    let top = r.top - ph - 8
    if (left < 8) left = 8
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8
    if (top < 8) top = r.bottom + 8
    setPos({ left, top })
  }, [anchorRef])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const tg = e.target as Node
      if (popupRef.current?.contains(tg) || anchorRef.current?.contains(tg)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [anchorRef, onClose])

  const volFromY = (clientY: number): number => {
    const tr = trackRef.current
    if (!tr) return volume
    const r = tr.getBoundingClientRect()
    const pct = 1 - (clientY - r.top) / r.height
    return Math.round(Math.min(1, Math.max(0, pct)) * 100)
  }
  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setVol(volFromY(e.clientY))
  }
  const onTrackMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) setVol(volFromY(e.clientY))
  }
  const onTrackWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    setVol(Math.min(100, Math.max(0, volume + (e.deltaY < 0 ? 5 : -5))))
  }

  return createPortal(
    <div
      ref={popupRef}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 10,
        padding: '10px 8px',
        zIndex: 9500,
        alignItems: 'center',
        flexDirection: 'column',
        gap: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,.8)',
        background: 'var(--block-color, #141414)',
        isolation: 'isolate',
      }}
    >
      <div
        ref={trackRef}
        onPointerDown={onTrackDown}
        onPointerMove={onTrackMove}
        onWheel={onTrackWheel}
        style={{ width: 4, height: 120, background: 'rgba(255,255,255,.15)', borderRadius: 2, position: 'relative', cursor: 'pointer', touchAction: 'none' }}
      >
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--accent)', borderRadius: 2, height: `${Math.round(volume)}%`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 12, height: 12, background: 'var(--accent)', borderRadius: '50%', bottom: `calc(${Math.round(volume)}% - 6px)`, pointerEvents: 'none' }} />
      </div>
    </div>,
    document.body,
  )
}

const fmt = (sec: number): string => {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── svg (часть дублей с PlayerBar; рефакторинг — на полировке) ───────────

const HeartSvg = ({ size, filled }: { size: number; filled: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
  </svg>
)
const PrevSvg = ({ size }: { size: number }) => <SkipBack size={size} fill="currentColor" />
const NextSvg = ({ size }: { size: number }) => <SkipForward size={size} fill="currentColor" />
const PlaySvg = ({ size }: { size: number }) => <Play size={size} fill="currentColor" strokeWidth={0} />
const PauseSvg = ({ size }: { size: number }) => <Pause size={size} fill="currentColor" strokeWidth={0} />
const ShuffleSvg = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" strokeLinecap="round" />
    <path d="m18 2 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2" strokeLinecap="round" />
    <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8" strokeLinecap="round" />
    <path d="m18 14 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const RepeatSvg = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 014-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 01-4 4H3" />
  </svg>
)
const RepeatOneBadge = () => (
  <span style={{
    position: 'absolute', top: -2, right: -2, background: 'var(--accent)', borderRadius: '50%',
    width: 9, height: 9, fontSize: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--accent-text)', fontWeight: 700,
  }}>1</span>
)
const VolSvg = ({ size, v }: { size: number; v: number }) => {
  if (v === 0) return <VolumeX size={size} fill="currentColor" strokeWidth={1.8} />
  if (v < 50) return <Volume1 size={size} fill="currentColor" strokeWidth={1.8} />
  return <Volume2 size={size} fill="currentColor" strokeWidth={1.8} />
}
