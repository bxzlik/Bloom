import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@shared/lib/cn'
import { toast, PlaylistCover, EmptyCover } from '@shared/ui'
import { useT, useLocale } from '@shared/i18n'
import { useSortable } from '@shared/lib/useSortable'
import { artistSourceFromId } from '@entities/artist'
import { useUiPrefsStore } from '@features/settings'
import { Ico, type IconName } from '@shared/ui/icons/solar'
import {
  useLibStore,
  usePlaylistStore,
  usePlEditStore,
  useFavStore,
  useHistoryStore,
  useFollowStore,
  useUnifiedOrderStore,
  usePlAutoStore,
  type LibFilter,
  type UnifiedItem,
} from '../model'
import {
  tracksAndDuration,
  sumDurations,
  historyTotals,
  useLibSidebarSort,
  buildOrderedUnifiedEntries,
  type LibSidebarSort,
  type UnifiedEntry,
} from '../lib'
import { LibAddModal } from './LibAddModal'
import { LibSortMenu } from './LibSortMenu'
import { PlMenu } from './PlMenu'
import { PlaylistOfflineTag } from './PlaylistOfflineTag'

// Иконка циклической кнопки-фильтра по текущему состоянию.
// Экспортируются — grid-обзор (LibGridOverview) переиспользует ту же кнопку.
export const FILTER_ICON: Record<LibFilter, IconName> = {
  all: 'widget',
  playlists: 'queue',
  folders: 'folder',
  artists: 'user',
}
// Соответствие значения фильтра типу записи в объединённом списке.
export const FILTER_TYPE: Record<Exclude<LibFilter, 'all'>, 'playlist' | 'folder' | 'artist'> = {
  playlists: 'playlist',
  folders: 'folder',
  artists: 'artist',
}

/**
 * Левая колонка библиотеки `.lib-sidebar`.
 * SVG-иконки и onclick семантика скопированы без изменений.
 *
 * Счётчики: «Все треки» = `tracks.length` из стора, «Любимые» = фильтр по
 * fav-полю (пока всегда 0 — лайки в фазе D), «История» = длина playHistory
 * из localStorage.
 */
export const LibSidebar = ({ className }: { className?: string } = {}) => {
  const t = useT()
  useLocale()
  const mode = useLibStore((s) => s.mode)
  const sbView = useUiPrefsStore((s) => s.sbView)
  const selectBuiltin = useLibStore((s) => s.selectBuiltin)
  const filter = useLibStore((s) => s.filter)
  const cycleLibFilter = useLibStore((s) => s.cycleLibFilter)
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

  // Суммарная длительность для системных пунктов.
  const allDurSec = sumDurations(allTracks.map((t) => t.dur))
  const favDurSec = sumDurations(favTracks.map((t) => t.dur))

  // История: сколько треков и сколько наслушано. Раньше подписи не было —
  // счётчик упирался в лимит 200 и рос от любого прослушивания, так что не
  // сообщал ничего. Теперь считается по журналу и осмыслен.
  const histEntries = useHistoryStore((s) => s.entries)
  const hist = useMemo(() => {
    const byId = new Map(allTracks.map((t) => [t.id, t]))
    return historyTotals(histEntries, byId)
  }, [histEntries, allTracks])

  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [sortMode, setSortMode] = useLibSidebarSort()
  // Авто-обновление плейлистов: кнопка тулбара открывает боковую панель,
  // подсветка (`sort-active`) — расписание включено.
  const openAutoDrawer = usePlAutoStore((s) => s.openDrawer)
  const autoEnabled = usePlAutoStore((s) => s.enabled)

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
    <div
      className={cn(
        'lib-sidebar',
        sbView === 'text' && 'lib-sb-compact',
        sbView === 'covers' && 'lib-sb-covers',
        className,
      )}
    >
      {/* ── Системные ─────────────────────────────────────────── */}
      <div className="lib-block" style={{ paddingBottom: 0 }}>
        {/* Значения работают только в компактном виде: полный и «только обложки»
            перебивают этот padding своими правилами в queue.css / library.css —
            там зазор считается от ручки (5px и --cv-pad). Низ 7px + margin-bottom
            1px последнего .lib-item = 8px = верх. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 4px 7px' }}>
          <div
            className={cn(
              'lib-item lib-item-sys',
              mode === 'all' && 'active',
            )}
            id="libItemAll"
            onClick={() => selectBuiltin('all')}
          >
            <div className="lib-icon off-icon">
              <Ico name="note" width={22} height={22} />
            </div>
            <div className="lib-item-info">
              <div className="lib-item-name">{t('lib.allTracks')}</div>
              <div className="lib-item-sub" id="libAllSub">
                {tracksAndDuration(totalTracks, allDurSec)}
              </div>
            </div>
          </div>

          <div
            className={cn(
              'lib-item lib-item-sys',
              mode === 'fav' && 'active',
            )}
            id="libItemFav"
            onClick={() => selectBuiltin('fav')}
          >
            <div className="lib-icon fav-icon">
              <Ico name="heart" variant="bold" width={20} height={20} />
            </div>
            <div className="lib-item-info">
              <div className="lib-item-name">{t('lib.liked')}</div>
              <div className="lib-item-sub" id="libFavSub">
                {tracksAndDuration(favCount, favDurSec)}
              </div>
            </div>
          </div>

          <div
            className={cn(
              'lib-item lib-item-sys',
              mode === 'history' && 'active',
            )}
            id="libItemHistory"
            onClick={() => selectBuiltin('history')}
          >
            <div className="lib-icon">
              <Ico name="clock" width={20} height={20} />
            </div>
            <div className="lib-item-info">
              <div className="lib-item-name">{t('lib.history')}</div>
              <div className="lib-item-sub">
                {tracksAndDuration(hist.tracks, hist.sec)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Тулбар библиотеки — отдельная карточка-блок с тремя кнопками
          (фильтр / сортировка / добавить), растянутыми поровну по ширине. ── */}
      <div className="lib-block lib-toolbar-block">
        <div className="lib-toolbar">
          <button
            id="libFilterBtn"
            className={cn(filter !== 'all' && 'sort-active')}
            aria-label={t(`lib.filter.${filter}`)}
            onClick={cycleLibFilter}
          >
            <Ico name={FILTER_ICON[filter]} width={16} height={16} />
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
            <Ico name="sort" width={16} height={16} />
          </button>
          <button
            id="libAutoBtn"
            className={cn(autoEnabled && 'sort-active')}
            aria-label={t('lib.plauto.open')}
            onClick={(e) => {
              e.stopPropagation()
              openAutoDrawer()
            }}
          >
            <Ico name="refresh" width={16} height={16} />
          </button>
          <button
            id="libAddBtn"
            className={cn(addMenuOpen && 'open')}
            onClick={(e) => {
              e.stopPropagation()
              setAddMenuOpen((v) => !v)
            }}
          >
            <Ico name="add" width={16} height={16} />
          </button>
        </div>
      </div>

      {/* ── Список папок/плейлистов/артистов — отдельная карточка ──────── */}
      <div
        className="lib-block lib-block-combined"
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            // Как в системном блоке выше: значения для компактного вида, полный
            // и covers перебивают их своими правилами. Низ 7px + margin 1px = верх.
            padding: '8px 4px 7px',
            scrollbarWidth: 'none',
          }}
        >
          <UnifiedList sortMode={sortMode} onContextEntry={routeCtx} />
        </div>
      </div>

      <LibAddModal
        open={addMenuOpen}
        onClose={() => setAddMenuOpen(false)}
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
    // Источник восстанавливаем из префикса id — иначе глобальный делегат (App)
    // дефолтит на soundcloud и getArtist падает на чужом провайдере.
    el.dataset.artistProvider = artistSourceFromId(a.id)
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
          <Ico name="play" width={11} height={11} />
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
          <Ico name="pin" width={11} height={11} />
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
          <Ico name="unfollow" width={11} height={11} />
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
  const sbView = useUiPrefsStore((s) => s.sbView)
  const filter = useLibStore((s) => s.filter)
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

  // Фильтр состава: показываем только выбранный тип (или всё). Полный `entries`
  // не трогаем — на нём строится порядок; фильтруем только видимую проекцию.
  const visibleEntries =
    filter === 'all' ? entries : entries.filter((e) => e.type === FILTER_TYPE[filter])

  // Drag-reorder активен ТОЛЬКО в дефолтной сортировке и без активного фильтра —
  // иначе onReorder получил бы неполный список ключей и затёр бы скрытые записи.
  // ID для sortable = "type:id", чтобы не конфликтовали playlist/folder.
  const entryKey = (e: Entry): string => `${e.type}:${e.id}`
  const sortable = useSortable<Entry>({
    items: visibleEntries,
    getId: entryKey,
    enabled: sortMode === 'default' && filter === 'all',
    // Pinned-партиционирование: закреплённые (ранг 0) реордерятся только среди
    // закреплённых, обычные (ранг 1) — среди обычных. Граница не пересекается.
    getGroupRank: (key) => (pinnedSet.has(key) ? 0 : 1),
    // В виде «только обложки» за курсором должна ехать сама обложка, без плашки.
    // Ghost — клон строки, смонтированный в body, то есть ВНЕ
    // `.lib-sidebar.lib-sb-covers`: ни одно правило этого вида на него не
    // действует. Из-за этого у клона проступала скрытая в сайдбаре подпись,
    // обложка падала к базовым 50px (в covers она var(--cv-ico)), а паддинг
    // брался базовый. Переносим геометрию с исходной строки руками и снимаем
    // карточную подложку, которую useSortable ставит инлайном.
    ghostAdjust:
      sbView === 'covers'
        ? (ghost, srcRow) => {
            ghost.style.background = 'transparent'
            // Радиус и клип нужны только карточной подложке, а её тут нет. Без
            // этого дуга правого верхнего угла (var(--radius)=14px) срезала
            // точку закрепа: ghost в этом виде всего 64×64, точка висит в 3px
            // за краем обложки и уходит за дугу примерно наполовину.
            ghost.style.borderRadius = '0'
            ghost.style.overflow = 'visible'
            ghost.style.padding = getComputedStyle(srcRow).padding
            const srcIco = srcRow.querySelector<HTMLElement>('.lib-icon')
            const dstIco = ghost.querySelector<HTMLElement>('.lib-icon')
            if (srcIco && dstIco) {
              const r = srcIco.getBoundingClientRect()
              dstIco.style.width = `${r.width}px`
              dstIco.style.height = `${r.height}px`
            }
            const info = ghost.querySelector<HTMLElement>('.lib-item-info')
            if (info) info.style.display = 'none'
          }
        : undefined,
    onReorder: (newKeys) => {
      const next: UnifiedItem[] = newKeys.map((k) => {
        const i = k.indexOf(':')
        return { type: k.slice(0, i) as UnifiedItem['type'], id: k.slice(i + 1) }
      })
      setOrder(next)
    },
  })

  if (visibleEntries.length === 0) {
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
          {filter === 'all' ? t('lib.sidebar.empty') : t(`lib.filter.empty.${filter}`)}
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
    // Источник восстанавливаем из префикса id — иначе глобальный делегат (App)
    // дефолтит на soundcloud и getArtist падает на чужом провайдере.
    el.dataset.artistProvider = artistSourceFromId(a.id)
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
      {visibleEntries.map((entry) => {
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
        // В обычном виде (full) drag только за .lib-icon; в компактных видах
        // (text — без обложки; covers — строка = обложка) drag за всю строку.
        const rowDrag = sbView !== 'full'
        const rowHandle = rowDrag ? handleProps : {}
        const iconHandle = rowDrag ? {} : handleProps
        if (entry.type === 'playlist') {
          const pl = plById.get(entry.id)
          if (!pl) return null
          const isActive = mode === 'pl' && plId === pl.id
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
                    <PlaylistCover covers={pl.trs.map((id) => tracksById.get(id)?.cover)} />
                  )}
                </div>
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
                  <PlaylistOfflineTag trackIds={pl.trs} />
                </div>
              </div>
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
                    <EmptyCover />
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
              <div className="lib-icon" style={{ background: 'var(--folder-tint)' }} {...iconHandle}>
                <Ico name="folder" width={20} height={20} style={{ color: 'var(--accent)' }} />
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
          </div>
        )
      })}
    </div>
  )
}
