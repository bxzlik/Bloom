import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@shared/lib/cn'
import { toast, VinylCover } from '@shared/ui'
import { useT, useLocale } from '@shared/i18n'
import { useSortable } from '@shared/lib/useSortable'
import { ScBadge, YmBadge, type Track } from '@entities/track'
import { playFromSource } from '@features/player'
import {
  useLibStore,
  usePlaylistStore,
  usePlEditStore,
  useFavStore,
  useFollowStore,
  useUnifiedOrderStore,
  type UnifiedItem,
} from '../model'
import {
  tracksAndDuration,
  recordsLabel,
  sumDurations,
  usePlayHistoryCount,
  useLibSidebarSort,
  buildOrderedUnifiedEntries,
  type LibSidebarSort,
  type UnifiedEntry,
} from '../lib'
import { LibAddMenu } from './LibAddMenu'
import { LibSortMenu } from './LibSortMenu'
import { PlMenu } from './PlMenu'
import { AddFromLibModal } from './AddFromLibModal'

// Hover-кнопки play на системных строках сайдбара. Берём треки императивно
// из стора в момент клика — libPlayAll / libPlayFav, без
// переключения раздела (пользователь может play не открывая «Все»/«Любимые»).
const playAllFromStore = () => {
  const all = useLibStore.getState().tracks
  if (!all.length) return
  playFromSource(
    all.map((t) => t.id),
    { kind: 'lib-all' },
  )
}
const playFavFromStore = () => {
  const all = useLibStore.getState().tracks
  const favs = useFavStore.getState().favs
  const list = all
    .filter((t) => favs.has(t.id))
    .sort((a, b) => (favs.get(b.id) ?? 0) - (favs.get(a.id) ?? 0))
  if (!list.length) return
  playFromSource(
    list.map((t) => t.id),
    { kind: 'lib-fav' },
  )
}
const playPlaylistFromStore = (plId: string) => {
  const all = useLibStore.getState().tracks
  const pls = usePlaylistStore.getState().playlists
  const pl = pls.find((p) => p.id === plId)
  if (!pl) return
  const byId = new Map(all.map((t) => [t.id, t]))
  const ids = pl.trs.filter((id) => byId.has(id))
  if (!ids.length) return
  playFromSource(ids, {
    kind: 'playlist',
    id: pl.id,
    name: pl.name,
    cover: pl.cover ?? null,
  })
}
const playFolderFromStore = (path: string) => {
  const all = useLibStore.getState().tracks
  const lp = path.toLowerCase()
  const ids = all
    .filter((t) => t._folder?.toLowerCase() === lp)
    .map((t) => t.id)
  if (!ids.length) return
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  playFromSource(ids, {
    kind: 'folder',
    path,
    name: parts[parts.length - 1] || path,
  })
}
const stopAnd = (fn: () => void) => (e: ReactMouseEvent) => {
  e.stopPropagation()
  fn()
}

/**
 * Левая колонка библиотеки `.lib-sidebar`.
 * SVG-иконки и onclick семантика скопированы без изменений.
 *
 * Счётчики: «Все треки» = `tracks.length` из стора, «Любимые» = фильтр по
 * fav-полю (пока всегда 0 — лайки в фазе D), «История» = длина playHistory
 * из localStorage.
 */
export const LibSidebar = () => {
  const t = useT()
  useLocale()
  const mode = useLibStore((s) => s.mode)
  const sbCompact = useLibStore((s) => s.sbCompact)
  const selectBuiltin = useLibStore((s) => s.selectBuiltin)
  const toggleSbCompact = useLibStore((s) => s.toggleSbCompact)
  const selectPlaylist = useLibStore((s) => s.selectPlaylist)
  const allTracks = useLibStore((s) => s.tracks)
  const totalTracks = allTracks.length
  const favs = useFavStore((s) => s.favs)
  // Счётчик = реально видимые любимые (резолвятся в существующий трек), а НЕ
  // favs.size: лайки живут отдельным стором и могут «зависнуть» после удаления
  // трека из библиотеки → иначе сайдбар показывал бы 5 при пустом виде «Любимые».
  // `tracks.filter(t=>t.fav).length`.
  const favTracks = allTracks.filter((t) => favs.has(t.id))
  const favCount = favTracks.length
  const historyCount = usePlayHistoryCount()

  // Суммарная длительность для системных пунктов.
  const allDurSec = sumDurations(allTracks.map((t) => t.dur))
  const favDurSec = sumDurations(favTracks.map((t) => t.dur))

  const addBtnRef = useRef<HTMLButtonElement>(null)
  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [sortMode, setSortMode] = useLibSidebarSort()

  // Тост-фидбек импорта.
  const handleImported = (res: { playlists: number; tracks: number } | null) => {
    if (!res) return toast(t('settings.system.toast.importInvalid'))
    if (res.playlists === 0) return toast(t('settings.system.toast.importNoPlaylists'))
    toast(
      res.tracks
        ? t('settings.system.toast.importedFull', { pl: res.playlists, tr: res.tracks })
        : t('settings.system.toast.importedPlaylists', { pl: res.playlists }),
    )
  }

  // ПКМ-меню для плейлиста/папки в sidebar.
  const [ctxEntry, setCtxEntry] = useState<
    | { type: 'playlist'; id: string; x: number; y: number }
    | { type: 'folder'; id: string; x: number; y: number }
    | null
  >(null)
  const startEdit = usePlEditStore((s) => s.startEdit)
  const [addToPlId, setAddToPlId] = useState<string | null>(null)
  // ПКМ по артисту в sidebar — отдельное меню (не PlMenu).
  const [artistCtx, setArtistCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  // Роутинг ПКМ: артист → своё меню, плейлист/папка → PlMenu.
  const routeCtx = (e: CtxEntry | null) => {
    if (e && e.type === 'artist') {
      setArtistCtx({ id: e.id, x: e.x, y: e.y })
      return
    }
    setCtxEntry(e)
  }
  const playlistsAll = usePlaylistStore((s) => s.playlists)
  const ctxPlaylist =
    ctxEntry?.type === 'playlist'
      ? playlistsAll.find((p) => p.id === ctxEntry.id) ?? null
      : null
  const ctxFolderPath = ctxEntry?.type === 'folder' ? ctxEntry.id : null
  const ctxFolderName = ctxFolderPath
    ? ctxFolderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || ctxFolderPath
    : ''
  const tracksAll = useLibStore((s) => s.tracks)
  const ctxFolderTracksCount = ctxFolderPath
    ? tracksAll.filter((t) => t._folder?.toLowerCase() === ctxFolderPath.toLowerCase()).length
    : 0
  const ctxHeroName = ctxEntry?.type === 'playlist' ? (ctxPlaylist?.name ?? '') : ctxFolderName
  // Суммарная длительность для header'а контекстного меню.
  const ctxHeroSub = (() => {
    if (ctxEntry?.type === 'playlist' && ctxPlaylist) {
      const byId = new Map(tracksAll.map((t) => [t.id, t]))
      const dur = sumDurations(ctxPlaylist.trs.map((id) => byId.get(id)?.dur))
      return tracksAndDuration(ctxPlaylist.trs.length, dur)
    }
    if (ctxFolderPath) {
      const lp = ctxFolderPath.toLowerCase()
      const dur = sumDurations(
        tracksAll.filter((t) => t._folder?.toLowerCase() === lp).map((t) => t.dur),
      )
      return tracksAndDuration(ctxFolderTracksCount, dur)
    }
    return ''
  })()

  return (
    <div className={cn('lib-sidebar', sbCompact && 'lib-sb-compact')}>
      {/* ── Системные ─────────────────────────────────────────── */}
      <div className="lib-block" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 4px' }}>
          <div
            className={cn(
              'lib-item lib-item-sys lib-item-sys-all',
              mode === 'all' && 'active',
            )}
            id="libItemAll"
            onClick={() => selectBuiltin('all')}
          >
            <div className="lib-icon off-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <div className="lib-item-info">
              <div className="lib-item-name">{t('lib.allTracks')}</div>
              <div className="lib-item-sub" id="libAllSub">
                {tracksAndDuration(totalTracks, allDurSec)}
              </div>
            </div>
            <button
              className="lib-item-play"
              onClick={stopAnd(playAllFromStore)}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
              </svg>
            </button>
          </div>

          <div
            className={cn(
              'lib-item lib-item-sys lib-item-sys-fav',
              mode === 'fav' && 'active',
            )}
            id="libItemFav"
            onClick={() => selectBuiltin('fav')}
          >
            <div className="lib-icon fav-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="white"
                stroke="white"
                strokeWidth={1.5}
              >
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </div>
            <div className="lib-item-info">
              <div className="lib-item-name">{t('lib.liked')}</div>
              <div className="lib-item-sub" id="libFavSub">
                {tracksAndDuration(favCount, favDurSec)}
              </div>
            </div>
            <button
              className="lib-item-play"
              onClick={stopAnd(playFavFromStore)}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
              </svg>
            </button>
          </div>

          <div
            className={cn(
              'lib-item lib-item-sys lib-item-sys-hist',
              mode === 'history' && 'active',
            )}
            id="libItemHistory"
            onClick={() => selectBuiltin('history')}
          >
            <div
              className="lib-icon"
              style={{ background: 'rgba(255,180,0,.15)' }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="lib-item-info">
              <div className="lib-item-name">{t('lib.history')}</div>
              <div className="lib-item-sub" id="libHistorySub">
                {recordsLabel(historyCount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Объединённый блок папок и плейлистов ──────────────── */}
      <div
        className="lib-block lib-block-combined"
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div className="lib-section-title">
          {t('lib.myLibrary')}
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <button id="libSbCompactBtn" onClick={toggleSbCompact}>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
              >
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </svg>
            </button>
            <button
              ref={sortBtnRef}
              id="libSortBtn"
              className={cn(sortMode !== 'default' && 'sort-active')}
              onClick={(e) => {
                e.stopPropagation()
                setSortMenuOpen((v) => !v)
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="15" y2="12" />
                <line x1="3" y1="18" x2="9" y2="18" />
              </svg>
            </button>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                height: 13,
              }}
            >
              <button
                ref={addBtnRef}
                id="libAddBtn"
                className={cn(addMenuOpen && 'open')}
                onClick={(e) => {
                  e.stopPropagation()
                  setAddMenuOpen((v) => !v)
                }}
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
          </div>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '0 4px 10px',
            scrollbarWidth: 'none',
          }}
        >
          <UnifiedList sortMode={sortMode} onContextEntry={routeCtx} />
        </div>
      </div>

      <LibAddMenu
        open={addMenuOpen}
        onClose={() => setAddMenuOpen(false)}
        anchorRef={addBtnRef}
        onImported={handleImported}
      />
      <LibSortMenu
        open={sortMenuOpen}
        onClose={() => setSortMenuOpen(false)}
        anchorRef={sortBtnRef}
        value={sortMode}
        onChange={setSortMode}
      />

      {/* ПКМ-меню по плейлисту/папке в sidebar — reuse PlMenu в cursor-mode */}
      <PlMenu
        open={ctxEntry !== null}
        onClose={() => setCtxEntry(null)}
        cursorX={ctxEntry?.x ?? null}
        cursorY={ctxEntry?.y ?? null}
        mode={ctxEntry?.type === 'folder' ? 'folder' : 'pl'}
        heroName={ctxHeroName}
        heroSub={ctxHeroSub}
        playlist={ctxPlaylist}
        folderPath={ctxFolderPath}
        onReset={() => {
          // Если ctx был на текущем активном — сбрасываем в 'all'.
          if (ctxEntry?.type === 'playlist' && mode === 'pl') selectBuiltin('all')
          else if (ctxEntry?.type === 'folder') selectBuiltin('all')
        }}
        onEdit={(id) => {
          selectPlaylist(id)
          startEdit(id)
        }}
        onAddTracks={(id) => setAddToPlId(id)}
      />
      <AddFromLibModal
        open={addToPlId !== null}
        onClose={() => setAddToPlId(null)}
        playlistId={addToPlId}
      />

      {/* ПКМ-меню артиста в sidebar (Открыть / Закрепить / Отписаться) */}
      <ArtistCtxMenu ctx={artistCtx} onClose={() => setArtistCtx(null)} />
    </div>
  )
}

// ── Контекстное меню подписки на артиста ──
export const ArtistCtxMenu = ({
  ctx,
  onClose,
}: {
  ctx: { id: string; x: number; y: number } | null
  onClose: () => void
}) => {
  const t = useT()
  const artists = useFollowStore((s) => s.artists)
  const unfollow = useFollowStore((s) => s.unfollow)
  const isPinned = useUnifiedOrderStore((s) => s.isPinned)
  const togglePin = useUnifiedOrderStore((s) => s.togglePin)

  useEffect(() => {
    if (!ctx) return
    const onDown = () => onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // capture:true чтобы отработать раньше других; пункты используют onMouseDown.
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctx, onClose])

  if (!ctx) return null
  const a = artists.find((x) => x.id === ctx.id)
  if (!a) return null
  const pinned = isPinned('artist', ctx.id)

  // Открыть артиста по точному entity-id через общий делегат .tra-link.
  const open = () => {
    onClose()
    const el = document.createElement('span')
    el.className = 'tra-link'
    el.dataset.artist = a.name
    el.dataset.artistId = a.id
    if (a.avatar) el.dataset.artistCover = a.avatar
    document.body.appendChild(el)
    el.click()
    el.remove()
  }

  const x = Math.min(ctx.x, window.innerWidth - 200)
  const y = Math.min(ctx.y, window.innerHeight - 140)

  return createPortal(
    <div
      className="ctx open"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="ci" onClick={open}>
        <span className="ci-icon">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" /></svg>
        </span>{' '}
        {t('common.open')}
      </div>
      <div
        className="ci"
        onClick={() => {
          togglePin('artist', ctx.id)
          onClose()
        }}
      >
        <span className="ci-icon">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14l-1.5-9H6.5L5 17z" /><path d="M9 8V4a3 3 0 0 1 6 0v4" /></svg>
        </span>{' '}
        {pinned ? t('lib.sidebar.unpin') : t('lib.sidebar.pin')}
      </div>
      <div className="cx-sep" />
      <div
        className="ci red"
        onClick={() => {
          unfollow(ctx.id)
          onClose()
        }}
      >
        <span className="ci-icon">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="8" x2="22" y2="13" /><line x1="22" y1="8" x2="17" y2="13" /></svg>
        </span>{' '}
        {t('search.unfollow')}
      </div>
    </div>,
    document.body,
  )
}

// ── Unified list: пока только папки. Плейлисты + артисты — фаза C/D. ──

const folderName = (path: string): string => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

const folderSafeId = (path: string): string =>
  'libFolder_' + path.replace(/[^a-zA-Z0-9]/g, '_')

type CtxEntry =
  | { type: 'playlist'; id: string; x: number; y: number }
  | { type: 'folder'; id: string; x: number; y: number }
  | { type: 'artist'; id: string; x: number; y: number }

const UnifiedList = ({
  sortMode,
  onContextEntry,
}: {
  sortMode: LibSidebarSort
  onContextEntry: (e: CtxEntry | null) => void
}) => {
  const t = useT()
  useLocale()
  const folders = useLibStore((s) => s.folders)
  const mode = useLibStore((s) => s.mode)
  const folderPath = useLibStore((s) => s.folderPath)
  const plId = useLibStore((s) => s.plId)
  const tracks = useLibStore((s) => s.tracks)
  const sbCompact = useLibStore((s) => s.sbCompact)
  const selectFolder = useLibStore((s) => s.selectFolder)
  const selectPlaylist = useLibStore((s) => s.selectPlaylist)
  const playlists = usePlaylistStore((s) => s.playlists)
  const followedArtists = useFollowStore((s) => s.artists)
  const order = useUnifiedOrderStore((s) => s.order)
  const applyOrder = useUnifiedOrderStore((s) => s.applyOrder)
  const setOrder = useUnifiedOrderStore((s) => s.setOrder)

  // Упорядоченный список (плейлисты+папки+артисты) + множество закреплённых —
  // общий помощник, переиспользуется grid-обзором (LibGridOverview).
  type Entry = UnifiedEntry
  const { entries, pinnedSet } = buildOrderedUnifiedEntries({
    playlists: playlists.map((p) => ({ id: p.id, name: p.name })),
    folders: folders.map((path) => ({ id: path, name: folderName(path) })),
    artists: followedArtists.map((a) => ({ id: a.id, name: a.name })),
    order,
    applyOrder,
    sortMode,
  })

  // Drag-reorder активен ТОЛЬКО в дефолтной сортировке.
  // ID для sortable = "type:id", чтобы не конфликтовали playlist/folder.
  const entryKey = (e: Entry): string => `${e.type}:${e.id}`
  const sortable = useSortable<Entry>({
    items: entries,
    getId: entryKey,
    enabled: sortMode === 'default',
    // Pinned-партиционирование: закреплённые (ранг 0) реордерятся только среди
    // закреплённых, обычные (ранг 1) — среди обычных. Граница не пересекается.
    getGroupRank: (key) => (pinnedSet.has(key) ? 0 : 1),
    onReorder: (newKeys) => {
      const next: UnifiedItem[] = newKeys.map((k) => {
        const i = k.indexOf(':')
        return { type: k.slice(0, i) as UnifiedItem['type'], id: k.slice(i + 1) }
      })
      setOrder(next)
    },
  })

  const empty =
    folders.length === 0 && playlists.length === 0 && followedArtists.length === 0

  if (empty) {
    return (
      <>
        <div
          id="libUnifiedList"
          style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        />
        <div
          id="libCombinedEmpty"
          style={{ padding: '4px 10px 6px', fontSize: 11, color: 'var(--muted)' }}
        >
          {t('lib.sidebar.empty')}
        </div>
      </>
    )
  }

  // Считаем количество треков в каждой папке.
  const folderCounts: Record<string, number> = {}
  for (const t of tracks) {
    if (t._folder) folderCounts[t._folder] = (folderCounts[t._folder] || 0) + 1
  }

  // Быстрый lookup плейлистов/артистов/треков по id для рендера.
  const plById = new Map(playlists.map((p) => [p.id, p]))
  const artById = new Map(followedArtists.map((a) => [a.id, a]))
  const tracksById = new Map(tracks.map((t) => [t.id, t]))
  // Локальные треки артиста (для подписи строки «N треков · время»).
  const artistStats = (name: string): { count: number; sec: number } => {
    const ln = name.toLowerCase()
    const list = tracks.filter((t) => (t.artist || '').toLowerCase() === ln)
    return { count: list.length, sec: sumDurations(list.map((t) => t.dur)) }
  }
  // Открыть страницу артиста через общий делегат `.tra-link` (без импорта
  // features/search в library). Открываем по ТОЧНОМУ entity-id (data-artist-id),
  // а не по имени — иначе резолв по имени может попасть на другого артиста.
  const openArtist = (id: string) => {
    const a = artById.get(id)
    if (!a) return
    const el = document.createElement('span')
    el.className = 'tra-link'
    el.dataset.artist = a.name
    el.dataset.artistId = a.id
    if (a.avatar) el.dataset.artistCover = a.avatar
    document.body.appendChild(el)
    el.click()
    el.remove()
  }

  return (
    <div
      ref={sortable.containerRef}
      id="libUnifiedList"
      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {entries.map((entry) => {
        // Click-fallback: переключает раздел; вызывается если pointerdown→up
        // без активации drag.
        const clickFallback =
          entry.type === 'playlist'
            ? () => selectPlaylist(entry.id)
            : entry.type === 'artist'
              ? () => openArtist(entry.id)
              : () => selectFolder(entry.id)
        const { rootProps, handleProps } = sortable.itemProps(
          entryKey(entry),
          clickFallback,
        )
        const isPinnedEntry = pinnedSet.has(entryKey(entry))
        // В non-compact sidebar drag только за .lib-icon (
        // libUnifiedDragStart:11851-11854: `if(!isCompact && !e.target.closest('.lib-icon'))return;`).
        // В compact — drag за всю строку.
        const rowHandle = sbCompact ? handleProps : {}
        const iconHandle = sbCompact ? {} : handleProps
        if (entry.type === 'playlist') {
          const pl = plById.get(entry.id)
          if (!pl) return null
          const isActive = mode === 'pl' && plId === pl.id
          // Бейдж «плейлист из площадки»: все треки одного источника.
          const plTracks = pl.trs.map((id) => tracksById.get(id)).filter((t): t is Track => !!t)
          const hasScTracks = plTracks.length > 0 && plTracks.every((t) => t._sc)
          const hasYmTracks = plTracks.length > 0 && plTracks.every((t) => t._ym)
          return (
            <div
              key={`pl_${pl.id}`}
              className={cn('lib-item', isActive && 'active')}
              id={`libPl_${pl.id}`}
              data-unified-type="playlist"
              data-unified-id={pl.id}
              data-plid={pl.id}
              data-pinned={isPinnedEntry ? '1' : undefined}
              onClick={() => selectPlaylist(pl.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                onContextEntry({ type: 'playlist', id: pl.id, x: e.clientX, y: e.clientY })
              }}
              {...rootProps}
              {...rowHandle}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  className="lib-icon pl-icon"
                  style={{ background: 'transparent' }}
                  {...iconHandle}
                >
                  {pl.cover ? (
                    <img
                      src={pl.cover}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 'inherit',
                      }}
                    />
                  ) : (
                    <VinylCover seed={pl.id} />
                  )}
                </div>
                {/* Бейдж площадки поверх обложки плейлиста (нижний-правый угол).
                    hasSc/hasYm взаимоисключающи (every-track), поэтому один бейдж. */}
                {(hasScTracks || hasYmTracks) && (
                  <span className="cov-badge" style={{ right: 2, bottom: 2 }}>
                    {hasScTracks ? <ScBadge size={14} cover /> : <YmBadge size={14} cover />}
                  </span>
                )}
                {isPinnedEntry && <span className="lib-pin-dot" />}
              </div>
              <div className="lib-item-info">
                <div className="lib-item-name">
                  {pl.name}
                </div>
                <div className="lib-item-sub">
                  {(() => {
                    const total = sumDurations(pl.trs.map((id) => tracksById.get(id)?.dur))
                    return tracksAndDuration(pl.trs.length, total)
                  })()}
                </div>
              </div>
              <button
                className="lib-item-play"
                onClick={stopAnd(() => playPlaylistFromStore(pl.id))}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
                </svg>
              </button>
            </div>
          )
        }
        if (entry.type === 'artist') {
          const a = artById.get(entry.id)
          if (!a) return null
          const { count: aCount, sec: aSec } = artistStats(a.name)
          return (
            <div
              key={`art_${a.id}`}
              className="lib-item lib-artist-item"
              data-unified-type="artist"
              data-unified-id={a.id}
              data-pinned={isPinnedEntry ? '1' : undefined}
              onClick={() => openArtist(a.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                onContextEntry({ type: 'artist', id: a.id, x: e.clientX, y: e.clientY })
              }}
              {...rootProps}
              {...rowHandle}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  className="lib-icon"
                  style={{ borderRadius: '50%', background: 'var(--card)' }}
                  {...iconHandle}
                >
                  {a.avatar ? (
                    <img
                      src={a.avatar}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text2)' }}>
                      {(a.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {isPinnedEntry && <span className="lib-pin-dot" />}
              </div>
              <div className="lib-item-info">
                <div className="lib-item-name">{a.name}</div>
                <div className="lib-item-sub">{tracksAndDuration(aCount, aSec)}</div>
              </div>
            </div>
          )
        }
        // folder
        const path = entry.id
        const isActive =
          mode === 'folder' && folderPath?.toLowerCase() === path.toLowerCase()
        const count = folderCounts[path] || 0
        return (
          <div
            key={`f_${path}`}
            className={cn('lib-item lib-folder-item', isActive && 'active')}
            id={folderSafeId(path)}
            data-unified-type="folder"
            data-unified-id={path}
            data-fpath={path}
            data-pinned={isPinnedEntry ? '1' : undefined}
            onClick={() => selectFolder(path)}
            onContextMenu={(e) => {
              e.preventDefault()
              onContextEntry({ type: 'folder', id: path, x: e.clientX, y: e.clientY })
            }}
            {...rootProps}
            {...rowHandle}
          >
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                className="lib-icon"
                style={{ background: 'rgba(var(--accent-rgb),.12)' }}
                {...iconHandle}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                >
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
              </div>
              {isPinnedEntry && <span className="lib-pin-dot" />}
            </div>
            <div className="lib-item-info">
              <div className="lib-item-name">{entry.name}</div>
              <div className="lib-item-sub">
                {(() => {
                  const lp = path.toLowerCase()
                  const dur = sumDurations(
                    tracks.filter((t) => t._folder?.toLowerCase() === lp).map((t) => t.dur),
                  )
                  return tracksAndDuration(count, dur)
                })()}
              </div>
            </div>
            <button
              className="lib-item-play"
              onClick={stopAnd(() => playFolderFromStore(path))}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
