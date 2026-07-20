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
import { trackRegistry, ArtistLinks } from '@entities/track'
import { useNavStore } from '@app/navigationStore'
import { useDetailStore } from '@features/search/model/detailStore'
import { usePlayerStore } from '../model/store'
import { useQueueStore } from '../model/queueStore'
import { useGrpStore } from '../model/grpStore'
import { useBigPicStore } from '../model/bigPicStore'
import { usePlayerViewStore, extractMpBgColor, useOptStore } from '@features/settings'
import {
  togglePlay,
  prevTr,
  nextTr,
  seek,
  seekLive,
  setVol,
  toggleShuffleMain,
  cycleRepeatMain,
  toggleCurFav,
} from '../api/play'
import { audioEngine } from '../lib/audioEngine'
import { MarqueeTitle } from './MarqueeTitle'
import { AddPopup } from './AddPopup'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Нижний #miniPlayer в main окне — (≈2897-2960).
 *
 * 3 равные колонки:
 *   LEFT  : cover MP_COVER×MP_COVER + title/artist + fav
 *   CENTER: repeat | prev | PLAY 48 | next | shuffle
 *   RIGHT : current/duration + volume + queue/lyrics/big-pic
 *
 * Прогресс — 2px полоска поверху, клик = seek.
 *
 * Скрыт пока нет трека (curId=null) ИЛИ открыта страница плеера.
 *
 * Отложено: bg-progress mode (#mpBgProgress), volume popup для left/right
 * playerbar mode, big-pic, ring shape для cover.
 */

/** Высота бара. Задана в двух местах (видимый бар и скрытая заглушка) — держим
 *  одной константой, иначе layout прыгает при появлении первого трека.
 *  ВАЖНО: дублируется в CSS как `--mp-h` (player.css, режим `.app.mp-full`) —
 *  там бар вынут из потока, и место под него резервируют маржой дети `.app`.
 *  Меняешь здесь — меняй и там, иначе под баром щель или нахлёст. */
const MP_H = 66.5
/** Размер обложки в баре. Кольцо прогресса (MpCircleRing) считается от него. */
const MP_COVER = 46
/** Зазор между обложкой и кольцом с каждой стороны. */
const RING_GAP = 4
/** Утопление штриха внутрь svg-бокса, чтобы 2.5px обводка не срезалась краем. */
const RING_INSET = 2
const RING_BOX = MP_COVER + RING_GAP * 2
/**
 * Ширина бара в компактном режиме. Захардкожена намеренно: раньше считалась по
 * контенту, из-за чего бар менял ширину от числа видимых кнопок. Ужимается
 * до ширины окна через max-width в CSS (.app.mp-compact #miniPlayer).
 */
const MP_COMPACT_W = 1140
/** Непрозрачность акцента у элементов прогресса — кольцо вокруг обложки и линия
 *  сверху. Одно значение на оба, чтобы они не разъезжались по цвету. */
const MP_PROGRESS_OP = 0.7
/* Обводка бара живёт в player.css: она зависит от режима (обычный / плавающий),
   а инлайн-стиль перебил бы CSS-правило для плавающего. */

/**
 * Показан ли сейчас нижний бар. Скрыт, когда нет трека, открыт page-player или
 * бар выключен (preset off). Исключение: детальный оверлей поверх плеера
 * (артист/альбом) — тогда показываем, т.к. полный плеер перекрыт и иначе нечем
 * управлять воспроизведением.
 *
 * Вынесено в хук, потому что предикат нужен ДВУМ местам: самому бару и App.tsx,
 * который в режиме «во всю ширину» резервирует под бар место в раскладке. Если
 * их развести, скрытый бар оставит пустую полосу внизу (страница «съезжает»).
 */
export const useMiniBarVisible = (): boolean => {
  const curId = useQueueStore((s) => s.curId)
  const page = useNavStore((s) => s.page)
  const detailOpen = useDetailStore((s) => s.stack.length > 0)
  const mpEnabled = usePlayerViewStore((s) => s.mpEnabled)
  return !!curId && mpEnabled && (page !== 'player' || detailOpen)
}

export const PlayerBar = () => {
  const t = useT()
  const curId = useQueueStore((s) => s.curId)
  const page = useNavStore((s) => s.page)
  const title = usePlayerStore((s) => s.title)
  const artist = usePlayerStore((s) => s.artist)
  const artworkRaw = usePlayerStore((s) => s.artwork)
  const coverOverride = usePlayerStore((s) => s.coverOverride)
  const frozenCover = useOptStore((s) => s.frozenCover)
  // Кастомная обложка + заморозка GIF (оптимизация) перекрывают обложку трека.
  const artwork = frozenCover ?? coverOverride ?? artworkRaw
  const playing = usePlayerStore((s) => s.playing)
  const volume = usePlayerStore((s) => s.volume)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const smartShuffle = usePlayerStore((s) => s.smartShuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const isFav = useFavStore((s) => (curId ? s.favs.has(curId) : false))
  const curTrack =
    useLibStore((s) => (curId ? s.tracks.find((t) => t.id === curId) ?? null : null)) ??
    (curId ? trackRegistry.get(curId) ?? null : null)
  const inLib = useLibStore((s) => (curId ? s.tracks.some((t) => t.id === curId) : false))
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)

  // Настройки бара (раздел «Плеер» → Мини-плеер): фон, форма обложки.
  // Флаг вкл/выкл (mpEnabled) читает useMiniBarVisible выше.
  const mpBgMode = usePlayerViewStore((s) => s.mpBgMode)
  const mpCoverShape = usePlayerViewStore((s) => s.mpCoverShape)
  const mpRounded = usePlayerViewStore((s) => s.mpRounded)
  const mpHide = usePlayerViewStore((s) => s.mpHide)
  const mpCompact = usePlayerViewStore((s) => s.mpCompact)
  // В режиме «Фоном» весь бар = прогресс-бар → клик по нему перематывает
  // (линия #mpBarBg при этом обычно скрыта). Кнопки/обложку/название пропускаем.
  const mpBgProgress = usePlayerViewStore((s) => s.mpProgress.bg)
  const onBarClickSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mpBgProgress) return
    if ((e.target as HTMLElement).closest('button, input, a, [data-nav], .tra-link')) return
    const dur = usePlayerStore.getState().duration
    if (!dur) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seek(frac * dur)
  }

  // Зеркало fav в playerStore (если library favStore изменился вне плеера).
  useEffect(() => {
    usePlayerStore.setState({ fav: isFav })
  }, [isFav])

  // Фон «цвет обложки» — извлекаем тёмный доминант.
  const [coverColor, setCoverColor] = useState<string | null>(null)
  useEffect(() => {
    if (mpBgMode !== 'coverColor' || !artwork) {
      setCoverColor(null)
      return
    }
    let cancelled = false
    void extractMpBgColor(artwork).then((hex) => {
      if (!cancelled) setCoverColor(hex)
    })
    return () => {
      cancelled = true
    }
  }, [mpBgMode, artwork])

  // Компактный бар: ширина фиксированная (MP_COMPACT_W), считаем только ширину
  // центра (--mp-cw) — симметричную, `2 × max(repeat, shuffle) + трио`. Она нужна,
  // чтобы грид 1fr|auto|1fr центрировал ИМЕННО трио (пред/плей/след), даже когда
  // repeat/shuffle скрыты.
  const barRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    if (!mpCompact) {
      bar.style.removeProperty('--mp-fw')
      centerRef.current?.style.removeProperty('--mp-cw')
      return
    }
    // Ширину КОНТЕНТА колонки считаем суммой её детей (offsetWidth) + зазоры —
    // не по offsetWidth самой колонки, т.к. в гриде она растянута на дорожку.
    const rowW = (el: HTMLElement | null, gap: number): number => {
      if (!el) return 0
      const kids = Array.from(el.children) as HTMLElement[]
      if (!kids.length) return 0
      return kids.reduce((w, k) => w + k.offsetWidth, 0) + gap * (kids.length - 1)
    }
    // Центр делаем симметричным: 2×max(repeat,shuffle)+трио. Тогда грид
    // 1fr|auto|1fr внутри .mp-center центрирует ИМЕННО трио (пред/плей/след),
    // даже если repeat/shuffle скрыты. Дети .mp-center: [repeat-ячейка, трио,
    // shuffle-ячейка]; ширину ячеек берём по их содержимому (rowW детей).
    const cells = Array.from(centerRef.current?.children ?? []) as HTMLElement[]
    const trioW = rowW(cells[1] ?? null, 4)
    const centerSide = Math.max(rowW(cells[0] ?? null, 0), rowW(cells[2] ?? null, 0))
    // +8: 2 зазора (4×2) между ячейками .mp-center.
    const center = centerSide * 2 + trioW + 8
    centerRef.current?.style.setProperty('--mp-cw', `${Math.ceil(center)}px`)
    // Ширина бара — ФИКСИРОВАННАЯ (MP_COMPACT_W), не по контенту: иначе бар
    // растёт/скачет от числа видимых кнопок. Центрирование трио это не ломает —
    // за него отвечает --mp-cw + грид 1fr|auto|1fr внутри .mp-center.
    bar.style.setProperty('--mp-fw', `${MP_COMPACT_W}px`)
  }, [mpCompact, curId, page, title, artist, playing, volume, mpHide.fav, mpHide.add, mpHide.repeat, mpHide.shuffle, mpHide.time, mpHide.queue, mpHide.lyrics, mpHide.bigpic, t])

  const goNav = useNavStore((s) => s.goNav)

  // «Новый плейлист» из бара: закрываем фуллскрин, уходим в библиотеку и
  // создаём плейлист с этим треком сразу в inline-редакте.
  const createPlForTrack = (id: string) => {
    const tr = curTrack && curTrack.id === id ? curTrack : trackRegistry.get(id) ?? null
    useBigPicStore.getState().closeBig()
    goNav('lib')
    createPlaylistInline(tr ? { track: tr } : { trackId: id })
  }

  // Ctx-меню трека по ПКМ на баре (как на обложке page-player).
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null)
  const [tagEditTrack, setTagEditTrack] = useState<Track | null>(null)

  // Попап «Добавить в …» у кнопки «+» рядом с сердечком (как #mainCovAdd в page-player).
  // Toggle: повторный клик по «+» закрывает попап.
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

  // Глобальная правая панель (очередь/текст). Хуки ДО early-return ниже.
  const grpOpen = useGrpStore((s) => s.open)
  const grpMode = useGrpStore((s) => s.mode)
  const openGrp = useGrpStore((s) => s.openPanel)

  const visible = useMiniBarVisible()
  if (!visible) {
    return (
      <div
        id="miniPlayer"
        style={{
          display: 'none',
          height: MP_H,
          flexShrink: 0,
          borderRadius: 'var(--radius)',
            backdropFilter: 'blur(12px)',
          overflow: 'hidden',
          position: 'relative',
        }}
      />
    )
  }

  const onWheelVol = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const cur = usePlayerStore.getState().volume
    const step = e.shiftKey ? 5 : 1
    setVol(Math.min(100, Math.max(0, cur + (e.deltaY < 0 ? step : -step))))
  }

  // Классы фона/формы.
  const mpClass = [mpCoverShape === 'round' ? 'mp-cover-round' : '', mpBgMode === 'cover' ? 'mp-bg-cover' : '', mpRounded ? 'mp-rounded' : '']
    .filter(Boolean)
    .join(' ')

  const onBarContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!curTrack) return
    // Пропускаем контролы — у них своё (или дефолтное) поведение не нужно,
    // но ПКМ по баре/обложке/названию открывает меню трека.
    if ((e.target as HTMLElement).closest('input, .tra-link')) return
    e.preventDefault()
    setCtxPos({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
    <div
      id="miniPlayer"
      ref={barRef}
      className={mpClass || undefined}
      onClick={onBarClickSeek}
      onContextMenu={onBarContextMenu}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: MP_H,
        flexShrink: 0,
        borderRadius: 'var(--radius)',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
        position: 'relative',
        // Фон «цвет обложки».
        backgroundColor: mpBgMode === 'coverColor' && coverColor ? coverColor : undefined,
        // В режиме «Фоном» курсор-указатель намекает на кликабельную перемотку.
        cursor: mpBgProgress ? 'pointer' : undefined,
      }}
    >
      {/* Фон «обложка» — слой картинки под содержимым. */}
      {mpBgMode === 'cover' && artwork && (
        <div id="mpBgImgLayer">
          <img src={artwork} alt="" style={{ filter: 'brightness(0.38) saturate(0.7)' }} />
        </div>
      )}
      {/* Прогресс-бар (линия 2px / фон-заливка) + drag/click-seek + wheel-seek.
          Изолирован в подкомпонент: тик timeupdate перерисовывает только его,
          а не весь PlayerBar (иначе при игре лагали бы тогглы/интеракции). */}
      <MpProgress tint={coverColor} />

      <div
        className="mp-inner"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          padding: '0 12px',
          width: '100%',
          // Контент над фон-слоями (#mpBgProgress / #mpBgImgLayer), mp-bg-cover.
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* LEFT — cover + title + fav */}
        <div
          ref={leftRef}
          className="mp-left"
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <div
            id="mpCoverWrap"
            style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {/* Кольцо прогресса вокруг обложки. */}
            <MpCircleRing />
            <div
              id="mpCover"
              data-nav
              onClick={() => useBigPicStore.getState().openBig()}
              style={{
                position: 'relative',
                width: MP_COVER,
                height: MP_COVER,
                borderRadius: 'calc(var(--radius) * 0.55)',
                background: 'var(--card)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--muted)',
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              {artwork ? (
                <img src={artwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <NoteSvg size={16} />
              )}
              {/* Иконка «на весь экран» по центру обложки (появляется по наведению) — Solar bigpic. */}
              <span className="mp-cover-bigpic">
                <Ico name="bigpic" width={17} height={17} />
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
            <div
              style={{
                minWidth: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                data-nav
                onClick={() => goNav('player')}
                style={{ minWidth: 0, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {/* Marquee названия бара: прокрутка
                    когда текст шире контейнера, пауза на hover. */}
                <span style={{ minWidth: 0, overflow: 'hidden' }}>
                  <MarqueeTitle
                    text={title || t('player.notSelected')}
                    wrapClass="mp-title-wrap"
                    textClass="mp-title"
                    scrollingClass="mp-scrolling"
                    offsetVar="--mp-off"
                    style={{ maxWidth: '100%' }}
                  />
                </span>
              </div>
              <div
                id="mpArtist"
                style={{
                  fontSize: 11,
                  // Ярче обычного --text2 (#999): на тонированном фоне бара он
                  // проваливался. Через color-mix, а не фикс. цвет — чтобы
                  // светлые темы не получили белёсый текст на белом.
                  color: 'color-mix(in srgb, var(--text2) 45%, var(--text))',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.1,
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                  <ArtistLinks artist={artist} scId={curTrack?.artistScId} permalink={curTrack?.artistPermalink} artistId={curTrack?.artistId} provider={curTrack?.artistProvider} />
                </span>
              </div>
            </div>
            {!mpHide.fav && (
              <button
                id="mpFav"
                className="cc"
                onClick={toggleCurFav}
                aria-label={isFav ? t('player.aria.favRemove') : t('player.aria.favAdd')}
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  // Цвет/ховер — от `.cc` (как транспорт бара); красный только «в избранном».
                  ...(isFav ? { color: '#e03030' } : null),
                }}
              >
                <HeartSvg size={14} filled={isFav} />
              </button>
            )}
            {!mpHide.add && (
              <button
                id="mpAdd"
                className="cc"
                onClick={openAddPopup}
                aria-label={t('player.aria.add')}
                style={{ width: 28, height: 28, flexShrink: 0 }}
              >
                <Ico name="addCircle" width={15} height={15} />
              </button>
            )}
          </div>
        </div>

        {/* CENTER — repeat | [prev PLAY next] | shuffle.
            Repeat/shuffle вынесены в боковые ячейки, трио — в .mp-transport. В
            обычном режиме обёртки = display:contents (раскладка как раньше); в
            плавающем .mp-center — грид 1fr|auto|1fr, поэтому ТРИО центрируется
            всегда, даже если repeat/shuffle скрыты (пустая ячейка держит 1fr). */}
        <div
          ref={centerRef}
          className="mp-center"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0 }}
        >
          <span className="mp-side-ctl mp-side-l">
            {!mpHide.repeat && (
              <button className={`cc${repeat > 0 ? ' on' : ''}`} onClick={cycleRepeatMain} aria-label={t('player.aria.repeat')} style={{ position: 'relative' }}>
                <RepeatSvg size={16} />
                {repeat === 2 && <RepeatOneBadge />}
              </button>
            )}
          </span>
          <span className="mp-transport">
            <button className="cc" onClick={prevTr} aria-label={t('player.aria.prev')}>
              <PrevSvg size={17} />
            </button>
            {/* is-play — только для треугольника: он смещён вправо в своём viewBox
                (контур 3…23.2 при центре бокса 12), CSS двигает его обратно. */}
            <button className={`cc-play${playing ? '' : ' is-play'}`} onClick={togglePlay} aria-label={playing ? t('player.aria.pause') : t('player.aria.play')}>
              {playing ? <PauseSvg size={15} /> : <PlaySvg size={15} />}
            </button>
            <button className="cc" onClick={nextTr} aria-label={t('player.aria.next')}>
              <NextSvg size={17} />
            </button>
          </span>
          <span className="mp-side-ctl mp-side-r">
            {!mpHide.shuffle && (
              <button className={`cc${shuffle ? ' on' : ''}`} onClick={toggleShuffleMain} aria-label={smartShuffle ? t('player.aria.smartShuffle') : t('player.aria.shuffle')}>
                <ShuffleSvg size={16} />
                {smartShuffle && <span className="cc-badge"><Ico name="stars" size={9} /></span>}
              </button>
            )}
          </span>
        </div>

        {/* RIGHT — time + volume + queue/lyrics/big-pic */}
        <div
          ref={rightRef}
          className="mp-right"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 2,
            minWidth: 0,
          }}
        >
          {!mpHide.time && <MpTime />}
          <Volume volume={volume} onWheel={onWheelVol} />
          {/* Очередь / Текст — открывают глобальную правую панель (#globalRightPanel).
              Повторный клик по активному режиму — закрыть. */}
          {!mpHide.queue && (
            <button
              className={`cc${grpOpen && grpMode === 'queue' ? ' on' : ''}`}
              aria-label={t('player.aria.queue')}
              style={{ flexShrink: 0 }}
              onClick={() => openGrp('queue')}
            >
              <QueueSvg size={18} />
            </button>
          )}
          {!mpHide.lyrics && (
            <button
              className={`cc${grpOpen && grpMode === 'lyrics' ? ' on' : ''}`}
              aria-label={t('player.lyrics')}
              style={{ flexShrink: 0 }}
              onClick={() => openGrp('lyrics')}
            >
              <LyricsSvg size={16} />
            </button>
          )}
          {/* Big picture — полноэкранный режим обложки (#bigPicOverlay). */}
          {!mpHide.bigpic && (
            <button
              className="cc"
              aria-label="Big picture"
              style={{ flexShrink: 0 }}
              onClick={() => useBigPicStore.getState().openBig()}
            >
              <BigPicSvg size={16} />
            </button>
          )}
        </div>
      </div>
    </div>

      {/* Ctx-меню трека по ПКМ на баре */}
      <TrackCtxMenu
        pos={ctxPos}
        track={curTrack}
        onClose={() => setCtxPos(null)}
        onCreatePlaylistForTrack={(id) => createPlForTrack(id)}
        onEditTags={(tr) => setTagEditTrack(tr)}
      />
      <TagEditor track={tagEditTrack} onClose={() => setTagEditTrack(null)} />

      {/* Попап «Добавить в …» у кнопки «+» рядом с сердечком. */}
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
          if (curId) createPlForTrack(curId)
        }}
      />
    </>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────

const fmt = (sec: number): string => {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Прогресс-полоса (2px) нижнего бара. Подписана на position/duration ВНУТРИ,
 * поэтому тик timeupdate перерисовывает только её, не весь PlayerBar.
 */
/**
 * @param tint Фон бара в режиме «Цвет обложки» (доминант обложки) либо null.
 *   Заливка прогресса строится от него — осветлённый тон того же трека.
 */
const MpProgress = ({ tint }: { tint: string | null }) => {
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const showLine = usePlayerViewStore((s) => s.mpProgress.line)
  const showBg = usePlayerViewStore((s) => s.mpProgress.bg)
  const [dragFrac, setDragFrac] = useState<number | null>(null)
  // Позиция курсора над линией → пилюля со временем (как в fullscreen-плеере).
  const [hover, setHover] = useState<{ frac: number; x: number; top: number } | null>(null)
  const pct =
    dragFrac != null ? dragFrac * 100 : duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  const seekAtPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return
    const r = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    setDragFrac(frac)
    seekLive(frac * duration) // live-seek без IPC-пуша (пуш — на отпускании)
  }
  const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return
    e.currentTarget.setPointerCapture(e.pointerId)
    seekAtPointer(e)
  }
  const onBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return
    const r = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    setHover({ frac, x: e.clientX, top: r.top })
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAtPointer(e)
  }
  const endBarDrag = () => {
    if (dragFrac != null && duration) seek(dragFrac * duration)
    setDragFrac(null)
  }
  const onProgWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const d = audioEngine.duration
    if (!d) return
    const step = e.shiftKey ? 5 : 1
    const t = Math.max(0, Math.min(d, audioEngine.currentTime + (e.deltaY < 0 ? step : -step)))
    seek(t)
  }
  return (
    <>
      {/* Фон-заливка прогресса, под содержимым бара. */}
      {showBg && (
        <div
          id="mpBgProgress"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${pct}%`,
            // В режиме «Цвет обложки» заливка строится от тона самого трека
            // (осветлённый доминант) — акцент приложения там смотрелся чужеродно:
            // синяя полоса поверх красного бара. В остальных режимах фон не
            // тонирован, и акцент по-прежнему уместен.
            background: tint ? `color-mix(in srgb, ${tint} 90%, #fff)` : 'rgba(var(--accent-rgb),0.18)',
            pointerEvents: 'none',
            zIndex: 0,
            transition: dragFrac != null ? 'none' : 'width .08s linear',
          }}
        />
      )}
      {/* Линия-прогресс поверху (2px) + seek. */}
      {showLine && (
        <div
          id="mpBarBg"
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={endBarDrag}
          onPointerCancel={endBarDrag}
          onPointerLeave={() => setHover(null)}
          onWheel={onProgWheel}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: 'rgba(255,255,255,0.12)',
            cursor: 'pointer',
            touchAction: 'none',
            zIndex: 2,
          }}
        >
          <div
            id="mpBarFill"
            style={{
              height: '100%',
              width: `${pct}%`,
              // Тот же цвет, что у кольца вокруг обложки: акцент, приглушённый
              // общей MP_PROGRESS_OP. Через opacity, а не rgba — акцент задан
              // токеном --accent, разложить его на каналы в inline-стиле нельзя.
              background: 'var(--accent)',
              opacity: MP_PROGRESS_OP,
              pointerEvents: 'none',
              transition: dragFrac != null ? 'none' : 'width .08s linear',
            }}
          />
        </div>
      )}
      {/* Пилюля со временем под курсором при наведении на линию. Портал в body —
          иначе overflow:hidden бара обрезал бы её сверху. */}
      {showLine && hover && duration > 0 &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: hover.x,
              top: hover.top - 8,
              transform: 'translate(-50%, -100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 20,
              padding: '2px 9px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1,
              color: 'var(--text)',
              background: 'var(--block-color, #1a1a1a)',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 9500,
            }}
          >
            {fmt(hover.frac * duration)}
          </div>,
          document.body,
        )}
    </>
  )
}

/**
 * Кольцо прогресса вокруг обложки. Форма зависит от mpCoverShape (круг/скруг.квадрат).
 * Подписано на position внутри (лист) — тик перерисовывает только кольцо.
 */
const MpCircleRing = () => {
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const show = usePlayerViewStore((s) => s.mpProgress.circle)
  const round = usePlayerViewStore((s) => s.mpCoverShape === 'round')
  // Форма (path/perimeter) зависит только от round + --radius (не от позиции).
  // Геометрия считается от MP_COVER: бокс = обложка + RING_GAP с каждой стороны,
  // штрих утоплен внутрь на RING_INSET, чтобы не срезался краем svg.
  const shape = useMemo(() => {
    const c = RING_BOX / 2
    if (round) return { perim: 2 * Math.PI * (c - RING_INSET - 1), d: null as string | null }
    const cssR = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--radius')) || 14
    const side = RING_BOX - 2 * RING_INSET
    const far = RING_BOX - RING_INSET
    const r = Math.min(Math.round(cssR * 0.55 + 4), Math.floor(side / 2))
    const perim = 4 * (side - 2 * r) + 2 * Math.PI * r
    const d = `M ${c} ${RING_INSET} H ${far - r} Q ${far} ${RING_INSET} ${far} ${RING_INSET + r} V ${far - r} Q ${far} ${far} ${far - r} ${far} H ${RING_INSET + r} Q ${RING_INSET} ${far} ${RING_INSET} ${far - r} V ${RING_INSET + r} Q ${RING_INSET} ${RING_INSET} ${RING_INSET + r} ${RING_INSET} H ${c}`
    return { perim, d }
  }, [round])
  if (!show) return null
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  const offset = shape.perim - (pct / 100) * shape.perim
  return (
    <svg
      id="mpCircleRing"
      width={RING_BOX}
      height={RING_BOX}
      viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
      style={{ position: 'absolute', top: -RING_GAP, left: -RING_GAP, pointerEvents: 'none' }}
    >
      {shape.d ? (
        <>
          <path d={shape.d} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={shape.d}
            fill="none"
            stroke="var(--accent)"
            /* Приглушено: на автоакценте от обложки кольцо в полную силу
               полыхает вокруг картинки и перетягивает внимание с самого бара. */
            strokeOpacity={MP_PROGRESS_OP}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={shape.perim}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset .08s linear' }}
          />
        </>
      ) : (
        <>
          <circle cx={RING_BOX / 2} cy={RING_BOX / 2} r={RING_BOX / 2 - RING_INSET - 1} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2.5} />
          <circle
            cx={RING_BOX / 2}
            cy={RING_BOX / 2}
            r={RING_BOX / 2 - RING_INSET - 1}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity={MP_PROGRESS_OP}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={shape.perim}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${RING_BOX / 2} ${RING_BOX / 2})`}
            style={{ transition: 'stroke-dashoffset .08s linear' }}
          />
        </>
      )}
    </svg>
  )
}

/** Время трека (current / duration). Подписано на position/duration внутри. */
const MpTime = () => {
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  return (
    <div
      style={{
        display: 'flex',
        gap: 3,
        fontSize: 11,
        color: 'var(--text2)',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--text)' }}>{fmt(position)}</span>
      <span style={{ opacity: 0.4 }}>/</span>
      <span>{fmt(duration)}</span>
    </div>
  )
}


/** Сторона раскрытия поп-апа громкости относительно кнопки. */
type VolPopupPlacement = 'side' | 'top' | 'bottom'

const Volume = ({ volume, onWheel }: { volume: number; onWheel: (e: ReactWheelEvent<HTMLDivElement>) => void }) => {
  const t = useT()
  // Громкость всегда раскрывается дропдауном (вертикальный поп-ап) по клику на
  // иконку — инлайн-слайдер убран. Сторона зависит от позиции бара:
  //   left/right → сбоку, bottom → над иконкой, top → под иконкой.
  const barPos = usePlayerViewStore((s) => s.playerBarPos)
  const placement: VolPopupPlacement =
    barPos === 'left' || barPos === 'right' ? 'side' : barPos === 'top' ? 'bottom' : 'top'
  const btnRef = useRef<HTMLButtonElement>(null)
  const [popupOpen, setPopupOpen] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <div className="ps-vol" onWheel={onWheel} style={{ flex: 0, position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        ref={btnRef}
        className="cc"
        onClick={() => setPopupOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={t('player.aria.volume')}
        style={{ position: 'relative' }}
      >
        {/* Иконка видна всегда; при наведении в углу появляется бейдж с числом. */}
        <VolSvg size={19} v={volume} />
        {hover && (
          <span
            className="cc-badge num"
            style={{
              width: 'auto',
              minWidth: 13,
              paddingLeft: 3,
              paddingRight: 3,
              borderRadius: 7,
              fontSize: 8,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {Math.round(volume)}
          </span>
        )}
      </button>
      {popupOpen && (
        <VertVolPopup volume={volume} anchorRef={btnRef} placement={placement} onClose={() => setPopupOpen(false)} />
      )}
    </div>
  )
}

/**
 * Вертикальный поп-ап громкости. Fixed-портал у кнопки, drag/click/колесо по
 * дорожке = громкость, закрытие по клику снаружи. Сторона раскрытия — placement
 * (side для боковых баров, top/bottom для горизонтальных).
 */
const VertVolPopup = ({
  volume,
  anchorRef,
  placement,
  onClose,
}: {
  volume: number
  anchorRef: React.RefObject<HTMLButtonElement | null>
  placement: VolPopupPlacement
  onClose: () => void
}) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Позиционирование у кнопки: side — слева (фолбэк справа) от колонки;
  // top/bottom — центрируем по кнопке над/под ней. Размер попапа МЕРЯЕМ по факту
  // (layout-effect до отрисовки), иначе оценка ширины смещала бы попап вбок.
  useLayoutEffect(() => {
    const btn = anchorRef.current
    const pop = popupRef.current
    if (!btn || !pop) return
    const r = btn.getBoundingClientRect()
    const pw = pop.offsetWidth || 44
    const ph = pop.offsetHeight || 168
    let left: number
    let top: number
    if (placement === 'side') {
      left = r.left - pw - 8
      if (left < 8) left = r.right + 8
      top = r.top + r.height / 2 - ph / 2
    } else {
      left = r.left + r.width / 2 - pw / 2
      top = placement === 'bottom' ? r.bottom + 8 : r.top - ph - 8
    }
    if (left < 8) left = 8
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8
    if (top < 8) top = 8
    if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8
    setPos({ left, top })
  }, [anchorRef, placement])

  // Закрытие по клику снаружи.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popupRef.current?.contains(t) || anchorRef.current?.contains(t)) return
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
    e.stopPropagation()
    const step = e.shiftKey ? 5 : 1
    setVol(Math.min(100, Math.max(0, volume + (e.deltaY < 0 ? step : -step))))
  }

  return createPortal(
    <div
      ref={popupRef}
      // Попап портален в body, но React-события всплывают по дереву компонентов
      // (track → Volume → … → #miniPlayer). Без stopPropagation клик/тап по
      // дорожке громкости долетает до onClick бара (onBarClickSeek) и в режиме
      // «прогресс фоном» перематывает трек. Глушим всплытие здесь.
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

// ── SVG icons (Solar) ─────────────────────────────────────
// Тонкие обёртки над централизованным набором Solar (см. @shared/ui/icons/solar).
// Сигнатуры сохранены, чтобы не трогать места вызова.

const NoteSvg = ({ size }: { size: number }) => <Ico name="note" size={size} />
const HeartSvg = ({ size, filled }: { size: number; filled: boolean }) => (
  <Ico name="heart" variant={filled ? 'bold' : 'linear'} size={size} />
)
const PrevSvg = ({ size }: { size: number }) => <Ico name="prev" size={size} />
const NextSvg = ({ size }: { size: number }) => <Ico name="next" size={size} />
const PlaySvg = ({ size }: { size: number }) => <Ico name="play" size={size} />
const PauseSvg = ({ size }: { size: number }) => <Ico name="pause" size={size} />
const ShuffleSvg = ({ size }: { size: number }) => <Ico name="shuffle" size={size} />
const RepeatSvg = ({ size }: { size: number }) => <Ico name="repeat" size={size} />
const RepeatOneBadge = () => (
  <span className="cc-badge num" style={{ fontSize: 8, fontWeight: 700 }}>1</span>
)
const VolSvg = ({ size, v }: { size: number; v: number }) => {
  if (v === 0) return <Ico name="muted" size={size} />
  if (v < 50) return <Ico name="volumeSmall" size={size} />
  return <Ico name="volumeLoud" size={size} />
}
const QueueSvg = ({ size }: { size: number }) => <Ico name="queue" size={size} />
const LyricsSvg = ({ size }: { size: number }) => <Ico name="lyrics" size={size} />
const BigPicSvg = ({ size }: { size: number }) => <Ico name="bigpic" size={size} />
