import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavStore } from '@app/navigationStore'
import { usePopupOpenAnimation } from '@shared/hooks'
import { useT } from '@shared/i18n'
import type { Track } from '@entities/track'
import { toast, VinylCover } from '@shared/ui'
import { playFromSource, playShuffledFromSource, downloadPlaylistTracks, type PlaySource } from '@features/player'
import { exportPlaylistFile, folderScan, folderRemove } from '../api'
import { buildExportBundle, refreshScPlaylist, deleteUploadedTrack } from '../lib'
import {
  usePlaylistStore,
  useHistoryStore,
  useActivityStore,
  useDupsStore,
  useMergeStore,
  useLibStore,
  useFavStore,
  useUnifiedOrderStore,
  type Playlist,
  type LibMode,
  type TrackSortMode,
} from '../model'

export interface PlMenuProps {
  open: boolean
  onClose: () => void
  /** Anchor element (hero 3-dot button). Менеджер выбирает позицию справа-снизу от него. */
  anchorRef?: RefObject<HTMLElement | null>
  /** Точка клика для ПКМ-меню (примитивы! объект как cursorPos={x,y} вызовет
   *  бесконечный re-render у родителя через useLayoutEffect deps). */
  cursorX?: number | null
  cursorY?: number | null
  mode: LibMode
  heroName: string
  heroSub: string
  playlist: Playlist | null
  folderPath: string | null
  /** Колбэк после удаления pl/папки — родитель переключает mode на 'all'. */
  onReset?: () => void
  /** «Изменить плейлист» — включает inline-редактор в шапке (см. plEditStore). */
  onEdit?: (id: string) => void
  /** «Добавить треки» — открывает AddFromLibModal с этим plId. */
  onAddTracks?: (id: string) => void
}

/**
 * Меню «3 точки» в hero `#plMenu`.
 * Mode-aware: пункты меняются в зависимости от того, что выбрано.
 *
 * Фаза C: реализованы действия, не требующие плеера и продвинутой сортировки.
 * «Перемешать и запустить» + «Сортировка треков» отложены до фазы D+E.
 */
export const PlMenu = ({
  open,
  onClose,
  anchorRef,
  cursorX,
  cursorY,
  mode,
  heroName,
  heroSub,
  playlist,
  folderPath,
  onReset,
  onEdit,
  onAddTracks,
}: PlMenuProps) => {
  const t = useT()
  const deletePl = usePlaylistStore((s) => s.deletePl)
  const togglePin = useUnifiedOrderStore((s) => s.togglePin)
  const pinOrder = useUnifiedOrderStore((s) => s.order)
  // Режим «Найти дубли» активен для этого плейлиста → пункт становится «Закрыть».
  const dupsActive = useDupsStore((s) => s.active)
  const dupsPlId = useDupsStore((s) => s.plId)

  const menuRef = useRef<HTMLDivElement>(null)
  // Позиция: либо anchor-based (top + right), либо cursor-based (top + left).
  const [pos, setPos] = useState<
    | { kind: 'anchor'; top: number; right: number }
    | { kind: 'cursor'; top: number; left: number }
    | null
  >(null)
  // Cursor-mode: первый рендер — у сырого курсора (скрытый), затем меряем
  // реальную высоту и клампим. До замера держим меню hidden, чтобы не было
  // прыжка с overflow за экран (fallback-высота не годилась для длинных меню).
  const [cursorMeasured, setCursorMeasured] = useState(false)
  // Sub-страница сортировки.
  const [sortPage, setSortPage] = useState(false)
  // Сбрасываем sub-страницу при закрытии меню.
  useEffect(() => {
    if (!open) setSortPage(false)
  }, [open])

  // Плавная open-анимация (вместо ctxIn).
  usePopupOpenAnimation(menuRef, pos)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      setCursorMeasured(false)
      return
    }
    if (cursorX != null && cursorY != null) {
      // Первый проход: ставим у сырого курсора (скрыто), клампим в эффекте ниже
      // по реально измеренной высоте меню.
      setPos({ kind: 'cursor', top: cursorY, left: cursorX })
      setCursorMeasured(false)
      return
    }
    if (!anchorRef?.current) {
      setPos(null)
      return
    }
    const recalc = () => {
      const a = anchorRef.current
      if (!a) return
      const r = a.getBoundingClientRect()
      setPos({ kind: 'anchor', top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    recalc()
    window.addEventListener('resize', recalc)
    window.addEventListener('scroll', recalc, true)
    return () => {
      window.removeEventListener('resize', recalc)
      window.removeEventListener('scroll', recalc, true)
    }
  }, [open, anchorRef, cursorX, cursorY])

  // Cursor-mode: после первого (скрытого) рендера меряем реальные размеры меню
  // и клампим в пределах окна. Флаг cursorMeasured защищает от зацикливания и
  // делает меню видимым только после финального позиционирования.
  useLayoutEffect(() => {
    if (!pos || pos.kind !== 'cursor' || cursorMeasured) return
    const m = menuRef.current
    if (!m) return
    const mw = m.offsetWidth
    const mh = m.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = cursorX ?? pos.left
    let top = cursorY ?? pos.top
    if (left + mw > vw - 8) left = vw - mw - 8
    if (top + mh > vh - 8) top = vh - mh - 8
    if (left < 8) left = 8
    if (top < 8) top = 8
    setPos({ kind: 'cursor', top, left })
    setCursorMeasured(true)
  }, [pos, cursorMeasured, cursorX, cursorY])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef?.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null

  // ── Действия ─────────────────────────────────────────────────────

  const exportPl = async () => {
    if (!playlist) return
    onClose()
    // bundle включает метаданные треков плейлиста.
    const data = buildExportBundle(playlist)
    const safe = playlist.name.replace(/[\\/:*?"<>|]/g, '_')
    try {
      await exportPlaylistFile(data, `${safe}.bloomplaylist`)
    } catch (e) {
      console.warn('exportPlaylistFile failed', e)
    }
  }

  // Скачать треки плейлиста (только площадок SC/YM) в выбранную папку.
  const downloadPl = () => {
    if (!playlist) return
    onClose()
    const all = useLibStore.getState().tracks
    const byId = new Map(all.map((tr) => [tr.id, tr]))
    const tracks = playlist.trs
      .map((id) => byId.get(id))
      .filter((tr): tr is Track => !!tr)
    void downloadPlaylistTracks(playlist.name, tracks)
  }

  const removePl = () => {
    if (!playlist) return
    const pl = playlist
    onClose()
    // Удаляем сразу и показываем toast с «Отменить» (нативный confirm не работает
    // в окне без рамки). Сам плейлист легко восстановить — это запись со списком
    // id треков; сами треки в библиотеке не трогаются.
    const before = usePlaylistStore.getState().playlists
    const idx = before.findIndex((p) => p.id === pl.id)
    deletePl(pl.id)
    onReset?.()
    toast(t('lib.plmenu.playlistDeleted', { name: pl.name }), {
      label: t('common.undo'),
      fn: () => {
        const cur = usePlaylistStore.getState().playlists
        if (cur.some((p) => p.id === pl.id)) return // уже восстановлен/существует
        const next = [...cur]
        next.splice(idx < 0 ? next.length : Math.min(idx, next.length), 0, pl)
        usePlaylistStore.getState().replaceAll(next)
      },
    })
  }

  // Удалить плейлист ВМЕСТЕ с треками из библиотеки. Физически удаляем только
  // «свои» записи (загруженные файлы + сохранённые треки площадок SC/YM);
  // папочные / локальные не трогаем — ими управляет папка (вернутся при
  // пересканировании). deleteUploadedTrack сам чистит ссылки из плейлистов,
  // после чего удаляем сам плейлист.
  const removePlWithTracks = () => {
    if (!playlist) return
    const pl = playlist
    onClose()
    // Нативный window.confirm не показывается в окне без рамки (decorations:false),
    // поэтому подтверждаем через toast: удаление выполняется только по клику на
    // кнопку «Удалить»; если её проигнорировать, toast гаснет и ничего не удаляется.
    toast(t('lib.plmenu.confirmDeletePlWithTracks', { name: pl.name }), {
      label: t('common.delete'),
      fn: () => {
        const byId = new Map(useLibStore.getState().tracks.map((tr) => [tr.id, tr]))
        for (const id of pl.trs) {
          const tr = byId.get(id)
          if (tr && !tr._localPath && !tr._folder) void deleteUploadedTrack(id)
        }
        deletePl(pl.id)
        onReset?.()
      },
    })
  }

  const rescanFolder = () => {
    if (!folderPath) return
    onClose()
    folderScan(folderPath).catch((e) => console.warn('folderScan failed', e))
  }

  const removeFolder = () => {
    if (!folderPath) return
    onClose()
    if (!confirm(t('lib.plmenu.confirmUnlinkFolder', { name: heroName }))) return
    folderRemove(folderPath).catch((e) => console.warn('folderRemove failed', e))
    onReset?.()
  }

  const clearHistory = () => {
    onClose()
    if (!confirm(t('lib.plmenu.confirmClearHistory'))) return
    useHistoryStore.getState().clear()
    useActivityStore.getState().clear()
  }

  // ── Воспроизведение / открытие (для ПКМ-меню в sidebar) ──────────
  // Собирает список треков из контекста меню (pl/folder) и запускает.
  const getCtxTracks = (): { ids: string[]; source: PlaySource } => {
    const all = useLibStore.getState().tracks
    if (mode === 'pl' && playlist) {
      const byId = new Map(all.map((t) => [t.id, t]))
      const ids = playlist.trs.filter((id) => byId.has(id))
      return {
        ids,
        source: { kind: 'playlist', id: playlist.id, name: playlist.name, cover: playlist.cover ?? null },
      }
    }
    if (mode === 'folder' && folderPath) {
      const lp = folderPath.toLowerCase()
      const ids = all.filter((t) => t._folder?.toLowerCase() === lp).map((t) => t.id)
      return { ids, source: { kind: 'folder', path: folderPath, name: heroName } }
    }
    if (mode === 'fav') {
      const favs = useFavStore.getState().favs
      const ids = all
        .filter((t) => favs.has(t.id))
        .sort((a, b) => (favs.get(b.id) ?? 0) - (favs.get(a.id) ?? 0))
        .map((t) => t.id)
      return { ids, source: { kind: 'lib-fav' } }
    }
    if (mode === 'all') {
      return { ids: all.map((t) => t.id), source: { kind: 'lib-all' } }
    }
    return { ids: [], source: null }
  }
  const playCtx = () => {
    const { ids, source } = getCtxTracks()
    onClose()
    if (!ids.length) return
    playFromSource(ids, source)
  }
  const shufflePlayCtx = () => {
    const { ids, source } = getCtxTracks()
    onClose()
    if (!ids.length) return
    playShuffledFromSource(ids, source)
  }
  // ── Header иконка ────────────────────────────────────────────────
  const headerIcon = (() => {
    if (mode === 'pl' && playlist?.cover) {
      return <img src={playlist.cover} alt="" />
    }
    if (mode === 'pl' && playlist) {
      return <VinylCover seed={playlist.id} />
    }
    if (mode === 'fav') {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth={1.5}>
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
      )
    }
    if (mode === 'history') {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    }
    if (mode === 'folder') {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      )
    }
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    )
  })()

  // ── Опции по режиму ─────────────────────────────────────────────
  // Cursor-mode = ПКМ из sidebar (по плейлисту/папке).
  const isCursorMode = cursorX != null && cursorY != null
  // Логические группы пунктов: пустые отбрасываются, между непустыми
  // автоматически вставляется разделитель (см. склейку в `items` ниже).
  const groups: ReactNode[][] = []

  // 1. Воспроизведение: ПКМ из sidebar — «Воспроизвести», иначе —
  //    «Перемешать и запустить» (для всех режимов с треками, кроме history).
  if (isCursorMode && (mode === 'pl' || mode === 'folder')) {
    groups.push([
      <Item key="play" icon={<PlayIcon />} label={t('player.aria.play')} onClick={playCtx} />,
    ])
  } else if (!isCursorMode && mode !== 'history') {
    groups.push([
      <Item
        key="shuffle-play"
        icon={<ShuffleIcon />}
        label={t('lib.plmenu.shuffleStart')}
        onClick={shufflePlayCtx}
      />,
    ])
  }

  if (mode === 'pl' && playlist) {
    // 2. Содержимое плейлиста: добавить треки / изменить.
    groups.push([
      <Item
        key="add"
        icon={<PlusIcon />}
        label={t('lib.plmenu.addTracks')}
        onClick={() => {
          onClose()
          onAddTracks?.(playlist.id)
        }}
      />,
      <Item
        key="edit"
        icon={<EditIcon />}
        label={t('lib.plmenu.editPlaylist')}
        onClick={() => {
          onClose()
          onEdit?.(playlist.id)
        }}
      />,
    ])

    // 3. Сортировка — отдельной секцией. Относится к открытому tracklist'у,
    //    поэтому скрыта для ПКМ из sidebar.
    if (!isCursorMode) {
      groups.push([
        <Item
          key="sort"
          icon={<SortLinesIcon />}
          label={t('lib.plmenu.sort')}
          onClick={() => setSortPage(true)}
          chevron
        />,
      ])
    }

    // 4. Инструменты: объединить / дубли / обновить с площадки.
    const tools: ReactNode[] = [
      <Item
        key="merge"
        icon={<MergeIcon />}
        label={t('lib.plmenu.mergeWith')}
        onClick={() => {
          onClose()
          useMergeStore.getState().openMerge(playlist.id)
        }}
      />,
      dupsActive && dupsPlId === playlist.id ? (
        <Item
          key="dups"
          icon={<DupsIcon />}
          label={t('common.close')}
          active
          onClick={() => {
            onClose()
            useDupsStore.getState().exit()
          }}
        />
      ) : (
        <Item
          key="dups"
          icon={<DupsIcon />}
          label={t('lib.plmenu.findDups')}
          onClick={() => {
            onClose()
            // Инлайн-режим: открываем плейлист в библиотеке и включаем показ дублей
            // прямо в треклисте (вместо модалки).
            useNavStore.getState().goNav('lib')
            useLibStore.getState().selectPlaylist(playlist.id)
            useDupsStore.getState().enter(playlist.id)
          }}
        />
      ),
    ]
    if (playlist.scSource || playlist.scLikes) {
      tools.push(
        <Item
          key="refresh-sc"
          icon={<RefreshIcon />}
          label={t('lib.plmenu.refreshTracks')}
          onClick={() => {
            onClose()
            void refreshScPlaylist(playlist.id)
          }}
        />,
      )
    }
    groups.push(tools)

    // 5. Экспорт / скачивание.
    groups.push([
      <Item key="export" icon={<ExportIcon />} label={t('lib.plmenu.exportPlaylist')} onClick={exportPl} />,
      <Item key="download" icon={<DownloadIcon />} label={t('lib.plmenu.downloadPlaylist')} onClick={downloadPl} />,
    ])
  } else if (mode === 'folder' && folderPath) {
    const content: ReactNode[] = [
      <Item key="rescan" icon={<RefreshIcon />} label={t('lib.plmenu.rescan')} onClick={rescanFolder} />,
    ]
    if (!isCursorMode) {
      content.push(
        <Item
          key="sort"
          icon={<SortLinesIcon />}
          label={t('lib.plmenu.sort')}
          onClick={() => setSortPage(true)}
          chevron
        />,
      )
    }
    groups.push(content)
  } else if (mode === 'history') {
    groups.push([
      <Item key="clear" danger icon={<TrashIcon />} label={t('lib.plmenu.clearHistory')} onClick={clearHistory} />,
    ])
  } else if (!isCursorMode) {
    // Системные виды (all/fav) — только сортировка.
    groups.push([
      <Item
        key="sort"
        icon={<SortLinesIcon />}
        label={t('lib.plmenu.sort')}
        onClick={() => setSortPage(true)}
        chevron
      />,
    ])
  }

  // 6. Закрепление (только ПКМ из sidebar по плейлисту/папке).
  if (isCursorMode && (mode === 'pl' || mode === 'folder')) {
    const pinType = mode === 'folder' ? 'folder' : 'playlist'
    const pinId = mode === 'folder' ? folderPath : playlist?.id
    const pinned = !!pinOrder.find((o) => o.type === pinType && o.id === pinId)?.pinned
    groups.push([
      <Item
        key="pin"
        icon={<PinIcon />}
        label={pinned ? t('lib.sidebar.unpin') : t('lib.sidebar.pin')}
        onClick={() => {
          if (pinId) togglePin(pinType, pinId)
          onClose()
        }}
      />,
    ])
  }

  // 7. Удаление — всегда последней группой.
  if (mode === 'pl' && playlist) {
    groups.push([
      <Item key="delete" danger icon={<TrashIcon />} label={t('lib.plmenu.deletePlaylist')} onClick={removePl} />,
      <Item
        key="delete-tracks"
        danger
        icon={<TrashIcon />}
        label={t('lib.plmenu.deletePlaylistWithTracks')}
        onClick={removePlWithTracks}
      />,
    ])
  } else if (mode === 'folder' && folderPath) {
    groups.push([
      <Item key="delete" danger icon={<TrashIcon />} label={t('lib.plmenu.deleteFolder')} onClick={removeFolder} />,
    ])
  }

  // Склеиваем непустые группы, вставляя разделитель между соседними.
  const items: ReactNode[] = []
  groups
    .filter((g) => g.length > 0)
    .forEach((g, gi) => {
      if (gi > 0) items.push(<div key={`sep-${gi}`} className="cx-sep" />)
      items.push(...g)
    })

  return createPortal(
    <div
      ref={menuRef}
      id="plMenu"
      className="open"
      style={
        pos.kind === 'anchor'
          ? { top: pos.top, right: pos.right, left: 'auto', position: 'fixed' }
          : {
              top: pos.top,
              left: pos.left,
              right: 'auto',
              position: 'fixed',
              // Прячем меню, пока не измерили высоту и не клампнули позицию.
              visibility: cursorMeasured ? 'visible' : 'hidden',
            }
      }
    >
      <div
        id="plMenuHeader"
        className={
          mode === 'fav'
            ? 'sys-fav'
            : mode === 'history'
              ? 'sys-hist'
              : mode === 'all'
                ? 'sys-all'
                : ''
        }
        style={
          mode === 'pl' && playlist?.cover
            ? ({ '--cx-cover': `url("${playlist.cover}")` } as CSSProperties)
            : undefined
        }
      >
        <div
          id="plMenuHeaderCov"
          style={
            mode === 'pl' && playlist && !playlist.cover
              ? { background: 'transparent', boxShadow: 'none' }
              : undefined
          }
        >
          {headerIcon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div id="plMenuHeaderName">{heroName}</div>
          <div id="plMenuHeaderSub">{heroSub}</div>
        </div>
      </div>
      {sortPage ? (
        <SortPage onBack={() => setSortPage(false)} />
      ) : (
        items.length > 0 && <div id="plMenuPage1">{items}</div>
      )}
    </div>,
    document.body,
  )
}

const Item = ({
  icon,
  label,
  onClick,
  danger,
  chevron,
  active,
}: {
  icon: ReactNode
  label: ReactNode
  onClick: () => void
  danger?: boolean
  chevron?: boolean
  /** Подсветка акцентом (активный режим/выбор). */
  active?: boolean
}) => (
  <div className={`ci${danger ? ' red' : ''}${active ? ' ci-active' : ''}`} onClick={onClick}>
    <span className="ci-icon">{icon}</span>
    <span style={{ flex: 1 }}>{label}</span>
    {chevron && (
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginLeft: 'auto', opacity: 0.4, flexShrink: 0 }}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    )}
  </div>
)

// ── Sort sub-page ────────

const SortPage = ({ onBack }: { onBack: () => void }) => {
  const t = useT()
  const sortMode = useLibStore((s) => s.sortMode)
  const sortDir = useLibStore((s) => s.sortDir)
  const setSort = useLibStore((s) => s.setSort)

  const SORT_ITEMS: { mode: TrackSortMode; label: string; icon: ReactNode }[] = [
    { mode: 'name', label: t('lib.sort.name'), icon: <SortLinesIcon /> },
    { mode: 'artist', label: t('lib.sort.artist'), icon: <PersonIcon /> },
    { mode: 'dur', label: t('lib.sort.dur'), icon: <ClockIcon /> },
    { mode: 'date', label: t('lib.sort.date'), icon: <CalendarIcon /> },
    { mode: 'plays', label: t('lib.sort.plays'), icon: <PlayIcon /> },
    { mode: 'album', label: t('lib.sort.album'), icon: <DiscIcon /> },
  ]

  return (
    <div id="plMenuPage2" className="active" style={{ display: 'block' }}>
      {SORT_ITEMS.map((opt) => {
        const active = sortMode === opt.mode
        const arrow = active ? (sortDir === 'asc' ? '↑' : '↓') : null
        return (
          <div
            key={opt.mode}
            className={`ci${active ? ' sort-active' : ''}`}
            onClick={() => setSort(opt.mode)}
          >
            <span className="ci-icon" style={{ color: active ? 'var(--accent)' : undefined }}>
              {opt.icon}
            </span>
            <span style={{ flex: 1 }}>{opt.label}</span>
            {arrow && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>
                {arrow}
              </span>
            )}
          </div>
        )
      })}
      <div className="cx-sep" />
      <div
        className={`ci${sortMode === 'default' ? ' sort-active' : ''}`}
        onClick={() => setSort('default')}
      >
        <span className="ci-icon" style={{ color: sortMode === 'default' ? 'var(--accent)' : undefined }}>
          <RepeatIcon />
        </span>
        <span style={{ flex: 1 }}>{t('lib.sort.default')}</span>
      </div>
      <div className="pl-menu-back" onClick={onBack}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>{' '}
        {t('common.back')}
      </div>
    </div>
  )
}

// ── SVG-иконки для sort ────────────────────────────────────────────────

const SortLinesIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="15" y2="12" />
    <line x1="3" y1="18" x2="9" y2="18" />
  </svg>
)
const PersonIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)
const ClockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)
const CalendarIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)
const PlayIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
  </svg>
)
const DiscIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
)
const RepeatIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 014-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 01-4 4H3" />
  </svg>
)

// ── Иконки опций ────────────────────────────────────────────────────

const EditIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const ExportIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const DownloadIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const TrashIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
)

const MergeIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
    <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
  </svg>
)

const DupsIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)

const RefreshIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
  </svg>
)

const PlusIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const ShuffleIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
    <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
    <path d="m18 2 4 4-4 4" strokeLinejoin="round" />
    <path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2" />
    <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8" />
    <path d="m18 14 4 4-4 4" strokeLinejoin="round" />
  </svg>
)

const PinIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1v3.76z" />
  </svg>
)
