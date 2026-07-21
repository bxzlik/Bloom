import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Track } from '@entities/track'
import { trackRegistry, ArtistLinks, CoverSourceBadge } from '@entities/track'
import { useSortable } from '@shared/lib/useSortable'
import { useWindowedList } from '@shared/lib/useWindowedList'
import { useUiPrefsStore } from '@features/settings'
import { useT, useLocale } from '@shared/i18n'
import {
  useLibStore,
  usePlaylistStore,
  useFavStore,
  useHistoryStore,
  useSelectionStore,
  useDupsStore,
  type TrackSortMode,
  type TrackSortDir,
} from '../model'
import { getCurrentView } from '../lib/currentView'
import { historyLabel, historyTime } from '../lib/formatCount'
import { createPlaylistInline } from '../lib/createPlaylistInline'
import { deleteUploadedTrack } from '../lib'
import { playFromSource, playTrack, useQueueStore, AddPopup, addToQueue, playNextInQueue } from '@features/player'
import { TrackCtxMenu } from './TrackCtxMenu'
import { TagEditor } from './TagEditor'
import { Ico } from '@shared/ui/icons/solar'
import { useOfflineStore } from '@features/offline'

/**
 * Tracklist `#libTracklist` + `function trHTML()`.
 * Рендерит строки `.tr` с обложкой, именем, артистом, действиями, длительностью.
 *
 * Фаза C: добавлен режим `pl` (треки активного плейлиста, в его порядке `trs`).
 */

/** Стартовый запас строк окна на время drag — небольшой: дальше окно дорастает
 *  при скролле само (grow-only), а большой буфер делал захват трека медленным. */
const DRAG_WINDOW_EXPAND = 40
export const LibTracklist = () => {
  const mode = useLibStore((s) => s.mode)
  const folderPath = useLibStore((s) => s.folderPath)
  const plId = useLibStore((s) => s.plId)
  const tracks = useLibStore((s) => s.tracks)
  const searchQuery = useLibStore((s) => s.searchQuery)
  const playlistTrs = usePlaylistStore((s) =>
    plId ? s.playlists.find((p) => p.id === plId)?.trs ?? null : null,
  )
  const favs = useFavStore((s) => s.favs)
  const reorderFavs = useFavStore((s) => s.reorderFavs)
  const historyEntries = useHistoryStore((s) => s.entries)
  const sortMode = useLibStore((s) => s.sortMode)
  const sortDir = useLibStore((s) => s.sortDir)

  // Плотность строк + видимость доп-колонок (пер-колонка гейтится префом,
  // ширина окна — CSS-классом body.win-lib-wide). useLocale — реактивный
  // ре-рендер форматтера даты «Добавлено» при смене языка.
  useLocale()
  const libDensity = useUiPrefsStore((s) => s.libDensity)
  const colAlbum = useUiPrefsStore((s) => s.libColAlbum)
  const colDate = useUiPrefsStore((s) => s.libColDate)
  const listCls = `lib-tracklist${libDensity === 'compact' ? ' lib-dense' : ''}`
  // «Дата добавления» бессмысленна в Истории (там своя колонка времени игры).
  const showAlbum = colAlbum
  const showDate = colDate && mode !== 'history'

  const viewTracks = useMemo(() => {
    let base = filterByMode(
      tracks,
      mode,
      folderPath,
      playlistTrs,
      favs,
      historyEntries,
    )
    if (searchQuery) {
      const q = searchQuery
      base = base.filter(
        (t) =>
          (t.name || '').toLowerCase().includes(q) ||
          (t.artist || '').toLowerCase().includes(q) ||
          (t.album || '').toLowerCase().includes(q),
      )
    }
    if (sortMode !== 'default') base = applySort(base, sortMode, sortDir, mode)
    return base
  }, [tracks, mode, folderPath, playlistTrs, favs, historyEntries, searchQuery, sortMode, sortDir])

  // Контекстное меню + edit-модалка плейлиста (для «Новый плейлист» из меню).
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; track: Track } | null>(
    null,
  )
  const [tagEditTrack, setTagEditTrack] = useState<Track | null>(null)
  const reorderPlTracks = usePlaylistStore((s) => s.reorderPlTracks)
  const reorderTracks = useLibStore((s) => s.reorderTracks)

  // AddPopup (один общий — анкор подсовываем по клику на «+» в строке).
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

  // ── Оконная виртуализация ──
  // История — плоская лента «заголовок группы | трек» (два типа элементов),
  // остальные режимы — однородные строки. Высоты замеряются хуком по факту.
  const histFlat = useMemo(() => {
    if (mode !== 'history') return null
    const byId = new Map(historyEntries.map((e) => [e.id, e]))
    type Item =
      | { type: 1; label: string; key: string }
      | { type: 0; track: Track; idx: number; meta: { time: string; count: number } }
    const out: Item[] = []
    let lastLabel = ''
    viewTracks.forEach((t, idx) => {
      const entry = byId.get(t.id)
      if (!entry) return
      const lbl = historyLabel(entry.ts)
      if (lbl !== lastLabel) {
        out.push({ type: 1, label: lbl, key: `h_${lbl}_${entry.ts}` })
        lastLabel = lbl
      }
      out.push({
        type: 0,
        track: t,
        idx,
        meta: { time: historyTime(entry.ts), count: entry.count },
      })
    })
    return out
  }, [mode, viewTracks, historyEntries])

  // Заморозка окна на время drag (useSortable двигает строки императивно) +
  // запас строк, чтобы при подскролле во время drag не было пустых спейсеров.
  const freezeRef = useRef(false)
  const dragExpandRef = useRef(0)
  const getHistType = useCallback(
    (i: number): 0 | 1 => (histFlat ? histFlat[i]!.type : 0),
    [histFlat],
  )
  const win = useWindowedList({
    count: histFlat ? histFlat.length : viewTracks.length,
    estimate: libDensity === 'compact' ? 46 : 68,
    estimate1: 28,
    getType: histFlat ? getHistType : undefined,
    freezeRef,
    expandRef: dragExpandRef,
  })

  // Drag-reorder активен:
  //  - mode='all'    — persist через saveTracksOrder (localStorage)
  //  - mode='fav'    — persist через favAt timestamps (reorderFavs)
  //  - mode='pl'     — persist в playlistStore (reorderPlTracks)
  // Отключается при активном inline-search ИЛИ когда применена сортировка
  // (видимый порядок ≠ полный — гейт идентичен старому).
  const sortable = useSortable<Track>({
    items: viewTracks,
    getId: (t) => t.id,
    enabled:
      !searchQuery &&
      sortMode === 'default' &&
      (mode === 'pl' ? !!plId : mode === 'all' || mode === 'fav'),
    onReorder: (newIds) => {
      if (mode === 'pl' && plId) reorderPlTracks(plId, newIds)
      else if (mode === 'all') reorderTracks(newIds)
      else if (mode === 'fav') reorderFavs(newIds)
    },
    // Multi-drag: если drag начат с selected трека и выделено >1 — тащим всю
    // группу. selected порядок не важен — DOM
    // порядок сохраняется через querySelector в useSortable.
    getDragGroup: (id) => {
      const sel = useSelectionStore.getState()
      if (!sel.selMode || !sel.selected.has(id) || sel.selected.size < 2) return null
      return Array.from(sel.selected)
    },
    // Виртуализация: в DOM только срез [win.start, win.end) — useSortable
    // восстановит полный порядок. На старте drag окну даётся запас строк и
    // grow-only режим: при скролле дорастает без размонтирования, тащить можно
    // сколь угодно далеко; на дропе сжимается обратно.
    getWindowStart: () => win.start,
    onDragChange: (active) => {
      if (active) {
        // Асинхронно (НЕ flushSync): захват мгновенный, запас домонтируется
        // следующим коммитом. Геометрия не едет (строки одинаковой высоты),
        // группу multi-drag из запаса допрячет rAF-цикл useSortable.
        dragExpandRef.current = DRAG_WINDOW_EXPAND
        win.refresh()
        freezeRef.current = true
      } else {
        freezeRef.current = false
        dragExpandRef.current = 0
        win.refresh()
      }
    },
  })

  // ── Multi-select обработчики ──
  // ВАЖНО: все хуки ДО early return (Rules of Hooks). viewTracks.length===0
  // не должно менять количество выполненных хуков.
  const selMode = useSelectionStore((s) => s.selMode)
  // Сброс выделения при смене раздела/плейлиста/папки/поиска.
  useEffect(() => {
    useSelectionStore.getState().clear()
  }, [mode, plId, folderPath, searchQuery])
  // Сброс скролла при смене вида: спейсеры окна держат высоту списка, поэтому
  // scrollTop сам больше не «схлопывается» при переходе в другой плейлист.
  // useLayoutEffect + refresh — окно пересчитывается ДО отрисовки кадра, без
  // вспышки старой позиции.
  useLayoutEffect(() => {
    const el = win.containerRef.current
    if (el && el.scrollTop !== 0) {
      el.scrollTop = 0
      win.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, plId, folderPath, searchQuery])

  // ── Инлайн-режим «Найти дубли» ──
  const dupsActive = useDupsStore((s) => s.active)
  const dupsPlId = useDupsStore((s) => s.plId)
  const dupsExit = useDupsStore((s) => s.exit)
  // Авто-выход при уходе с целевого плейлиста (выбор другого раздела/плейлиста).
  useEffect(() => {
    if (dupsActive && (mode !== 'pl' || plId !== dupsPlId)) dupsExit()
  }, [dupsActive, mode, plId, dupsPlId, dupsExit])

  const onTrackCtx = (e: ReactMouseEvent<HTMLElement>, t: Track) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ pos: { x: e.clientX, y: e.clientY }, track: t })
  }

  const onTrackClick = (track: Track) => {
    const view = getCurrentView()
    if (!view.tracks.length) return
    playFromSource(view.tracks.map((x) => x.id), view.source, track.id)
  }

  const onTrackClickWithMods = (track: Track, idx: number, e: ReactMouseEvent<HTMLDivElement>) => {
    const sel = useSelectionStore.getState()
    const viewIds = viewTracks.map((t) => t.id)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      if (!sel.selMode) sel.enter(track.id, idx)
      else sel.toggle(track.id, idx)
      return
    }
    if (e.shiftKey && sel.selMode) {
      e.preventDefault()
      e.stopPropagation()
      sel.range(idx, viewIds)
      return
    }
    if (sel.selMode) {
      // В selMode plain-click тоже toggle'ит
      e.preventDefault()
      e.stopPropagation()
      sel.toggle(track.id, idx)
      return
    }
    // Обычный клик — играть.
    onTrackClick(track)
  }

  // Инлайн-дубли: показываем вместо обычного треклиста (с фильтром по дублям).
  if (dupsActive && mode === 'pl' && plId === dupsPlId) {
    return <DupsInline pool={viewTracks} plId={plId} onExit={dupsExit} />
  }

  if (viewTracks.length === 0) {
    return (
      <div className={listCls} id="libTracklist">
        <EmptyState mode={mode} />
      </div>
    )
  }

  return (
    <div
      ref={(el) => {
        sortable.containerRef.current = el
        win.containerRef.current = el
      }}
      className={listCls}
      id="libTracklist"
    >
      {/* Верхний спейсер окна — высота невидимой части списка над срезом. */}
      <div data-w-spacer style={{ height: win.padTop }} />
      {mode === 'history' &&
        histFlat &&
        histFlat.slice(win.start, win.end).map((item, i) =>
          item.type === 1 ? (
            <HistoryHeader key={item.key} label={item.label} widx={win.start + i} />
          ) : (
            <TrackRow
              key={item.track.id}
              track={item.track}
              idx={item.idx}
              widx={win.start + i}
              onContextMenu={(e) => onTrackCtx(e, item.track)}
              onMore={(e) => onTrackCtx(e, item.track)}
              onClick={(e) => onTrackClickWithMods(item.track, item.idx, e)}
              onAddClick={openAddPopup}
              showAlbum={showAlbum}
              showDate={showDate}
              historyMeta={item.meta}
            />
          ),
        )}
      {mode !== 'history' && viewTracks.slice(win.start, win.end).map((t, i) => {
        const idx = win.start + i
        // sortable click-fallback идёт ТОЛЬКО без модификаторов; модификаторы
        // обрабатываются на самом row.onClick (через onTrackClickWithMods).
        const { rootProps, handleProps } = sortable.itemProps(t.id, () => {
          if (!selMode) onTrackClick(t)
        })
        return (
          <TrackRow
            key={t.id}
            track={t}
            idx={idx}
            widx={idx}
            onContextMenu={(e) => onTrackCtx(e, t)}
            onMore={(e) => onTrackCtx(e, t)}
            onClick={(e) => onTrackClickWithMods(t, idx, e)}
            onAddClick={openAddPopup}
            showAlbum={showAlbum}
            showDate={showDate}
            rootProps={rootProps}
            handleProps={handleProps}
          />
        )
      })}
      {/* Нижний спейсер окна. */}
      <div data-w-spacer style={{ height: win.padBottom }} />
      <TrackCtxMenu
        pos={ctx?.pos ?? null}
        track={ctx?.track ?? null}
        onClose={() => setCtx(null)}
        onCreatePlaylistForTrack={(id) => createPlaylistInline({ trackId: id })}
        onEditTags={(t) => setTagEditTrack(t)}
      />
      <TagEditor track={tagEditTrack} onClose={() => setTagEditTrack(null)} />
      <AddPopup
        open={addPopupTrackId !== null}
        onClose={() => setAddPopupTrackId(null)}
        anchorRef={addAnchorRef}
        hasTrack={addPopupTrackId !== null}
        canAddToLib={false}
        trackId={addPopupTrackId ?? undefined}
        onCreateNewPlaylist={() => {
          if (addPopupTrackId) createPlaylistInline({ trackId: addPopupTrackId })
        }}
      />
    </div>
  )
}

// ── Инлайн-режим «Найти дубли» ───────────────────────────────────────
// Группирует пул треков по нормализованному name+artist; группы из >1 трека —
// дубли. В группе оставляем «лучший» (с обложкой → больше прослушиваний →
// добавлен раньше), остальные можно удалить.

const normStr = (s: string | undefined): string =>
  (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Сортировка группы: с обложкой → больше playCount → раньше добавлен. Первый = keep. */
const sortGroup = (group: Track[]): Track[] =>
  [...group].sort((a, b) => {
    if (!!a.cover !== !!b.cover) return a.cover ? -1 : 1
    if ((b.playCount || 0) !== (a.playCount || 0)) return (b.playCount || 0) - (a.playCount || 0)
    return (a.addedAt || 0) - (b.addedAt || 0)
  })

const computeDupGroups = (pool: Track[]): Track[][] => {
  const map = new Map<string, Track[]>()
  for (const t of pool) {
    const key = normStr(t.name) + '|||' + normStr(t.artist)
    const arr = map.get(key)
    if (arr) arr.push(t)
    else map.set(key, [t])
  }
  return [...map.values()].filter((g) => g.length > 1).map(sortGroup)
}

const DupNoteIcon = ({ size = 13 }: { size?: number }) => (
  <Ico name="note" size={size} style={{ opacity: 0.3 }} />
)

const DupsInline = ({
  pool,
  plId,
  onExit,
}: {
  pool: Track[]
  /** null = вся библиотека; иначе — id плейлиста (удаление = убрать из плейлиста). */
  plId: string | null
  onExit: () => void
}) => {
  const t = useT()
  const playlists = usePlaylistStore((s) => s.playlists)
  const removeTrackFromPl = usePlaylistStore((s) => s.removeTrackFromPl)

  // Реактивно: после удаления pool меняется → пересчёт → пустые группы пропадают.
  const groups = useMemo(() => computeDupGroups(pool), [pool])
  const totalDups = groups.reduce((s, g) => s + g.length - 1, 0)

  // Удалить набор треков: из плейлиста (plId) либо из библиотеки целиком.
  const deleteTracks = (toDelete: Track[]) => {
    if (plId) {
      toDelete.forEach((t) => removeTrackFromPl(plId, t.id))
    } else {
      toDelete.forEach((t) => {
        void deleteUploadedTrack(t.id)
        // deleteUploadedTrack не чистит плейлисты — убираем id отовсюду.
        playlists.forEach((p) => {
          if (p.trs.includes(t.id)) removeTrackFromPl(p.id, t.id)
        })
      })
    }
  }
  const deleteGroup = (g: Track[]) => deleteTracks(sortGroup(g).slice(1))
  const deleteAll = () => groups.forEach((g) => deleteTracks(g.slice(1)))

  return (
    <div className="lib-tracklist dups-inline" id="libTracklist">
      <div className="dups-inline-bar">
        <div className="dups-inline-info">
          <Ico name="copy" width={14} height={14} style={{ flexShrink: 0 }} />
          {groups.length > 0 ? (
            <span>
              {t('lib.dups.found.a')} <strong>{groups.length}</strong> {t('lib.dups.found.b')}{' '}
              <strong>{totalDups}</strong> {t('lib.dups.found.c')}
            </span>
          ) : (
            <span>{t('lib.dups.title')}</span>
          )}
        </div>
        <div className="dups-inline-actions">
          {groups.length > 0 && (
            <button className="dups-delete-all" onClick={deleteAll}>
              <Ico name="trash" width={13} height={13} />
              {t('lib.dups.delAll')}
            </button>
          )}
          <button className="dups-close" onClick={onExit} aria-label={t('common.close')}>
            <Ico name="close" width={14} height={14} />
          </button>
        </div>
      </div>

      {pool.length === 0 ? (
        <div className="dups-empty">
          <div className="dups-empty-icon"><DupNoteIcon size={22} /></div>
          <span style={{ fontSize: 13 }}>{plId ? t('lib.dups.noTracksPl') : t('lib.dups.noTracksLib')}</span>
        </div>
      ) : groups.length === 0 ? (
        <div className="dups-empty">
          <div className="dups-empty-icon" style={{ background: 'rgba(0,200,100,.08)' }}>
            <Ico name="check" variant="bold" width={22} height={22} style={{ color: '#3dd68c' }} />
          </div>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t('lib.dups.none')}!</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('lib.dups.checked', { n: pool.length })}</span>
        </div>
      ) : (
        groups.map((group, gi) => (
          <div className="dups-group" key={gi}>
            <div className="dups-group-head">
              <div className="dups-group-label">
                <Ico name="copy" width={12} height={12} />
                {group[0]!.name} — {group[0]!.artist || t('common.unknownArtist')}
                <span className="dups-group-badge">{t('lib.dups.copies', { n: group.length })}</span>
              </div>
              <button className="dups-del-btn" onClick={() => deleteGroup(group)}>{t('lib.dups.delGroup')}</button>
            </div>
            {group.map((tr, ti) => (
              <div className={`dups-track${ti === 0 ? ' keep' : ''}`} key={tr.id} onClick={() => playTrack(tr.id)}>
                <div className="dups-track-cov">{tr.cover ? <img src={tr.cover} alt="" /> : <DupNoteIcon />}</div>
                <div className="dups-track-info">
                  <div className="dups-track-name">{tr.name}</div>
                  <div className="dups-track-artist">
                    {(tr.artist || t('common.unknownArtist')) + (tr.playCount ? ` · ${t('lib.dups.plays', { n: tr.playCount })}` : '')}
                  </div>
                </div>
                {ti === 0 ? (
                  <span className="dups-keep-badge">{t('lib.dups.keep')}</span>
                ) : (
                  <button
                    className="dups-track-del"
                    aria-label={t('common.delete')}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteTracks([tr])
                    }}
                  >
                    <Ico name="trash" width={13} height={13} />
                  </button>
                )}
                <div className="dups-track-dur">{tr.dur || '—'}</div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}

// ── Sort после фильтрации ─────────────────────────────────────────────

const parseDurSec = (d: string | undefined): number => {
  if (!d || d === '—') return 0
  const parts = String(d).split(':').map(Number)
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0)
  return parts[0] || 0
}

const applySort = (
  tracks: Track[],
  mode: TrackSortMode,
  dir: TrackSortDir,
  libMode: string,
): Track[] => {
  const sd = dir === 'asc' ? 1 : -1
  const sorted = [...tracks]
  switch (mode) {
    case 'name':
      sorted.sort((a, b) => sd * (a.name || '').localeCompare(b.name || '', 'ru'))
      break
    case 'artist':
      sorted.sort((a, b) => sd * (a.artist || '').localeCompare(b.artist || '', 'ru'))
      break
    case 'album':
      sorted.sort((a, b) => sd * (a.album || '').localeCompare(b.album || '', 'ru'))
      break
    case 'dur':
      sorted.sort((a, b) => sd * (parseDurSec(a.dur) - parseDurSec(b.dur)))
      break
    case 'date':
      // В fav-режиме сортируем по favAt, иначе по addedAt.
      sorted.sort((a, b) => {
        if (libMode === 'fav') {
          return sd * (((b.favAt || b.addedAt || 0) - (a.favAt || a.addedAt || 0)))
        }
        return sd * (((a.addedAt || 0) - (b.addedAt || 0)))
      })
      break
    case 'plays':
      sorted.sort((a, b) => sd * ((a.playCount || 0) - (b.playCount || 0)))
      break
  }
  return sorted
}

// ── Filter по режиму ──────────────────────────────────────────────────

const filterByMode = (
  tracks: Track[],
  mode: string,
  folderPath: string | null,
  playlistTrs: string[] | null,
  favs: Map<string, number>,
  historyEntries: { id: string; ts: number }[],
): Track[] => {
  switch (mode) {
    case 'all':
      return tracks
    case 'folder':
      if (!folderPath) return []
      return tracks.filter(
        (t) => t._folder?.toLowerCase() === folderPath.toLowerCase(),
      )
    case 'pl': {
      if (!playlistTrs) return []
      // Сохраняем порядок trs; резолв библиотека → trackRegistry (SC/Yandex),
      // отсутствующие пропускаем ( .filter(Boolean) после _trackById).
      const byId = new Map(tracks.map((t) => [t.id, t]))
      const out: Track[] = []
      for (const id of playlistTrs) {
        const t = byId.get(id) ?? trackRegistry.get(id)
        if (t) out.push(t)
      }
      return out
    }
    case 'fav': {
      //: фильтр + сортировка по favAt desc.
      return tracks
        .filter((t) => favs.has(t.id))
        .sort((a, b) => (favs.get(b.id) ?? 0) - (favs.get(a.id) ?? 0))
    }
    case 'history': {
      // Порядок из history (последние сверху). Скипаем удалённые треки —
      // `.filter(function(e){return !!_trackById(e.id);})`.
      const byId = new Map(tracks.map((t) => [t.id, t]))
      const out: Track[] = []
      for (const e of historyEntries) {
        const t = byId.get(e.id) ?? trackRegistry.get(e.id)
        if (t) out.push(t)
      }
      return out
    }
    default:
      return []
  }
}

// ── Один ряд .tr ──────────────────────────────────────────────────────

const TrackRow = ({
  track,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  idx: _idx,
  widx,
  onContextMenu,
  onMore,
  onClick,
  onAddClick,
  showAlbum,
  showDate,
  rootProps,
  handleProps,
  historyMeta,
}: {
  track: Track
  idx: number
  /** Индекс в оконном списке (data-widx — замер высоты строки в useWindowedList). */
  widx?: number
  onContextMenu?: (e: ReactMouseEvent<HTMLDivElement>) => void
  /** Открыть контекстное меню кнопкой «…» (в позиции клика). */
  onMore?: (e: ReactMouseEvent<HTMLButtonElement>) => void
  onClick?: (e: ReactMouseEvent<HTMLDivElement>) => void
  onAddClick?: (e: ReactMouseEvent<HTMLButtonElement>, trackId: string) => void
  /** Показывать ячейку «Альбом» (пер-колонка гейт; ширина — через CSS). */
  showAlbum?: boolean
  /** Показывать ячейку «Добавлено». */
  showDate?: boolean
  rootProps?: {
    'data-sortable-id': string
    style: React.CSSProperties
  }
  handleProps?: {
    onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void
    onClick?: (e: React.MouseEvent<HTMLElement>) => void
    'data-draggable'?: string
  }
  /** Для history-режима: время + кол-во прослушиваний. */
  historyMeta?: { time: string; count: number }
}) => {
  const t = useT()
  const isFav = useFavStore((s) => s.favs.has(track.id))
  const toggleFav = useFavStore((s) => s.toggleFav)
  const isCurrent = useQueueStore((s) => s.curId === track.id)
  const isLoading = useQueueStore((s) => s.loadingId === track.id)
  const isSelected = useSelectionStore((s) => s.selected.has(track.id))
  const isOffline = useOfflineStore((s) => s.paths.has(track.id))

  // Провайдер альбома для клика по колонке «Альбом» (глоб. делегат .alb-link
  // в App резолвит по имени у нужной площадки; local → фильтр по названию).
  const albumProvider = track._sc
    ? 'soundcloud'
    : track._ym
      ? 'yandex'
      : track._ytm
        ? 'ytmusic'
        : track._sp
          ? 'spotify'
          : 'local'

  return (
  <div
    className={`tr${isCurrent ? ' playing' : ''}${isSelected ? ' tr-selected' : ''}`}
    data-id={track.id}
    data-widx={widx}
    onContextMenu={onContextMenu}
    onClick={onClick}
    style={{ cursor: 'pointer', ...(rootProps?.style ?? {}) }}
    data-sortable-id={rootProps?.['data-sortable-id']}
  >
    <div className="trcov" style={{ position: 'relative' }} {...(handleProps ?? {})}>
      {track.cover ? (
        <img src={track.cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <MusicNoteIcon />
      )}
      {/* Визуализатор-эквалайзер на обложке играющего трека.
          Пока грузится — показываем только спиннер (ниже), бары не рисуем. */}
      {isCurrent && !isLoading && (
        <div
          className="tr-playing-overlay"
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div className="bars"><span /><span /><span /></div>
        </div>
      )}
      {/* Спиннер пока резолвится/буферизуется стрим. */}
      {isLoading && (
        <div className="trcov-loading">
          <div className="sc-spinner" />
        </div>
      )}
      {/* Прячем бейдж, пока на обложке спиннер загрузки или эквалайзер. */}
      {!isLoading && !isCurrent && <CoverSourceBadge track={track} />}
    </div>
    <div className="tri">
      <div className="trn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {/* Внутренний бегунок hover-marquee (useTrackRowMarquee). */}
          <span>{track.name || '—'}</span>
        </span>
        {historyMeta && historyMeta.count > 1 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              fontSize: 9,
              fontWeight: 700,
              padding: '0 4px',
              lineHeight: 1,
              marginLeft: 4,
              flexShrink: 0,
            }}
          >
            {historyMeta.count}
          </span>
        )}
      </div>
      <div className="tra">
        {track.artist ? <ArtistLinks artist={track.artist} scId={track.artistScId} permalink={track.artistPermalink} artistId={track.artistId} provider={track.artistProvider} /> : '—'}
      </div>
    </div>
    {showAlbum && (
      <div className="tr-album">
        {track.album && (
          <span
            className="alb-link"
            data-album={track.album}
            data-album-artist={track.artist || ''}
            data-album-provider={albumProvider}
          >
            {track.album}
          </span>
        )}
      </div>
    )}
    {showDate && (
      <div className="tr-date">{track.addedAt ? historyLabel(track.addedAt) : '—'}</div>
    )}
    <div className="trac">
      {historyMeta && (
        <span
          style={{
            fontSize: 10,
            color: 'var(--muted)',
            paddingRight: 4,
            display: 'inline-flex',
            alignItems: 'center',
            height: 25,
          }}
        >
          {historyMeta.time}
        </span>
      )}
      <button
        className="ib"
        type="button"
        aria-label={t('lib.ctx.playNext')}
        onClick={(e) => {
          e.stopPropagation()
          playNextInQueue(track.id)
        }}
      >
        <Ico name="playNext" width={13} height={13} />
      </button>
      <button
        className="ib"
        type="button"
        aria-label={t('lib.ctx.toQueue')}
        onClick={(e) => {
          e.stopPropagation()
          addToQueue(track.id)
        }}
      >
        <Ico name="addQueue" width={14} height={14} />
      </button>
      <button
        className={`ib${isFav ? ' fav' : ''}`}
        type="button"
        aria-label={isFav ? t('player.aria.favRemove') : t('player.aria.favAdd')}
        onClick={(e) => {
          e.stopPropagation()
          toggleFav(track.id)
        }}
      >
        <Ico name="heart" variant={isFav ? 'bold' : 'linear'} width={13} height={13} />
      </button>
      <button
        className="ib"
        type="button"
        aria-label={t('player.aria.add')}
        onClick={(e) => onAddClick?.(e, track.id)}
      >
        <Ico name="add" width={13} height={13} />
      </button>
    </div>
    {/* Индикатор «доступно офлайн» (скачано для локального прослушивания) —
        слева от пилюли длительности. */}
    {isOffline && (
      <span className="tr-offline">
        <Ico name="save" width={13} height={13} />
      </span>
    )}
    <div className="trtime">
      <span className="trd">{track.dur || '—'}</span>
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

/** Заголовок группы в history-режиме. */
const HistoryHeader = ({ label, widx }: { label: string; widx?: number }) => (
  <div
    data-widx={widx}
    style={{
      padding: '10px 14px 4px',
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--muted)',
      textTransform: 'uppercase',
      letterSpacing: '.8px',
      pointerEvents: 'none',
      userSelect: 'none',
    }}
  >
    {label}
  </div>
)

const MusicNoteIcon = () => <Ico name="note" width={20} height={20} style={{ opacity: 0.4 }} />

// ── Пустые состояния ─────────────────

const EmptyState = ({ mode }: { mode: string }) => {
  const t = useT()
  let icon: React.ReactNode = null
  let title = ''
  let sub = ''
  switch (mode) {
    case 'fav':
      icon = <Ico name="heart" width={48} height={48} style={{ opacity: 0.3 }} />
      title = t('lib.empty.favTitle')
      sub = t('lib.empty.favSub')
      break
    case 'history':
      icon = <Ico name="clock" width={48} height={48} style={{ opacity: 0.3 }} />
      title = t('lib.empty.historyTitle')
      sub = ''
      break
    case 'folder':
      icon = <Ico name="folder" width={48} height={48} style={{ opacity: 0.3 }} />
      title = t('lib.empty.folderTitle')
      sub = ''
      break
    case 'pl':
      icon = <Ico name="note" width={48} height={48} style={{ opacity: 0.3 }} />
      title = t('lib.empty.plTitle')
      sub = t('lib.empty.plSub')
      break
    case 'all':
    default:
      icon = <Ico name="note" width={48} height={48} style={{ opacity: 0.3 }} />
      title = t('lib.empty.noTracksTitle')
      sub = t('lib.empty.noTracksSub')
  }
  return (
    <div
      className="empty"
      style={{
        height: '100%',
        minHeight: 280,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      {icon}
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text)',
          marginTop: 4,
        }}
      >
        {title}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
