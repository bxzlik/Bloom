import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Track } from '@entities/track'
import { trackRegistry, ArtistLinks, CoverSourceBadge } from '@entities/track'
import { useSortable } from '@shared/lib/useSortable'
import { useT } from '@shared/i18n'
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
import { playFromSource, playTrack, useQueueStore, AddPopup } from '@features/player'
import { TrackCtxMenu } from './TrackCtxMenu'
import { TagEditor } from './TagEditor'

/**
 * Tracklist `#libTracklist` + `function trHTML()`.
 * Рендерит строки `.tr` с обложкой, именем, артистом, действиями, длительностью.
 *
 * Фаза C: добавлен режим `pl` (треки активного плейлиста, в его порядке `trs`).
 */
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
  })

  // ── Multi-select обработчики ──
  // ВАЖНО: все хуки ДО early return (Rules of Hooks). viewTracks.length===0
  // не должно менять количество выполненных хуков.
  const selMode = useSelectionStore((s) => s.selMode)
  // Сброс выделения при смене раздела/плейлиста/папки/поиска.
  useEffect(() => {
    useSelectionStore.getState().clear()
  }, [mode, plId, folderPath, searchQuery])

  // ── Инлайн-режим «Найти дубли» ──
  const dupsActive = useDupsStore((s) => s.active)
  const dupsPlId = useDupsStore((s) => s.plId)
  const dupsExit = useDupsStore((s) => s.exit)
  // Авто-выход при уходе с целевого плейлиста (выбор другого раздела/плейлиста).
  useEffect(() => {
    if (dupsActive && (mode !== 'pl' || plId !== dupsPlId)) dupsExit()
  }, [dupsActive, mode, plId, dupsPlId, dupsExit])

  const onTrackCtx = (e: ReactMouseEvent<HTMLDivElement>, t: Track) => {
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
      <div className="lib-tracklist" id="libTracklist">
        <EmptyState mode={mode} />
      </div>
    )
  }

  // Для history-mode строим лента с заголовками-группами. entries уже идут new→old.
  const historyByIdMap = mode === 'history'
    ? new Map(historyEntries.map((e) => [e.id, e]))
    : null

  return (
    <div ref={sortable.containerRef} className="lib-tracklist" id="libTracklist">
      {(() => {
        if (mode !== 'history') return null
        const nodes: React.ReactNode[] = []
        let lastLabel = ''
        viewTracks.forEach((t, idx) => {
          const entry = historyByIdMap?.get(t.id)
          if (!entry) return
          const lbl = historyLabel(entry.ts)
          if (lbl !== lastLabel) {
            nodes.push(<HistoryHeader key={`h_${lbl}_${entry.ts}`} label={lbl} />)
            lastLabel = lbl
          }
          nodes.push(
            <TrackRow
              key={t.id}
              track={t}
              idx={idx}
              onContextMenu={(e) => onTrackCtx(e, t)}
              onClick={(e) => onTrackClickWithMods(t, idx, e)}
              onAddClick={openAddPopup}
              historyMeta={{ time: historyTime(entry.ts), count: entry.count }}
            />,
          )
        })
        return nodes
      })()}
      {mode !== 'history' && viewTracks.map((t, idx) => {
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
            onContextMenu={(e) => onTrackCtx(e, t)}
            onClick={(e) => onTrackClickWithMods(t, idx, e)}
            onAddClick={openAddPopup}
            rootProps={rootProps}
            handleProps={handleProps}
          />
        )
      })}
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
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ opacity: 0.3 }}>
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ flexShrink: 0 }}>
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" />
              </svg>
              {t('lib.dups.delAll')}
            </button>
          )}
          <button className="dups-close" onClick={onExit} aria-label={t('common.close')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3dd68c" strokeWidth={2} strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t('lib.dups.none')}!</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('lib.dups.checked', { n: pool.length })}</span>
        </div>
      ) : (
        groups.map((group, gi) => (
          <div className="dups-group" key={gi}>
            <div className="dups-group-head">
              <div className="dups-group-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
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
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" />
                    </svg>
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
  onContextMenu,
  onClick,
  onAddClick,
  rootProps,
  handleProps,
  historyMeta,
}: {
  track: Track
  idx: number
  onContextMenu?: (e: ReactMouseEvent<HTMLDivElement>) => void
  onClick?: (e: ReactMouseEvent<HTMLDivElement>) => void
  onAddClick?: (e: ReactMouseEvent<HTMLButtonElement>, trackId: string) => void
  rootProps?: {
    'data-sortable-id': string
    style: React.CSSProperties
  }
  handleProps?: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
    onClick: (e: React.MouseEvent<HTMLElement>) => void
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

  return (
  <div
    className={`tr${isCurrent ? ' playing' : ''}${isSelected ? ' tr-selected' : ''}`}
    data-id={track.id}
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
        className={`ib${isFav ? ' fav' : ''}`}
        type="button"
        aria-label={isFav ? t('player.aria.favRemove') : t('player.aria.favAdd')}
        onClick={(e) => {
          e.stopPropagation()
          toggleFav(track.id)
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill={isFav ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
      </button>
      <button
        className="ib"
        type="button"
        aria-label={t('player.aria.add')}
        onClick={(e) => onAddClick?.(e, track.id)}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
    <div className="trd">{track.dur || '—'}</div>
  </div>
  )
}

/** Заголовок группы в history-режиме. */
const HistoryHeader = ({ label }: { label: string }) => (
  <div
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

const MusicNoteIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    style={{ opacity: 0.4 }}
  >
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
)

// ── Пустые состояния ─────────────────

const EmptyState = ({ mode }: { mode: string }) => {
  const t = useT()
  let icon: React.ReactNode = null
  let title = ''
  let sub = ''
  switch (mode) {
    case 'fav':
      icon = (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          style={{ opacity: 0.3 }}
        >
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
      )
      title = t('lib.empty.favTitle')
      sub = t('lib.empty.favSub')
      break
    case 'history':
      icon = (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          style={{ opacity: 0.3 }}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
      title = t('lib.empty.historyTitle')
      sub = ''
      break
    case 'folder':
      icon = (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          style={{ opacity: 0.3 }}
        >
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      )
      title = t('lib.empty.folderTitle')
      sub = ''
      break
    case 'pl':
      icon = (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          style={{ opacity: 0.3 }}
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      )
      title = t('lib.empty.plTitle')
      sub = t('lib.empty.plSub')
      break
    case 'all':
    default:
      icon = (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          style={{ opacity: 0.3 }}
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      )
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
