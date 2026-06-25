import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useSortable } from '@shared/lib/useSortable'
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
import { VinylCover } from '@shared/ui'
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
        const row = Array.from(cont.querySelectorAll<HTMLElement>('[data-id]')).find(
          (el) => el.dataset.id === curId,
        )
        if (!row) return
        // В расширенном виде над строкой стоит заголовок «Сейчас играет»
        // (помечен data-q-now) — скроллим к нему, иначе заголовок уезжает за верх.
        const nowLabel = cont.querySelector<HTMLElement>('[data-q-now]')
        const target = nowLabel ?? row
        const cRect = cont.getBoundingClientRect()
        const tRect = target.getBoundingClientRect()
        const top = cont.scrollTop + (tRect.top - cRect.top)
        cont.scrollTo({ top, behavior: 'smooth' })
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
  const openCtx = (e: ReactMouseEvent<HTMLDivElement>, track: Track | null) => {
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
                <QueueSortList items={played} onReorder={reorderSection('played')} handlers={rowHandlers} />
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
                  onAddClick={openAddPopup}
                  onRemove={() => removeFromQueue(nowItem.id)}
                />
              </>
            )}
            {upNext.length > 0 && (
              <>
                <QueueSectionLabel>{t('player.queue.section.next')}</QueueSectionLabel>
                <QueueSortList items={upNext} onReorder={reorderSection('next')} handlers={rowHandlers} />
              </>
            )}
          </>
        ) : (
          <QueueSortList items={items} onReorder={(ids) => reorderQueue(ids)} handlers={rowHandlers} />
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
          <div style={{ ...innerStyle, background: 'linear-gradient(135deg,#1a3a4a,#0d2535)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={1.8} strokeLinecap="round">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        </div>
      )
    case 'lib-fav':
      return (
        <div id="qpSourceIcon" style={box}>
          <div style={{ ...innerStyle, background: 'linear-gradient(135deg,#c0144e,#7a0030)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth={1.5}>
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          </div>
        </div>
      )
    case 'lib-history':
      // Для источника 'history' рисуем clock на нейтральном фоне.
      return (
        <div id="qpSourceIcon" style={box}>
          <div style={{ ...innerStyle, background: 'linear-gradient(135deg,#3a3a3a,#1a1a1a)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={1.8} strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>
      )
    case 'folder':
      return (
        <div id="qpSourceIcon" style={box}>
          <div style={{ ...innerStyle, background: 'linear-gradient(135deg,#1a3a2a,#0d2518)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={1.8} strokeLinecap="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
          </div>
        </div>
      )
    case 'playlist':
      // Плейлист без cover — рисованный винил (цвет лейбла по id плейлиста).
      return (
        <div id="qpSourceIcon" style={box}>
          <VinylCover seed={source.id} />
        </div>
      )
    case 'sc':
    case 'single':
      // SC/одиночный трек без cover — note-icon на var(--card).
      return (
        <div id="qpSourceIcon" style={box}>
          <div style={{ ...innerStyle, background: 'var(--card)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        </div>
      )
    case 'wave':
      // Волна — эквалайзер-бары акцентного цвета, без фоновой плашки.
      return (
        <div id="qpSourceIcon" style={box}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)">
            <rect x="2" y="9" width="2.6" height="6" rx="1.3" /><rect x="6.4" y="6" width="2.6" height="12" rx="1.3" /><rect x="10.8" y="3" width="2.6" height="18" rx="1.3" /><rect x="15.2" y="7" width="2.6" height="10" rx="1.3" /><rect x="19.6" y="10" width="2.6" height="4" rx="1.3" />
          </svg>
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
          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" strokeLinecap="round" />
            <path d="m18 2 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2" strokeLinecap="round" />
            <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8" strokeLinecap="round" />
            <path d="m18 14 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
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
  const eq = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="9" width="2.6" height="6" rx="1.3" />
      <rect x="6.4" y="6" width="2.6" height="12" rx="1.3" />
      <rect x="10.8" y="3" width="2.6" height="18" rx="1.3" />
      <rect x="15.2" y="7" width="2.6" height="10" rx="1.3" />
      <rect x="19.6" y="10" width="2.6" height="4" rx="1.3" />
    </svg>
  )
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
  onOpenCtx: (e: ReactMouseEvent<HTMLDivElement>, track: Track | null) => void
  onAddClick: (e: ReactMouseEvent<HTMLButtonElement>, trackId: string) => void
  onRemove: (id: string) => void
}

/**
 * Sortable-список треков одной секции (обычный вид = вся очередь; расширенный =
 * «Прослушано»/«Далее»). Свой useSortable-контейнер на секцию: drag не выходит
 * за её границы (cross-section перетаскивание физически невозможно), а заголовки
 * секций живут снаружи и не участвуют в DOM-перестановках реордера.
 */
const QueueSortList = ({
  items,
  onReorder,
  handlers,
}: {
  items: { id: string; track: Track | null }[]
  onReorder: (newIds: string[]) => void
  handlers: RowHandlers
}) => {
  const sortable = useSortable<{ id: string; track: Track | null }>({
    items,
    getId: (x) => x.id,
    enabled: items.length > 1,
    onReorder,
  })
  return (
    <div ref={sortable.containerRef}>
      {items.map(({ id, track }) => {
        const { rootProps, handleProps } = sortable.itemProps(id, () => handlers.onPlay(id))
        return (
          <QueueRow
            key={id}
            id={id}
            track={track}
            isPlaying={id === handlers.curId}
            rootProps={rootProps}
            handleProps={handleProps}
            onClick={() => handlers.onPlay(id)}
            onContextMenu={(e) => handlers.onOpenCtx(e, track)}
            onAddClick={handlers.onAddClick}
            onRemove={() => handlers.onRemove(id)}
          />
        )
      })}
    </div>
  )
}

// ── ROW ───────────────────────────────────────────────────────────────────

const QueueRow = ({
  id,
  track,
  isPlaying,
  rootProps,
  handleProps,
  onClick,
  onContextMenu,
  onAddClick,
  onRemove,
}: {
  id: string
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
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ cursor: 'pointer', ...rootProps.style }}
      data-sortable-id={rootProps['data-sortable-id']}
    >
      <div className="trcov" style={{ position: 'relative' }} {...(handleProps ?? {})}>
        {track?.cover ? (
          <img src={track.cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" style={{ opacity: 0.4 }}>
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
        </button>
        <button
          className="ib"
          type="button"
          aria-label={t('player.aria.add')}
          onClick={(e) => onAddClick(e, id)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="trd">{track?.dur || '—'}</div>
    </div>
  )
}
