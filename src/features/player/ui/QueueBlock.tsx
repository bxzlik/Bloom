import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react'
import { useSortable } from '@shared/lib/useSortable'
import { useWindowedList } from '@shared/lib/useWindowedList'
import { useT, type TFunc } from '@shared/i18n'
import {
  useLibStore,
  usePlaylistStore,
  useFavStore,
  saveTrackToLibrary,
  createPlaylistInline,
  TrackCtxMenu,
  TagEditor,
} from '@features/library'
import type { Track } from '@entities/track'
import { trackRegistry, ArtistLinks, CoverSourceBadge } from '@entities/track'
import { PlaylistCover } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'
import { useNavStore } from '@app/navigationStore'
import waveApi from '@/wave'
import { usePlayerViewStore } from '@features/settings'
import { useQueueStore, type PlaySource } from '../model/queueStore'
import { useBigPicStore } from '../model/bigPicStore'
import {
  playFromCurrentQueue,
  reorderQueue,
  removeFromQueue,
} from '../api/play'
import { AddPopup } from './AddPopup'

/**
 * Очередь воспроизведения `#playerQueueBlock`
 *.
 *
 * Шапка: source-pill (тип источника + label + shuffle-indicator + count),
 * кнопка clear, кнопка «Похожие» (отложена — нужна Wave-фича).
 * Список: реюз `.tr` стилизации из легаси CSS, drag-reorder через useSortable
 * (handle на `.trcov` как у LibTracklist).
 *
 * Не реализовано (фаза polish):
 *   - Виртуализация (VList) — нужна для очень длинных очередей
 *   - «Похожие» (#qpSimilarBtn) — зависит от Wave
 *   - ContextMenu на ПКМ
 */
/**
 * @param headerExtra  доп. контролы в правой группе шапки (напр. кнопка смены
 *   стороны в глобальной правой панели). На странице плеера не передаётся.
 * @param similarIcon  в узкой боковой панели «Похожие» рисуем компактной иконкой
 *   (без текста), на странице плеера — пилюлей с подписью.
 */
const QueueBlockImpl = ({
  headerExtra,
  similarIcon,
}: { headerExtra?: ReactNode; similarIcon?: boolean } = {}) => {
  const t = useT()
  const queue = useQueueStore((s) => s.queue)
  const curId = useQueueStore((s) => s.curId)
  const source = useQueueStore((s) => s.source)
  const shuffle = useQueueStore((s) => s.shuffle)
  // Переключение вида очереди (обычный↔расширенный) перестраивает весь список
  // (для длинных очередей — сотни строк, со сменой структуры контейнеров →
  // mount/unmount). PagePlayer всегда смонтирован, поэтому без отсрочки клик по
  // настройке блокировался бы этой перестройкой. useDeferredValue уводит её в
  // фоновый transition: кнопка настройки (читает стор напрямую) реагирует сразу.
  const queueView = useDeferredValue(usePlayerViewStore((s) => s.queueView))
  const allTracks = useLibStore((s) => s.tracks)
  const clearExceptCurrent = useQueueStore((s) => s.clearExceptCurrent)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const goNav = useNavStore((s) => s.goNav)

  // «Новый плейлист» из очереди: закрываем фуллскрин, уходим в библиотеку и
  // создаём плейлист с этим треком сразу в inline-редакте.
  const createPlForTrack = (trackId: string) => {
    const tr = items.find((x) => x.id === trackId)?.track ?? trackRegistry.get(trackId) ?? null
    useBigPicStore.getState().closeBig()
    goNav('lib')
    createPlaylistInline(tr ? { track: tr } : { trackId })
  }

  // Ctx-menu по ПКМ на треке очереди.
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; track: Track } | null>(null)
  const [tagEditTrack, setTagEditTrack] = useState<Track | null>(null)

  // AddPopup (общий для всех строк, анкор подменяется по клику на «+»).
  // Toggle: повторный клик на ту же кнопку закрывает попап.
  const addAnchorRef = useRef<HTMLElement | null>(null)
  const [addPopupTrackId, setAddPopupTrackId] = useState<string | null>(null)
  const openAddPopup = (e: ReactMouseEvent<HTMLButtonElement>, trackId: string) => {
    e.stopPropagation()
    const btn = e.currentTarget
    if (addPopupTrackId !== null && addAnchorRef.current === btn) {
      setAddPopupTrackId(null)
      return
    }
    addAnchorRef.current = btn
    setAddPopupTrackId(trackId)
  }

  // Резолвим Track-объекты по id'шникам в очереди: библиотека → trackRegistry
  // (треки площадок: SoundCloud/Yandex). Если трека нигде нет — заглушка.
  const items = useMemo(() => {
    const byId = new Map(allTracks.map((t) => [t.id, t]))
    return queue.map((id) => ({ id, track: byId.get(id) ?? trackRegistry.get(id) ?? null }))
  }, [queue, allTracks])

  // Скролл-контейнер списка (#qpList). В расширенном виде каждая секция —
  // отдельный useSortable-контейнер (см. QueueSortList), поэтому общий ref
  // храним здесь, а не берём из sortable.
  const scrollRef = useRef<HTMLDivElement>(null)

  // Реордер внутри секции расширенного вида: секция отдаёт новый порядок СВОИХ
  // id, мы пересобираем полную очередь = до-текущего + текущий + после. Так drag
  // в «Прослушано»/«Далее» не трогает позицию играющего трека и другую секцию.
  const reorderSection = (which: 'played' | 'next') => (newIds: string[]) => {
    const q = useQueueStore.getState()
    const cIdx = q.curId ? q.queue.indexOf(q.curId) : -1
    if (cIdx < 0) {
      reorderQueue(newIds)
      return
    }
    const cur = q.queue[cIdx]!
    const before = q.queue.slice(0, cIdx)
    const after = q.queue.slice(cIdx + 1)
    reorderQueue(which === 'played' ? [...newIds, cur, ...after] : [...before, cur, ...newIds])
  }

  // API оконного списка обычного вида (проскроллить к треку, чья строка может
  // быть не отрендерена окном виртуализации).
  const scrollApiRef = useRef<QueueScrollApi | null>(null)

  // Слежка за играющим треком: при СМЕНЕ curId (не на каждый рендер — иначе
  // дёргалось бы на play/pause/fav) скроллим строку к ВЕРХУ списка ('start',
  // VList.scrollToIndex(playingIdx,'start','smooth')).
  // Считаем scrollTop вручную (не scrollIntoView) — надёжнее с content-visibility
  // и скроллит только #qpList, не дёргая внешние контейнеры.
  const prevCurRef = useRef<string | null>(null)
  useEffect(() => {
    if (curId && curId !== prevCurRef.current) {
      // rAF — даём React домонтировать новую строку перед замером.
      requestAnimationFrame(() => {
        const cont = scrollRef.current
        if (!cont) return
        // В расширенном виде над строкой стоит заголовок «Сейчас играет»
        // (помечен data-q-now) — скроллим к нему, иначе заголовок уезжает за верх.
        const nowLabel = cont.querySelector<HTMLElement>('[data-q-now]')
        const row = Array.from(cont.querySelectorAll<HTMLElement>('[data-id]')).find(
          (el) => el.dataset.id === curId,
        )
        const target = nowLabel ?? row
        if (target) {
          const cRect = cont.getBoundingClientRect()
          const tRect = target.getBoundingClientRect()
          const top = cont.scrollTop + (tRect.top - cRect.top)
          cont.scrollTo({ top, behavior: 'smooth' })
        } else {
          // Обычный вид: строка за пределами окна виртуализации — считаем
          // позицию по индексу.
          scrollApiRef.current?.scrollToId(curId)
        }
      })
    }
    prevCurRef.current = curId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId])

  // Трек для попапа «+» (резолв из очереди/реестра) + его наличие в библиотеке.
  const addPopupTrack = addPopupTrackId
    ? items.find((x) => x.id === addPopupTrackId)?.track ?? trackRegistry.get(addPopupTrackId) ?? null
    : null
  const addPopupInLib = addPopupTrack ? allTracks.some((t) => t.id === addPopupTrack.id) : false

  // Общие обработчики строки очереди — прокидываем в QueueSortList (drag-секции)
  // и в статичную строку играющего трека.
  const openCtx = (e: ReactMouseEvent<HTMLElement>, track: Track | null) => {
    if (!track) return
    e.preventDefault()
    e.stopPropagation()
    setCtx({ pos: { x: e.clientX, y: e.clientY }, track })
  }
  const rowHandlers: RowHandlers = {
    curId,
    onPlay: (id) => playFromCurrentQueue(id),
    onOpenCtx: openCtx,
    onAddClick: openAddPopup,
    onRemove: (id) => removeFromQueue(id),
  }

  // Расширенный вид: бьём очередь на «прослушано» (до текущего трека), «сейчас
  // играет» (текущий) и «далее» (после). Каждая секция — отдельный
  // useSortable-контейнер, поэтому drag физически не выходит за её пределы, а
  // заголовки (статичные div'ы) не участвуют в реордере.
  const extended = queueView === 'extended' && items.length > 0
  const curIdx = extended ? items.findIndex((x) => x.id === curId) : -1
  const played = extended && curIdx > 0 ? items.slice(0, curIdx) : []
  const nowItem = extended && curIdx >= 0 ? items[curIdx] : null
  const upNext = extended ? items.slice(curIdx >= 0 ? curIdx + 1 : 0) : []

  return (
    <div
      id="playerQueueBlock"
      style={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        minHeight: 0,
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(255,255,255,var(--wb))',
        background: 'rgba(255,255,255,.02)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <QueueHeader
        source={source}
        count={queue.length}
        shuffle={shuffle}
        canClear={queue.length > 1}
        onClear={clearExceptCurrent}
        headerExtra={headerExtra}
        similarIcon={similarIcon}
      />

      <div
        ref={scrollRef}
        className="qp-list"
        id="qpList"
        style={{ padding: '6px 16px 20px', overflowY: 'auto', flex: 1 }}
      >
        {items.length === 0 && (
          <div className="empty" style={{ padding: '28px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('player.queueEmpty')}</p>
          </div>
        )}
        {extended ? (
          <>
            {played.length > 0 && (
              <>
                <QueueSectionLabel>{t('player.queue.section.played')}</QueueSectionLabel>
                <QueueSortList items={played} onReorder={reorderSection('played')} handlers={rowHandlers} scrollRef={scrollRef} />
              </>
            )}
            {nowItem && (
              <>
                <QueueSectionLabel markNow>{t('player.queue.section.now')}</QueueSectionLabel>
                {/* Играющий трек — статичная строка (без drag), закреплён. */}
                <QueueRow
                  id={nowItem.id}
                  track={nowItem.track}
                  isPlaying
                  rootProps={{ 'data-sortable-id': nowItem.id, style: {} }}
                  onClick={() => playFromCurrentQueue(nowItem.id)}
                  onContextMenu={(e) => openCtx(e, nowItem.track)}
                  onMore={(e) => openCtx(e, nowItem.track)}
                  onAddClick={openAddPopup}
                  onRemove={() => removeFromQueue(nowItem.id)}
                />
              </>
            )}
            {upNext.length > 0 && (
              <>
                <QueueSectionLabel>{t('player.queue.section.next')}</QueueSectionLabel>
                <QueueSortList items={upNext} onReorder={reorderSection('next')} handlers={rowHandlers} scrollRef={scrollRef} />
              </>
            )}
          </>
        ) : (
          <QueueSortList
            items={items}
            onReorder={(ids) => reorderQueue(ids)}
            handlers={rowHandlers}
            scrollRef={scrollRef}
            scrollApiRef={scrollApiRef}
          />
        )}
      </div>
      <TrackCtxMenu
        pos={ctx?.pos ?? null}
        track={ctx?.track ?? null}
        onClose={() => setCtx(null)}
        onCreatePlaylistForTrack={(id) => createPlForTrack(id)}
        onEditTags={(t) => setTagEditTrack(t)}
      />
      <TagEditor track={tagEditTrack} onClose={() => setTagEditTrack(null)} />
      <AddPopup
        open={addPopupTrackId !== null}
        onClose={() => setAddPopupTrackId(null)}
        anchorRef={addAnchorRef}
        hasTrack={addPopupTrackId !== null}
        canAddToLib={!!addPopupTrack && !addPopupInLib}
        trackId={addPopupTrackId ?? undefined}
        onAddToLib={() => {
          if (addPopupTrack) saveTrackToLibrary(addPopupTrack)
        }}
        onPickPlaylist={(plId) => {
          if (addPopupTrack) {
            saveTrackToLibrary(addPopupTrack)
            addTrackToPl(plId, addPopupTrack.id)
          }
        }}
        onCreateNewPlaylist={() => {
          if (addPopupTrackId) createPlForTrack(addPopupTrackId)
        }}
      />
    </div>
  )
}

/**
 * Мемоизирован: на странице плеера рендерится без пропсов и читает свои сторы
 * сам. Без memo любой ре-рендер `PlayerContent` (тогл view-настройки, смена
 * громкости/play) перерисовывал бы весь список очереди (маппинг + useSortable)
 * → лаг тогглов. См. [[feedback_app_root_rerender]].
 */
export const QueueBlock = memo(QueueBlockImpl)

// ── HEADER ────────────────────────────────────────────────────────────────

const sourceLabel = (s: PlaySource, t: TFunc): string => {
  if (!s) return '—'
  switch (s.kind) {
    case 'lib-all': return t('player.queueTitle.all')
    case 'lib-fav': return t('player.queueTitle.fav')
    case 'lib-history': return t('player.queueTitle.history')
    case 'playlist': return s.name
    case 'folder': return s.name
    case 'sc': return s.label
    case 'wave': return s.label
    case 'single': return s.name || '—'
  }
}

/** 24×24 иконка/обложка слева от label в source-pill. updateSourceHeader. */
const SourceIcon = ({ source }: { source: PlaySource }) => {
  const box: React.CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: 'calc(var(--radius) * 0.4)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }
  // Треки очереди — для мозаики обложки плейлиста без своей картинки (очередь
  // плейлиста = его треки).
  const queue = useQueueStore((s) => s.queue)
  const allTracks = useLibStore((s) => s.tracks)
  if (!source) return <div id="qpSourceIcon" style={box} />
  if ((source.kind === 'playlist' || source.kind === 'sc' || source.kind === 'single') && source.cover) {
    const round = source.kind === 'sc' && source.round
    return (
      <div id="qpSourceIcon" style={round ? { ...box, borderRadius: '50%' } : box}>
        <img
          src={source.cover}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
        />
      </div>
    )
  }
  const innerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
  switch (source.kind) {
    case 'lib-all':
      return (
        <div id="qpSourceIcon" style={box}>
          <div style={{ ...innerStyle, background: 'var(--sys-all-tint)' }}>
            <Ico name="note" width={13} height={13} style={{ color: 'var(--sys-all-ico)' }} />
          </div>
        </div>
      )
    case 'lib-fav':
      return (
        <div id="qpSourceIcon" style={box}>
          <div style={{ ...innerStyle, background: 'var(--sys-fav-tint)' }}>
            <Ico name="heart" variant="bold" width={13} height={13} style={{ color: 'var(--sys-fav-ico)' }} />
          </div>
        </div>
      )
    case 'lib-history':
      // Для источника 'history' рисуем clock на нейтральном фоне.
      return (
        <div id="qpSourceIcon" style={box}>
          <div style={{ ...innerStyle, background: 'var(--sys-hist-tint)' }}>
            <Ico name="clock" width={13} height={13} style={{ color: 'var(--sys-hist-ico)' }} />
          </div>
        </div>
      )
    case 'folder':
      // Папка выглядит одинаково везде: акцентная подложка + акцентная иконка
      // (сайдбар, сетка библиотеки, шапка).
      return (
        <div id="qpSourceIcon" style={box}>
          <div style={{ ...innerStyle, background: 'var(--folder-tint)' }}>
            <Ico name="folder" width={13} height={13} style={{ color: 'var(--accent)' }} />
          </div>
        </div>
      )
    case 'playlist': {
      // Плейлист без cover — мозаика из обложек треков очереди (или винил-фолбэк
      // внутри PlaylistCover, если обложек нет).
      const byId = new Map(allTracks.map((t) => [t.id, t]))
      const covers = queue.map((id) => (byId.get(id) ?? trackRegistry.get(id))?.cover)
      return (
        <div id="qpSourceIcon" style={box}>
          <PlaylistCover covers={covers} seed={source.id} />
        </div>
      )
    }
    case 'sc':
    case 'single':
      // SC/одиночный трек без cover — note-icon на var(--card).
      return (
        <div id="qpSourceIcon" style={box}>
          <div style={{ ...innerStyle, background: 'var(--card)' }}>
            <Ico name="note" width={13} height={13} />
          </div>
        </div>
      )
    case 'wave':
      // Волна — эквалайзер-бары акцентного цвета, без фоновой плашки.
      return (
        <div id="qpSourceIcon" style={box}>
          <Ico name="wave" variant="bold" width={16} height={16} style={{ color: 'var(--accent)' }} />
        </div>
      )
  }
}

const QueueHeader = ({
  source,
  count,
  shuffle,
  canClear,
  onClear,
  headerExtra,
  similarIcon,
}: {
  source: PlaySource
  count: number
  shuffle: boolean
  canClear: boolean
  onClear: () => void
  headerExtra?: ReactNode
  similarIcon?: boolean
}) => {
  const t = useT()
  return (
  <div
    style={{
      padding: '10px 16px 6px',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <div
      id="qpSourcePill"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px 5px 6px',
        borderRadius: 'calc(var(--radius) * 0.8)',
        background: 'transparent',
        border: '1px solid rgba(255,255,255,var(--wb))',
      }}
    >
      <SourceIcon source={source} />
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1,
        }}
      >
        {sourceLabel(source, t)}
      </span>
      {shuffle && (
        <span
          id="qShuf"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
            height: 18,
            flexShrink: 0,
            color: 'var(--text2)',
            border: '1px solid rgba(255,255,255,var(--wb))',
            borderRadius: 20,
          }}
        >
          <Ico name="shuffle" width={10} height={10} />
        </span>
      )}
      <span style={{ width: 1, height: 10, background: 'rgba(255,255,255,.08)', borderRadius: 1 }} />
      <span
        id="qpSourceCount"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text2)',
          padding: '0 6px',
          height: 18,
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,var(--wb))',
        }}
      >
        {count}
      </span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {canClear && (
        <button
          id="clearQueueBtn"
          onClick={onClear}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 'calc(var(--radius) * 0.6)',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,var(--wb))',
            color: 'var(--text2)',
            cursor: 'pointer',
            transition: '.15s',
            flexShrink: 0,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(224,48,48,.15)'
            e.currentTarget.style.borderColor = 'rgba(224,48,48,.4)'
            e.currentTarget.style.color = '#e03030'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,var(--wb))'
            e.currentTarget.style.color = 'var(--text2)'
          }}
        >
          <Ico name="trash" width={13} height={13} />
        </button>
      )}
      {count > 0 && <SimilarButton icon={similarIcon} />}
      {headerExtra}
    </div>
  </div>
  )
}

/** «Похожие на очередь» (волна). icon=true — компактная иконка (узкая панель). */
const SimilarButton = ({ icon }: { icon?: boolean }) => {
  const t = useT()
  const eq = <Ico name="wave" variant="bold" width={12} height={12} />
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'calc(var(--radius) * 0.6)',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,var(--wb))',
    color: 'var(--text2)',
    cursor: 'pointer',
    transition: '.15s',
    flexShrink: 0,
    fontFamily: 'var(--font)',
  }
  const style: React.CSSProperties = icon
    ? { ...base, width: 28, height: 28 }
    : { ...base, gap: 6, padding: '0 12px', height: 28, fontSize: 11, fontWeight: 600 }
  return (
    <button
      id="qpSimilarBtn"
      onClick={() => void waveApi.startByQueue()}
      style={style}
      onMouseOver={(e) => {
        e.currentTarget.style.color = '#fff'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,.3)'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.color = 'var(--text2)'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,var(--wb))'
      }}
    >
      {eq}
      {!icon && t('player.similar')}
    </button>
  )
}

/**
 * Заголовок секции в расширенном виде очереди («Прослушано»/«Сейчас играет»/
 * «Далее»). Живёт вне useSortable-контейнеров секций, поэтому при drag не
 * затрагивается. markNow помечает заголовок «Сейчас играет» (data-q-now) —
 * к нему скроллит слежение за играющим треком.
 */
const QueueSectionLabel = ({ children, markNow }: { children: ReactNode; markNow?: boolean }) => (
  <div
    {...(markNow ? { 'data-q-now': '1' } : {})}
    style={{
      padding: '14px 4px 6px',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '.04em',
      textTransform: 'uppercase',
      color: 'var(--text2)',
      userSelect: 'none',
    }}
  >
    {children}
  </div>
)

/** Общие обработчики строки очереди (drag-секции + статичная строка). */
interface RowHandlers {
  curId: string | null
  onPlay: (id: string) => void
  onOpenCtx: (e: ReactMouseEvent<HTMLElement>, track: Track | null) => void
  onAddClick: (e: ReactMouseEvent<HTMLButtonElement>, trackId: string) => void
  onRemove: (id: string) => void
}

/** Наружное API оконного списка: скролл к треку по id (см. слежку за curId). */
interface QueueScrollApi {
  scrollToId: (id: string) => void
}

/**
 * Sortable-список треков одной секции (обычный вид = вся очередь; расширенный =
 * «Прослушано»/«Далее»). Свой useSortable-контейнер на секцию: drag не выходит
 * за её границы (cross-section перетаскивание физически невозможно), а заголовки
 * секций живут снаружи и не участвуют в DOM-перестановках реордера.
 *
 * Виртуализирован окном (useWindowedList) относительно общего скролла #qpList:
 * рендерится только видимый срез строк + спейсеры.
 */
const QueueSortList = ({
  items,
  onReorder,
  handlers,
  scrollRef,
  scrollApiRef,
}: {
  items: { id: string; track: Track | null }[]
  onReorder: (newIds: string[]) => void
  handlers: RowHandlers
  /** Скролл-контейнер #qpList (общий для секций расширенного вида). */
  scrollRef: RefObject<HTMLDivElement | null>
  /** Заполняется API скролла к треку (только обычный вид). */
  scrollApiRef?: RefObject<QueueScrollApi | null>
}) => {
  const freezeRef = useRef(false)
  const dragExpandRef = useRef(0)
  const win = useWindowedList({
    count: items.length,
    scrollRef,
    estimate: 68,
    freezeRef,
    expandRef: dragExpandRef,
  })
  const sortable = useSortable<{ id: string; track: Track | null }>({
    items,
    getId: (x) => x.id,
    enabled: items.length > 1,
    onReorder,
    getWindowStart: () => win.start,
    // Старт drag: небольшой запас строк асинхронно (мгновенный захват), дальше
    // окно в grow-only режиме дорастает при скролле — тащить можно сколь угодно
    // далеко; на дропе сжимается обратно.
    onDragChange: (active) => {
      if (active) {
        dragExpandRef.current = 40
        win.refresh()
        freezeRef.current = true
      } else {
        freezeRef.current = false
        dragExpandRef.current = 0
        win.refresh()
      }
    },
  })
  useEffect(() => {
    if (!scrollApiRef) return
    scrollApiRef.current = {
      scrollToId: (id) => {
        const idx = items.findIndex((x) => x.id === id)
        if (idx >= 0) win.scrollToIndex(idx, 'smooth')
      },
    }
    return () => {
      scrollApiRef.current = null
    }
  })
  return (
    <div
      ref={(el) => {
        sortable.containerRef.current = el
        win.containerRef.current = el
      }}
    >
      <div data-w-spacer style={{ height: win.padTop }} />
      {items.slice(win.start, win.end).map(({ id, track }, i) => {
        const { rootProps, handleProps } = sortable.itemProps(id, () => handlers.onPlay(id))
        return (
          <QueueRow
            key={id}
            id={id}
            widx={win.start + i}
            track={track}
            isPlaying={id === handlers.curId}
            rootProps={rootProps}
            handleProps={handleProps}
            onClick={() => handlers.onPlay(id)}
            onContextMenu={(e) => handlers.onOpenCtx(e, track)}
            onMore={(e) => handlers.onOpenCtx(e, track)}
            onAddClick={handlers.onAddClick}
            onRemove={() => handlers.onRemove(id)}
          />
        )
      })}
      <div data-w-spacer style={{ height: win.padBottom }} />
    </div>
  )
}

// ── ROW ───────────────────────────────────────────────────────────────────

const QueueRow = ({
  id,
  widx,
  track,
  isPlaying,
  rootProps,
  handleProps,
  onClick,
  onContextMenu,
  onMore,
  onAddClick,
  onRemove,
}: {
  id: string
  /** Индекс в оконном списке (data-widx — замер высоты строки). */
  widx?: number
  track: Track | null
  isPlaying: boolean
  rootProps: {
    'data-sortable-id': string
    style: React.CSSProperties
  }
  /** Drag-handle. undefined → строка не перетаскивается (закреплённый играющий трек). */
  handleProps?: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
    onClick: (e: React.MouseEvent<HTMLElement>) => void
    'data-draggable'?: string
  }
  onClick: () => void
  onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => void
  /** Открыть контекстное меню кнопкой «…» (в позиции клика). */
  onMore?: (e: ReactMouseEvent<HTMLButtonElement>) => void
  onAddClick: (e: ReactMouseEvent<HTMLButtonElement>, trackId: string) => void
  onRemove: (e: ReactMouseEvent<HTMLButtonElement>) => void
}) => {
  const t = useT()
  const isFav = useFavStore((s) => s.favs.has(id))
  const toggleFav = useFavStore((s) => s.toggleFav)
  const isLoading = useQueueStore((s) => s.loadingId === id)
  return (
    <div
      className={`tr${isPlaying ? ' playing' : ''}${track?.disliked ? ' is-disliked' : ''}`}
      data-id={id}
      data-widx={widx}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ cursor: 'pointer', ...rootProps.style }}
      data-sortable-id={rootProps['data-sortable-id']}
    >
      <div className="trcov" style={{ position: 'relative' }} {...(handleProps ?? {})}>
        {track?.cover ? (
          <img src={track.cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Ico name="note" width={20} height={20} style={{ opacity: 0.4 }} />
        )}
        {/* Эквалайзер на обложке играющего трека очереди.
            Пока грузится — только спиннер (ниже), бары не рисуем. */}
        {isPlaying && !isLoading && (
          <div
            className="tr-playing-overlay"
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <div className="bars"><span /><span /><span /></div>
          </div>
        )}
        {/* Спиннер загрузки стрима. */}
        {isLoading && (
          <div className="trcov-loading">
            <div className="sc-spinner" />
          </div>
        )}
        {/* Бейдж площадки поверх обложки — прячем, пока на обложке спиннер
            загрузки или эквалайзер играющего трека. */}
        {track && !isLoading && !isPlaying && <CoverSourceBadge track={track} />}
      </div>
      <div className="tri">
        <div className="trn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {/* Внутренний бегунок hover-marquee (useTrackRowMarquee). */}
            <span>{track?.name || '—'}</span>
          </span>
        </div>
        <div className="tra">
          {track ? <ArtistLinks artist={track.artist} scId={track.artistScId} permalink={track.artistPermalink} artistId={track.artistId} provider={track.artistProvider} /> : '—'}
        </div>
      </div>
      <div className="trac">
        <button
          className={`ib${isFav ? ' fav' : ''}`}
          type="button"
          aria-label={isFav ? t('player.aria.favRemove') : t('player.aria.favAdd')}
          onClick={(e) => {
            e.stopPropagation()
            if (!track) return
            // SC-трек не в библиотеке → сперва персистим (иначе не попадёт в «Любимое»).
            if (!useLibStore.getState().tracks.some((t) => t.id === track.id)) saveTrackToLibrary(track)
            toggleFav(track.id)
          }}
        >
          <Ico name="heart" variant={isFav ? 'bold' : 'linear'} width={13} height={13} />
        </button>
        <button
          className="ib"
          type="button"
          aria-label={t('player.aria.add')}
          onClick={(e) => onAddClick(e, id)}
        >
          <Ico name="add" width={13} height={13} />
        </button>
        <button
          className="ib ib-rmq"
          type="button"
          aria-label={t('player.aria.removeFromQueue')}
          onClick={(e) => {
            e.stopPropagation()
            onRemove(e)
          }}
        >
          <Ico name="minus" width={13} height={13} />
        </button>
      </div>
      <div className="trtime">
        <span className="trd">{track?.dur || '—'}</span>
        <button
          className="ib trmore"
          type="button"
          aria-label={t('common.more')}
          onClick={(e) => {
            e.stopPropagation()
            onMore?.(e)
          }}
        >
          <Ico name="kebab" width={15} height={15} />
        </button>
      </div>
    </div>
  )
}
