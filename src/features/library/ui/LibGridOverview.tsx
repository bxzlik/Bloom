import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useSortable } from '@shared/lib/useSortable'
import { ScBadge, YmBadge, type Track } from '@entities/track'
import {
  useLibStore,
  usePlaylistStore,
  useFavStore,
  useFollowStore,
  useUnifiedOrderStore,
  type UnifiedItem,
} from '../model'
import {
  tracksAndDuration,
  recordsLabel,
  sumDurations,
  fmtTotalDur,
  usePlayHistoryCount,
  useLibSidebarSort,
  buildOrderedUnifiedEntries,
} from '../lib'
import { LibAddMenu } from './LibAddMenu'
import { LibSortMenu } from './LibSortMenu'
import { NewPlaylistModal } from './NewPlaylistModal'
import { PlMenu } from './PlMenu'
import { AddFromLibModal } from './AddFromLibModal'
import { ArtistCtxMenu } from './LibSidebar'

/**
 * Grid-обзор библиотеки.
 * Альтернатива списочному сайдбару: системные карточки (Все/Любимые/История) +
 * сетка карточек плейлистов/папок/артистов. Клик по карточке → проваливание в
 * раздел (`selectBuiltin`/`selectPlaylist`/`selectFolder`), сетка скрывается,
 * показывается трек-лист + кнопка «назад» (LibContent). Виден только когда
 * uiPrefs.libView==='grid' && gridHome (рендерит LibContent).
 *
 * Drag-reorder карточек — через `useSortable({mode:'grid'})` (2D), пишет общий
 * порядок (useUnifiedOrderStore), только при сортировке «по умолчанию».
 */

/** Подпись карточки «N тр. · 1ч 2м». */
const cardSub = (count: number, sec: number): string =>
  `${count} тр.${sec > 0 ? ' · ' + fmtTotalDur(sec) : ''}`

const NoteSvg = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
)
const PlayOverlay = () => (
  <div className="hpc-play-overlay">
    <div className="hpc-play-btn">
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1" strokeLinejoin="round" style={{ marginLeft: 2 }}>
        <path d="M7.5 4.5C7.5 3.4 8.7 2.7 9.6 3.3l11 7.5c.9.5.9 1.9 0 2.4l-11 7.5C8.7 21.3 7.5 20.6 7.5 19.5V4.5z" />
      </svg>
    </div>
  </div>
)

export const LibGridOverview = () => {
  const tracks = useLibStore((s) => s.tracks)
  const folders = useLibStore((s) => s.folders)
  const selectBuiltin = useLibStore((s) => s.selectBuiltin)
  const selectPlaylist = useLibStore((s) => s.selectPlaylist)
  const selectFolder = useLibStore((s) => s.selectFolder)
  const favs = useFavStore((s) => s.favs)
  const playlists = usePlaylistStore((s) => s.playlists)
  const followedArtists = useFollowStore((s) => s.artists)
  const order = useUnifiedOrderStore((s) => s.order)
  const applyOrder = useUnifiedOrderStore((s) => s.applyOrder)
  const setOrder = useUnifiedOrderStore((s) => s.setOrder)
  const historyCount = usePlayHistoryCount()
  const [sortMode, setSortMode] = useLibSidebarSort()

  // Меню (sort/add) + модалки — те же, что в сайдбаре.
  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [newPlOpen, setNewPlOpen] = useState(false)
  const [editPlId, setEditPlId] = useState<string | null>(null)
  const [addToPlId, setAddToPlId] = useState<string | null>(null)

  // ПКМ карточек: плейлист/папка → PlMenu, артист → ArtistCtxMenu.
  const [ctxEntry, setCtxEntry] = useState<
    | { type: 'playlist'; id: string; x: number; y: number }
    | { type: 'folder'; id: string; x: number; y: number }
    | null
  >(null)
  const [artistCtx, setArtistCtx] = useState<{ id: string; x: number; y: number } | null>(null)

  // Системные карточки.
  const allCnt = tracks.length
  const allSec = sumDurations(tracks.map((t) => t.dur))
  const favTracks = tracks.filter((t) => favs.has(t.id))
  const favCnt = favTracks.length
  const favSec = sumDurations(favTracks.map((t) => t.dur))

  const { entries, pinnedSet } = buildOrderedUnifiedEntries({
    playlists: playlists.map((p) => ({ id: p.id, name: p.name })),
    folders: folders.map((path) => ({ id: path, name: folderLeaf(path) })),
    artists: followedArtists.map((a) => ({ id: a.id, name: a.name })),
    order,
    applyOrder,
    sortMode,
  })

  // Drag-reorder карточек (2D-сетка) — только при сортировке «по умолчанию»,
  // пишет общий порядок (как и список-сайдбар). Пин-партиционирование: пины
  // реордерятся среди пинов.
  const dragEnabled = sortMode === 'default'
  const sortable = useSortable<{ type: string; id: string }>({
    items: entries,
    getId: (e) => `${e.type}:${e.id}`,
    enabled: dragEnabled,
    mode: 'grid',
    getGroupRank: (key) => (pinnedSet.has(key) ? 0 : 1),
    // Ghost живёт в body (вне #libGridOverview) → grid-CSS `.hpc-cover{width:100%}`
    // к нему не применяется, обложка схлопнулась бы в дефолт 140px. Доводим её под
    // реальный размер ячейки.
    ghostAdjust: (ghost, srcRow) => {
      const cover = srcRow.querySelector<HTMLElement>('.hpc-cover')
      const gCover = ghost.querySelector<HTMLElement>('.hpc-cover')
      if (cover && gCover) {
        const cr = cover.getBoundingClientRect()
        gCover.style.width = `${cr.width}px`
        gCover.style.height = `${cr.height}px`
      }
    },
    onReorder: (keys) =>
      setOrder(
        keys.map((k) => {
          const i = k.indexOf(':')
          return { type: k.slice(0, i) as UnifiedItem['type'], id: k.slice(i + 1) }
        }),
      ),
  })

  const plById = new Map(playlists.map((p) => [p.id, p]))
  const artById = new Map(followedArtists.map((a) => [a.id, a]))
  const tracksById = new Map(tracks.map((t) => [t.id, t]))

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

  // Хелперы для PlMenu (header плейлиста/папки).
  const ctxPlaylist = ctxEntry?.type === 'playlist' ? plById.get(ctxEntry.id) ?? null : null
  const ctxFolderPath = ctxEntry?.type === 'folder' ? ctxEntry.id : null
  const ctxHeroName =
    ctxEntry?.type === 'playlist' ? ctxPlaylist?.name ?? '' : ctxFolderPath ? folderLeaf(ctxFolderPath) : ''
  const ctxHeroSub = (() => {
    if (ctxEntry?.type === 'playlist' && ctxPlaylist) {
      const dur = sumDurations(ctxPlaylist.trs.map((id) => tracksById.get(id)?.dur))
      return tracksAndDuration(ctxPlaylist.trs.length, dur)
    }
    if (ctxFolderPath) {
      const lp = ctxFolderPath.toLowerCase()
      const list = tracks.filter((t) => t._folder?.toLowerCase() === lp)
      return tracksAndDuration(list.length, sumDurations(list.map((t) => t.dur)))
    }
    return ''
  })()

  const onCardCtx = (e: ReactMouseEvent, entry: { type: string; id: string }) => {
    e.preventDefault()
    if (entry.type === 'artist') {
      setArtistCtx({ id: entry.id, x: e.clientX, y: e.clientY })
    } else if (entry.type === 'playlist' || entry.type === 'folder') {
      setCtxEntry({ type: entry.type, id: entry.id, x: e.clientX, y: e.clientY })
    }
  }

  return (
    <>
    <div id="libGridOverview" className="active" ref={sortable.containerRef}>
      {/* Системные карточки */}
      <div className="lib-grid-sys-row">
        <div className="lib-grid-sys-card lib-grid-sys-card-all" onClick={() => selectBuiltin('all')}>
          <div className="lib-grid-sys-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          </div>
          <div className="lib-grid-sys-card-info">
            <div className="lib-grid-sys-card-name">Все треки</div>
            <div className="lib-grid-sys-card-sub">{tracksAndDuration(allCnt, allSec)}</div>
          </div>
        </div>
        <div className="lib-grid-sys-card lib-grid-sys-card-fav" onClick={() => selectBuiltin('fav')}>
          <div className="lib-grid-sys-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.5}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
          </div>
          <div className="lib-grid-sys-card-info">
            <div className="lib-grid-sys-card-name">Любимые</div>
            <div className="lib-grid-sys-card-sub">{tracksAndDuration(favCnt, favSec)}</div>
          </div>
        </div>
        <div className="lib-grid-sys-card lib-grid-sys-card-hist" onClick={() => selectBuiltin('history')}>
          <div className="lib-grid-sys-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <div className="lib-grid-sys-card-info">
            <div className="lib-grid-sys-card-name">История</div>
            <div className="lib-grid-sys-card-sub">{recordsLabel(historyCount)}</div>
          </div>
        </div>
      </div>

      {/* Заголовок «Моя библиотека» + сорт/добавить */}
      {entries.length > 0 && (
        <div className="lib-grid-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Моя библиотека
          <div style={{ display: 'flex', gap: 2 }}>
            <button ref={sortBtnRef} className="ib" onClick={(e) => { e.stopPropagation(); setSortMenuOpen((v) => !v) }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="9" y2="18" /></svg>
            </button>
            <button ref={addBtnRef} className="ib" onClick={(e) => { e.stopPropagation(); setAddMenuOpen((v) => !v) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Карточки */}
      {entries.length === 0 ? (
        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--text2)', fontSize: 13 }}>
          Библиотека пуста
        </div>
      ) : (
        entries.map((entry) => {
          const key = `${entry.type}:${entry.id}`
          const pinned = pinnedSet.has(key)
          const select =
            entry.type === 'playlist'
              ? () => selectPlaylist(entry.id)
              : entry.type === 'folder'
                ? () => selectFolder(entry.id)
                : () => openArtist(entry.id)
          // Drag включён → биндинги sortable (клик через fallback); иначе обычный onClick.
          const bind = dragEnabled ? sortable.itemProps(key, select) : null
          const cardProps = bind ? { ...bind.rootProps, ...bind.handleProps } : { onClick: select }
          if (entry.type === 'playlist') {
            const pl = plById.get(entry.id)
            if (!pl) return null
            const plTracks = pl.trs.map((id) => tracksById.get(id)).filter((t): t is Track => !!t)
            const hasSc = plTracks.length > 0 && plTracks.every((t) => t._sc)
            const hasYm = plTracks.length > 0 && plTracks.every((t) => t._ym)
            const sec = sumDurations(pl.trs.map((id) => tracksById.get(id)?.dur))
            return (
              <div key={`pl_${pl.id}`} className="home-pl-card" {...cardProps} onContextMenu={(e) => onCardCtx(e, entry)}>
                <div style={{ position: 'relative' }}>
                  <div className="hpc-cover">
                    {pl.cover ? <img src={pl.cover} loading="lazy" alt="" /> : <NoteSvg />}
                    <PlayOverlay />
                    {/* Бейдж площадки поверх обложки (прячется при наведении —
                        PlayOverlay перекрывает). hasSc/hasYm взаимоисключающи. */}
                    {(hasSc || hasYm) && (
                      <span className="cov-badge">
                        {hasSc ? <ScBadge size={24} cover /> : <YmBadge size={24} cover />}
                      </span>
                    )}
                  </div>
                  {pinned && <span className="lib-pin-dot" />}
                </div>
                <div className="hpc-name">{pl.name}</div>
                <div className="hpc-sub">{cardSub(pl.trs.length, sec)}</div>
              </div>
            )
          }
          if (entry.type === 'folder') {
            const path = entry.id
            const lp = path.toLowerCase()
            const fTrs = tracks.filter((t) => t._folder?.toLowerCase() === lp)
            const sec = sumDurations(fTrs.map((t) => t.dur))
            return (
              <div key={`f_${path}`} className="home-pl-card" {...cardProps} onContextMenu={(e) => onCardCtx(e, entry)}>
                <div style={{ position: 'relative' }}>
                  <div className="hpc-cover" style={{ background: 'rgba(var(--accent-rgb),.1)' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                    <PlayOverlay />
                  </div>
                  {pinned && <span className="lib-pin-dot" />}
                </div>
                <div className="hpc-name">{entry.name}</div>
                <div className="hpc-sub">{cardSub(fTrs.length, sec)}</div>
              </div>
            )
          }
          // artist
          const a = artById.get(entry.id)
          if (!a) return null
          const ln = (a.name || '').toLowerCase()
          const aTrs = tracks.filter((t) => (t.artist || '').toLowerCase() === ln)
          const aSec = sumDurations(aTrs.map((t) => t.dur))
          return (
            <div key={`art_${a.id}`} className="home-pl-card" {...cardProps} onContextMenu={(e) => onCardCtx(e, entry)}>
              <div style={{ position: 'relative' }}>
                <div className="hpc-cover" style={{ borderRadius: '50%', overflow: 'hidden' }}>
                  {a.avatar ? (
                    <img src={a.avatar} loading="lazy" alt="" />
                  ) : (
                    <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text2)' }}>{(a.name || '?').charAt(0).toUpperCase()}</span>
                  )}
                  <PlayOverlay />
                </div>
                {pinned && <span className="lib-pin-dot" />}
              </div>
              <div className="hpc-name">{a.name}</div>
              <div className="hpc-sub">{cardSub(aTrs.length, aSec)}</div>
            </div>
          )
        })
      )}
    </div>

      {/* Меню/модалки (вне контейнера sortable, чтобы не мешать DOM-reorder карточек) */}
      <LibSortMenu open={sortMenuOpen} onClose={() => setSortMenuOpen(false)} anchorRef={sortBtnRef} value={sortMode} onChange={setSortMode} />
      <LibAddMenu open={addMenuOpen} onClose={() => setAddMenuOpen(false)} anchorRef={addBtnRef} onCreatePlaylist={() => setNewPlOpen(true)} />
      <NewPlaylistModal open={newPlOpen} onClose={() => setNewPlOpen(false)} onCreated={(id) => selectPlaylist(id)} />

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
        onReset={() => {}}
        onEdit={(id) => setEditPlId(id)}
        onAddTracks={(id) => setAddToPlId(id)}
      />
      <NewPlaylistModal open={editPlId !== null} onClose={() => setEditPlId(null)} editPlaylistId={editPlId} />
      <AddFromLibModal open={addToPlId !== null} onClose={() => setAddToPlId(null)} playlistId={addToPlId} />
      <ArtistCtxMenu ctx={artistCtx} onClose={() => setArtistCtx(null)} />
    </>
  )
}

const folderLeaf = (path: string): string => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}
