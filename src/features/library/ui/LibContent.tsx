import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useUiPrefsStore } from '@features/settings'
import { useT, useLocale, t as tFn } from '@shared/i18n'
import { PlaylistCover } from '@shared/ui'
import { useLibStore, usePlaylistStore, useFavStore, usePlEditStore } from '../model'
import type { LibMode, Playlist } from '../model'
import type { Track } from '@entities/track'
import {
  tracksAndDuration,
  recordsLabel,
  sumDurations,
  usePlayHistoryCount,
  handleFiles,
  getCurrentView,
  compressCover,
} from '../lib'
import { playFromSource, playShuffledFromSource } from '@features/player'
import { LibTracklist } from './LibTracklist'
import { LibGridOverview } from './LibGridOverview'
import { PlMenu } from './PlMenu'
import { AddFromLibModal } from './AddFromLibModal'
import { SelBar } from './SelBar'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Правая часть библиотеки `.lib-content`.
 * Hero отображает иконку + имя + sub-line + кнопки действий.
 */
export const LibContent = () => {
  const t = useT()
  useLocale()
  const mode = useLibStore((s) => s.mode)
  const folderPath = useLibStore((s) => s.folderPath)
  const plId = useLibStore((s) => s.plId)
  const allTracks = useLibStore((s) => s.tracks)
  const totalTracks = allTracks.length
  const folderTracks = folderPath
    ? allTracks.filter((t) => t._folder === folderPath)
    : []
  const folderTracksCount = folderTracks.length
  const historyCount = usePlayHistoryCount()
  const activePlaylist = usePlaylistStore((s) =>
    plId ? s.playlists.find((p) => p.id === plId) : undefined,
  )
  const renamePl = usePlaylistStore((s) => s.renamePl)
  const setPlDesc = usePlaylistStore((s) => s.setPlDesc)
  const setPlCover = usePlaylistStore((s) => s.setPlCover)
  const deletePl = usePlaylistStore((s) => s.deletePl)
  const editingId = usePlEditStore((s) => s.editingId)
  const isNewEdit = usePlEditStore((s) => s.isNew)
  const startEdit = usePlEditStore((s) => s.startEdit)
  const stopEdit = usePlEditStore((s) => s.stop)
  const editing = mode === 'pl' && !!activePlaylist && editingId === activePlaylist.id
  const searchQuery = useLibStore((s) => s.searchQuery)
  const setSearchQuery = useLibStore((s) => s.setSearchQuery)
  const selectBuiltin = useLibStore((s) => s.selectBuiltin)
  const backToGrid = useLibStore((s) => s.backToGrid)

  // Grid-вид библиотеки: на «домашней» сетке (gridHome) показываем обзор-сетку
  // вместо hero+трек-лист; провалившись в раздел — показываем трек-лист + «назад».
  const libView = useUiPrefsStore((s) => s.libView)
  const gridHome = useLibStore((s) => s.gridHome)
  const overview = libView === 'grid' && gridHome

  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // plMenu state (только для mode='pl')
  const plMenuBtnRef = useRef<HTMLButtonElement>(null)
  const [plMenuOpen, setPlMenuOpen] = useState(false)
  // ПКМ по шапке: координаты курсора для позиционирования меню (null = меню
  // открыто от кнопки «…» в anchor-режиме).
  const [plMenuCursor, setPlMenuCursor] = useState<{ x: number; y: number } | null>(null)
  const [addToPlId, setAddToPlId] = useState<string | null>(null)

  // Inline-редактирование плейлиста (вместо модалки).
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCover, setEditCover] = useState<string | undefined>(undefined)
  const [coverBusy, setCoverBusy] = useState(false)
  const editNameRef = useRef<HTMLInputElement>(null)

  // При входе в режим подставляем значения редактируемого плейлиста синхронно
  // в рендере (ref-гвард), а не в эффекте: иначе на один кадр шапка мигала бы
  // обложкой из прошлой сессии редактирования — editCover ещё держит старое
  // значение до срабатывания эффекта. Читаем из стора напрямую.
  const seededId = useRef<string | null>(null)
  if (editingId !== seededId.current) {
    seededId.current = editingId
    if (editingId) {
      const pl = usePlaylistStore.getState().playlists.find((p) => p.id === editingId)
      setEditName(pl?.name ?? '')
      setEditDesc(pl?.desc ?? '')
      setEditCover(pl?.cover)
      setCoverBusy(false)
    }
  }

  // Фокус на имя при входе в режим.
  useEffect(() => {
    if (!editingId) return
    const tm = setTimeout(() => {
      editNameRef.current?.focus()
      editNameRef.current?.select()
    }, 40)
    return () => clearTimeout(tm)
  }, [editingId])

  // Уход со страницы редактируемого плейлиста — выходим из режима. Только что
  // созданный плейлист (isNew), который не сохранили, удаляем как брошенный.
  useEffect(() => {
    if (editingId && (mode !== 'pl' || plId !== editingId)) {
      if (isNewEdit) deletePl(editingId)
      stopEdit()
    }
  }, [mode, plId, editingId, isNewEdit, stopEdit, deletePl])

  const onCoverChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCoverBusy(true)
    try {
      setEditCover(await compressCover(file))
    } catch {
      // ignore
    } finally {
      setCoverBusy(false)
    }
  }

  const clearCover = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setEditCover(undefined)
  }

  const saveEdit = () => {
    if (!activePlaylist) return
    const name = editName.trim()
    if (!name) return
    renamePl(activePlaylist.id, name)
    setPlDesc(activePlaylist.id, editDesc.trim() || undefined)
    setPlCover(activePlaylist.id, editCover)
    stopEdit()
  }

  // Отмена: свежесозданный плейлист (isNew) удаляем целиком и уходим в «Все
  // треки» — отмена создания должна убрать его, даже если в нём уже есть трек,
  // добавленный при создании «из трека».
  const cancelEdit = () => {
    if (isNewEdit && activePlaylist) {
      deletePl(activePlaylist.id)
      selectBuiltin('all')
    }
    stopEdit()
  }

  // При смене раздела закрываем поиск и чистим запрос (иначе висел бы «невидимый»
  // фильтр — строка закрыта, а список отфильтрован).
  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery('')
  }, [mode, plId, folderPath, setSearchQuery])

  // Запрос выставили извне при закрытой строке (клик по альбому локального
  // трека → фильтр по названию) — раскрываем строку, чтобы фильтр был виден и
  // его можно было снять.
  useEffect(() => {
    if (searchQuery && !searchOpen) setSearchOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // При открытии — фокус на input.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchQuery('')
      setSearchOpen(false)
    } else {
      setSearchOpen(true)
    }
  }

  const favs = useFavStore((s) => s.favs)
  // Резолвед-кол-во (видимые любимые), а не favs.size — иначе hero «Любимые»
  // показывал бы «висячие» лайки удалённых треков. Согласовано с видом и сайдбаром.
  const favCount = allTracks.filter((t) => favs.has(t.id)).length

  const { heroName, heroSub, heroIconClass, heroCover, HeroIcon } = heroFor(mode, {
    totalTracks,
    favCount,
    historyCount,
    folderPath,
    folderTracksCount,
    playlist: activePlaylist,
    allTracks,
    favs,
    folderTracks,
  })

  // В режиме редактирования шапка (блюр-фон) должна сразу отражать выбранную
  // в редакторе обложку, не дожидаясь сохранения.
  const headCover = editing ? editCover : heroCover

  return (
    <div className="lib-content">
      {overview ? (
        <LibGridOverview />
      ) : (
      <>
      <div
        className={`lib-content-head${headCover ? ' has-cover' : ''}`}
        style={headCover ? ({ '--hero-cover': `url("${headCover}")` } as CSSProperties) : undefined}
        onContextMenu={(e) => {
          // ПКМ по шапке открывает то же меню, что и кнопка «…», но у курсора.
          // В режиме редактирования — отдаём нативное меню (для полей ввода).
          if (editing) return
          e.preventDefault()
          setPlMenuCursor({ x: e.clientX, y: e.clientY })
          setPlMenuOpen(true)
        }}
      >
        <div className="lib-content-hero">
          {editing ? (
            <div className="lib-hero-icon lib-hero-cov-edit" id="libHeroIcon">
              <label className="pl-cov-zone">
                {editCover ? (
                  <img className="pl-cov-img" src={editCover} alt="" />
                ) : (
                  <div className="pl-cov-hint">
                    <Ico name="gallery" width={22} height={22} />
                    <span>{t('lib.newpl.addCover')}</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={onCoverChange}
                  disabled={coverBusy}
                />
              </label>
              {editCover && (
                <button
                  type="button"
                  className="pl-cov-rmv"
                  onClick={clearCover}
                  aria-label={t('lib.newpl.removeCover')}
                  style={{ display: 'flex' }}
                >
                  <Ico name="close" width={8} height={8} style={{ display: 'block', flexShrink: 0, color: 'white' }} />
                </button>
              )}
            </div>
          ) : (
            <div
              className={`lib-hero-icon ${heroIconClass}`}
              id="libHeroIcon"
              style={{
                position: 'relative',
                cursor: 'default',
                ...(heroCover
                  ? {
                      background: `center / cover no-repeat url(${heroCover})`,
                    }
                  : mode === 'history'
                    ? { background: 'linear-gradient(135deg,#3d300f,#231a06)' }
                    : {}),
              }}
            >
              {!heroCover && <HeroIcon />}
            </div>
          )}
          {editing ? (
            <div className="lib-hero-edit" id="libHeroNameWrap">
              <input
                ref={editNameRef}
                type="text"
                className="lib-hero-name-inp"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('lib.newpl.namePlaceholder')}
                maxLength={120}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  else if (e.key === 'Escape') cancelEdit()
                }}
              />
              <input
                type="text"
                className="lib-hero-desc-inp"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder={t('lib.newpl.descPlaceholder')}
                maxLength={300}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  else if (e.key === 'Escape') cancelEdit()
                }}
              />
            </div>
          ) : !searchOpen ? (
            <div style={{ flex: 1, minWidth: 0 }} id="libHeroNameWrap">
              <div className="lib-hero-name" id="libHeroName">
                {heroName}
              </div>
              {activePlaylist?.desc ? (
                <div className="lib-hero-desc" id="libHeroDesc">
                  {activePlaylist.desc}
                </div>
              ) : (
                <div className="lib-hero-desc" id="libHeroDesc" style={{ display: 'none' }} />
              )}
              <div className="lib-hero-sub" id="libHeroSub">
                {heroSub}
              </div>
            </div>
          ) : null}
          {/* Inline-поиск `libInlineSearch` */}
          {!editing && searchOpen && (
            <div
              id="libInlineSearch"
              style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'center' }}
            >
              <div className="lib-isp-wrap">
                <Ico name="search" width={13} height={13} style={{ flexShrink: 0, opacity: 0.4 }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  id="libInlineSearchInp"
                  className="lib-isp-inp"
                  placeholder={t('lib.searchInPlaylist')}
                  autoComplete="off"
                  spellCheck={false}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchQuery('')
                      setSearchOpen(false)
                    }
                  }}
                />
              </div>
            </div>
          )}
          <div className="lib-hero-btns">
            {editing ? (
              <>
                <button
                  key="edit-cancel"
                  type="button"
                  className="btn-icon"
                  aria-label={t('common.cancel')}
                  onClick={cancelEdit}
                >
                  <Ico name="close" width={14} height={14} />
                </button>
                <button
                  key="edit-save"
                  type="button"
                  className="btn-icon is-save"
                  aria-label={t('common.save')}
                  onClick={saveEdit}
                  disabled={!editName.trim()}
                >
                  <Ico name="check" variant="bold" width={15} height={15} />
                </button>
              </>
            ) : (
            <>
            {/* «Назад к сетке» — только в grid-виде, когда провалились в раздел. */}
            {libView === 'grid' && (
              <button
                key="back"
                className="btn-icon"
                id="libBackToGrid"
                onClick={backToGrid}
              >
                <Ico name="arrowLeft" width={14} height={14} />
              </button>
            )}
            <button
              key="play-all"
              className="btn-play-all"
              onClick={() => {
                const view = getCurrentView()
                if (!view.tracks.length) return
                playFromSource(view.tracks.map((t) => t.id), view.source)
              }}
            >
              <Ico name="play" variant="bold" width={12} height={12} />
              {t('lib.playAll')}
            </button>
            <button
              key="shuffle"
              className="btn-icon"
              onClick={() => {
                const view = getCurrentView()
                if (!view.tracks.length) return
                playShuffledFromSource(view.tracks.map((t) => t.id), view.source)
              }}
            >
              <Ico name="shuffle" width={13} height={13} />
            </button>
            <label
              key="upload"
              id="libUploadBtn"
              className="btn-icon"
              style={{
                display: mode === 'all' ? 'flex' : 'none',
                cursor: 'pointer',
              }}
            >
              <Ico name="add" width={14} height={14} />
              <input
                type="file"
                accept="audio/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files)
                  e.target.value = '' // сбрасываем чтобы можно было выбрать тот же файл снова
                }}
              />
            </label>
            <button
              key="search"
              className="btn-icon"
              id="libInlineSearchBtn"
              onClick={toggleSearch}
              style={
                searchOpen
                  ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                  : undefined
              }
            >
              {searchOpen ? (
                <Ico name="close" width={14} height={14} />
              ) : (
                <Ico name="search" width={14} height={14} />
              )}
            </button>
            {mode === 'pl' && activePlaylist && (
              <button
                key="edit-pl"
                className="btn-icon"
                id="plEditBtn"
                aria-label={t('lib.plmenu.editPlaylist')}
                onClick={() => startEdit(activePlaylist.id)}
              >
                <Ico name="edit" width={14} height={14} />
              </button>
            )}
            <button
              key="menu"
              ref={plMenuBtnRef}
              className="btn-icon"
              id="plMenuBtn"
              onClick={(e) => {
                e.stopPropagation()
                setPlMenuCursor(null)
                setPlMenuOpen((v) => !v)
              }}
            >
              <Ico name="kebab" width={14} height={14} />
            </button>
            </>
            )}
          </div>
        </div>
      </div>
      <LibTracklist />
      {/* SelBar — снизу `insertBefore(bar, list.nextSibling)`. */}
      <SelBar />
      </>
      )}

      <PlMenu
        open={plMenuOpen}
        onClose={() => {
          setPlMenuOpen(false)
          setPlMenuCursor(null)
        }}
        anchorRef={plMenuBtnRef}
        cursorX={plMenuCursor?.x ?? null}
        cursorY={plMenuCursor?.y ?? null}
        forceFullMenu
        mode={mode}
        heroName={heroName}
        heroSub={heroSub}
        playlist={activePlaylist ?? null}
        folderPath={folderPath}
        onReset={() => selectBuiltin('all')}
        onEdit={(id) => startEdit(id)}
        onAddTracks={(id) => setAddToPlId(id)}
      />
      <AddFromLibModal
        open={addToPlId !== null}
        onClose={() => setAddToPlId(null)}
        playlistId={addToPlId}
      />
    </div>
  )
}

// ── Hero конфигурация для каждого режима ──────────────────────────────

interface HeroCounts {
  totalTracks: number
  favCount: number
  historyCount: number
  folderPath: string | null
  folderTracksCount: number
  playlist?: Playlist
  allTracks: Track[]
  favs: Map<string, number>
  folderTracks: Track[]
}

const folderName = (path: string): string => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

interface HeroResult {
  heroName: string
  heroSub: string
  heroIconClass: string
  HeroIcon: () => React.JSX.Element
  /** Если есть — рендерится как background обложки вместо HeroIcon. */
  heroCover?: string
}

const heroFor = (mode: LibMode, c: HeroCounts): HeroResult => {
  switch (mode) {
    case 'fav': {
      const dur = sumDurations(
        c.allTracks.filter((t) => c.favs.has(t.id)).map((t) => t.dur),
      )
      return {
        heroName: tFn('lib.liked'),
        heroSub: tracksAndDuration(c.favCount, dur),
        heroIconClass: 'fav-icon',
        HeroIcon: HeartHeroIcon,
      }
    }
    case 'history':
      return {
        heroName: tFn('lib.history'),
        heroSub: recordsLabel(c.historyCount),
        heroIconClass: '',
        HeroIcon: HistoryHeroIcon,
      }
    case 'folder': {
      const dur = sumDurations(c.folderTracks.map((t) => t.dur))
      return {
        heroName: c.folderPath ? folderName(c.folderPath) : tFn('lib.folder'),
        heroSub: tracksAndDuration(c.folderTracksCount, dur),
        heroIconClass: 'off-icon',
        HeroIcon: NoteHeroIcon,
      }
    }
    case 'pl': {
      const pl = c.playlist
      const byId = new Map(c.allTracks.map((t) => [t.id, t]))
      const dur = pl ? sumDurations(pl.trs.map((id) => byId.get(id)?.dur)) : 0
      return {
        heroName: pl?.name ?? tFn('lib.playlist'),
        heroSub: tracksAndDuration(pl?.trs.length ?? 0, dur),
        // Без обложки рисуем мозаику из обложек треков (≥4) либо винил-фолбэк;
        // цвет/вид детерминирован по id плейлиста.
        heroIconClass: pl?.cover ? 'off-icon' : '',
        HeroIcon: pl
          ? () => <PlaylistCover covers={pl.trs.map((id) => byId.get(id)?.cover)} seed={pl.id} />
          : NoteHeroIcon,
        heroCover: pl?.cover,
      }
    }
    case 'all':
    default: {
      const dur = sumDurations(c.allTracks.map((t) => t.dur))
      return {
        heroName: tFn('lib.allTracks'),
        heroSub: tracksAndDuration(c.totalTracks, dur),
        heroIconClass: 'off-icon',
        HeroIcon: NoteHeroIcon,
      }
    }
  }
}

const NoteHeroIcon = () => (
  <Ico name="note" width={44} height={44} style={{ color: 'rgba(255,255,255,0.7)' }} />
)

const HeartHeroIcon = () => (
  <Ico name="heart" variant="bold" width={44} height={44} style={{ color: 'white' }} />
)

const HistoryHeroIcon = () => (
  <Ico name="clock" width={44} height={44} style={{ color: '#ffb400' }} />
)
