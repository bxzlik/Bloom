import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useSortable } from '@shared/lib/useSortable'
import { useT, useLocale, t as tFn } from '@shared/i18n'
import { ScBadge, YmBadge, type Track } from '@entities/track'
import { artistSourceFromId } from '@entities/artist'
import { PlaylistCover } from '@shared/ui'
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
  fmtTotalDur,
  usePlayHistoryCount,
  useLibSidebarSort,
  buildOrderedUnifiedEntries,
} from '../lib'
import { LibAddMenu } from './LibAddMenu'
import { LibSortMenu } from './LibSortMenu'
import { PlMenu } from './PlMenu'
import { AddFromLibModal } from './AddFromLibModal'
import { ArtistCtxMenu } from './LibSidebar'
import { Ico } from '@shared/ui/icons/solar'

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
  `${tFn('lib.grid.tracks', { n: count })}${sec > 0 ? ' · ' + fmtTotalDur(sec) : ''}`

const PlayOverlay = () => (
  <div className="hpc-play-overlay">
    <div className="hpc-play-btn">
      <Ico name="play" width="100%" height="100%" style={{ marginLeft: 2, color: 'var(--accent)' }} />
    </div>
  </div>
)

export const LibGridOverview = () => {
  const t = useT()
  useLocale() // ре-рендер при смене языка (cardSub/счётчики читают локаль нереактивно)
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
  const startEdit = usePlEditStore((s) => s.startEdit)
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
    // Источник восстанавливаем из префикса id — иначе глобальный делегат (App)
    // дефолтит на soundcloud и getArtist падает на чужом провайдере.
    el.dataset.artistProvider = artistSourceFromId(a.id)
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
            <Ico name="note" width={20} height={20} style={{ color: 'rgba(255,255,255,0.9)' }} />
          </div>
          <div className="lib-grid-sys-card-info">
            <div className="lib-grid-sys-card-name">{t('lib.allTracks')}</div>
            <div className="lib-grid-sys-card-sub">{tracksAndDuration(allCnt, allSec)}</div>
          </div>
        </div>
        <div className="lib-grid-sys-card lib-grid-sys-card-fav" onClick={() => selectBuiltin('fav')}>
          <div className="lib-grid-sys-card-icon">
            <Ico name="heart" variant="bold" width={20} height={20} style={{ color: 'rgba(255,255,255,0.9)' }} />
          </div>
          <div className="lib-grid-sys-card-info">
            <div className="lib-grid-sys-card-name">{t('lib.liked')}</div>
            <div className="lib-grid-sys-card-sub">{tracksAndDuration(favCnt, favSec)}</div>
          </div>
        </div>
        <div className="lib-grid-sys-card lib-grid-sys-card-hist" onClick={() => selectBuiltin('history')}>
          <div className="lib-grid-sys-card-icon">
            <Ico name="clock" width={20} height={20} style={{ color: 'rgba(255,255,255,0.9)' }} />
          </div>
          <div className="lib-grid-sys-card-info">
            <div className="lib-grid-sys-card-name">{t('lib.history')}</div>
            <div className="lib-grid-sys-card-sub">{recordsLabel(historyCount)}</div>
          </div>
        </div>
      </div>

      {/* Заголовок «Моя библиотека» + сорт/добавить */}
      {entries.length > 0 && (
        <div className="lib-grid-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {t('lib.myLibrary')}
          <div style={{ display: 'flex', gap: 2 }}>
            <button ref={sortBtnRef} className="ib" onClick={(e) => { e.stopPropagation(); setSortMenuOpen((v) => !v) }}>
              <Ico name="sort" width={13} height={13} />
            </button>
            <button ref={addBtnRef} className="ib" onClick={(e) => { e.stopPropagation(); setAddMenuOpen((v) => !v) }}>
              <Ico name="add" width={14} height={14} />
            </button>
          </div>
        </div>
      )}

      {/* Карточки */}
      {entries.length === 0 ? (
        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--text2)', fontSize: 13 }}>
          {t('lib.libraryEmpty')}
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
                  <div className="hpc-cover" style={pl.cover ? undefined : { background: 'transparent' }}>
                    {pl.cover ? <img src={pl.cover} loading="lazy" alt="" /> : <PlaylistCover covers={pl.trs.map((id) => tracksById.get(id)?.cover)} seed={pl.id} />}
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
                    <Ico name="folder" width={32} height={32} style={{ color: 'var(--accent)' }} />
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
      <LibAddMenu open={addMenuOpen} onClose={() => setAddMenuOpen(false)} anchorRef={addBtnRef} />

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
        onEdit={(id) => {
          selectPlaylist(id)
          startEdit(id)
        }}
        onAddTracks={(id) => setAddToPlId(id)}
      />
      <AddFromLibModal open={addToPlId !== null} onClose={() => setAddToPlId(null)} playlistId={addToPlId} />
      <ArtistCtxMenu ctx={artistCtx} onClose={() => setArtistCtx(null)} />
    </>
  )
}

const folderLeaf = (path: string): string => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}
