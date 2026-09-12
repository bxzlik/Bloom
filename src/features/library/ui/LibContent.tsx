import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useUiPrefsStore } from '@features/settings'
import { useT, useLocale, t as tFn } from '@shared/i18n'
import { HoverMarquee, PathLine, PlaylistCover } from '@shared/ui'
import {
  useLibStore,
  usePlaylistStore,
  useFavStore,
  useHistoryStore,
  usePlEditStore,
  useSelectionStore,
  plCreatedAt,
} from '../model'
import type { LibMode, Playlist, PlSourceRef } from '../model'
import type { Track } from '@entities/track'
import {
  tracksAndDuration,
  sumDurations,
  historyTotals,
  importTracks,
  getCurrentView,
  compressCover,
} from '../lib'
import {
  playFromSource,
  playShuffledFromSource,
  addTracksToQueue,
  playTracksNext,
  togglePlay,
  useSourcePlayback,
} from '@features/player'
import { LibTracklist } from './LibTracklist'
import { LibScrollbar } from './LibScrollbar'
import { LibGridOverview } from './LibGridOverview'
import { PlSourcesEditor } from './PlSourcesEditor'
import { PlMenu } from './PlMenu'
import { PlaylistOfflineTag } from './PlaylistOfflineTag'
import { CreatedMeta } from './DateMeta'
import { SelActions } from './SelActions'
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
  const activePlaylist = usePlaylistStore((s) =>
    plId ? s.playlists.find((p) => p.id === plId) : undefined,
  )
  const renamePl = usePlaylistStore((s) => s.renamePl)
  const setPlDesc = usePlaylistStore((s) => s.setPlDesc)
  const setPlCover = usePlaylistStore((s) => s.setPlCover)
  const setPlSources = usePlaylistStore((s) => s.setPlSources)
  const deletePl = usePlaylistStore((s) => s.deletePl)
  const editingId = usePlEditStore((s) => s.editingId)
  const isNewEdit = usePlEditStore((s) => s.isNew)
  const startEdit = usePlEditStore((s) => s.startEdit)
  const stopEdit = usePlEditStore((s) => s.stop)
  const editing = mode === 'pl' && !!activePlaylist && editingId === activePlaylist.id

  // Выход из редактора: держим PlSourcesEditor смонтированным ещё ~180мс с
  // классом is-closing (fade-out), и только потом монтируем трек-лист (fade-in).
  const [editorClosing, setEditorClosing] = useState(false)
  const prevEditingRef = useRef(editing)
  useEffect(() => {
    const was = prevEditingRef.current
    prevEditingRef.current = editing
    if (was && !editing) {
      setEditorClosing(true)
      const tm = setTimeout(() => setEditorClosing(false), 180)
      return () => clearTimeout(tm)
    }
    if (editing) setEditorClosing(false)
  }, [editing])
  const searchQuery = useLibStore((s) => s.searchQuery)
  const setSearchQuery = useLibStore((s) => s.setSearchQuery)
  const selectBuiltin = useLibStore((s) => s.selectBuiltin)
  const backToGrid = useLibStore((s) => s.backToGrid)

  // Grid-вид библиотеки: на «домашней» сетке (gridHome) показываем обзор-сетку
  // вместо hero+трек-лист; провалившись в раздел — показываем трек-лист + «назад».
  const libView = useUiPrefsStore((s) => s.libView)
  const gridHome = useLibStore((s) => s.gridHome)
  const overview = libView === 'grid' && gridHome

  // Раскладка ряда действий: справа от названия (исторический вид) или под ним,
  // внутри текстовой колонки («Настройки → Страницы → Библиотека»).
  const heroBtnsBelow = useUiPrefsStore((s) => s.libHeroBtns) === 'below'

  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Режим редактирования треков: ряд действий шапки подменяется bulk-кнопками
  // (SelActions). Включается кнопкой-квадратом, выключается ✕ / Esc.
  const selMode = useSelectionStore((s) => s.selMode)
  const setSticky = useSelectionStore((s) => s.setSticky)

  // plMenu state (только для mode='pl')
  const plMenuBtnRef = useRef<HTMLButtonElement>(null)
  const [plMenuOpen, setPlMenuOpen] = useState(false)
  // ПКМ по шапке: координаты курсора для позиционирования меню (null = меню
  // открыто от кнопки «…» в anchor-режиме).
  const [plMenuCursor, setPlMenuCursor] = useState<{ x: number; y: number } | null>(null)

  // Редактирование плейлиста: шапка + большой редактор на месте трек-листа.
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCover, setEditCover] = useState<string | undefined>(undefined)
  const [editSources, setEditSources] = useState<PlSourceRef[]>([])
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
      setEditSources(pl?.sources ?? [])
      setCoverBusy(false)
    }
  }

  // Фокус на имя при входе в режим.
  useEffect(() => {
    if (!editingId) return
    const tm = setTimeout(() => {
      const el = editNameRef.current
      if (!el) return
      el.focus()
      // Курсор в конец, а не выделение всего: поле выглядит как обычный текст
      // шапки, и синяя плашка выделения ломала бы этот вид.
      el.setSelectionRange(el.value.length, el.value.length)
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
    setPlSources(activePlaylist.id, editSources)
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

  // Сводка истории для подписи в шапке — считается только когда раздел открыт.
  const histEntries = useHistoryStore((s) => s.entries)
  const hist = useMemo(() => {
    if (mode !== 'history') return { tracks: 0, sec: 0 }
    const byId = new Map(allTracks.map((t) => [t.id, t]))
    return historyTotals(histEntries, byId)
  }, [mode, histEntries, allTracks])

  const { heroName, heroSub, heroIconClass, heroCover, HeroIcon } = heroFor(mode, {
    totalTracks,
    favCount,
    folderPath,
    folderTracksCount,
    playlist: activePlaylist,
    allTracks,
    favs,
    folderTracks,
    hist,
  })

  /**
   * Открытый поиск: капсула той же высоты, что и группы иконок — встаёт на место
   * левой группы, а не подменяет собой название (как было раньше).
   */
  const searchCapsule = (
    <div key="grp-list" className="lib-isp-wrap" id="libInlineSearch">
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
      <button
        type="button"
        className="lib-isp-clr"
        id="libInlineSearchBtn"
        aria-label={t('common.clear')}
        onClick={toggleSearch}
      >
        <Ico name="close" width={12} height={12} />
      </button>
    </div>
  )

  // Очередь набрана ЭТИМ видом — «Играть все» становится паузой (как в шапке
  // списка на телефоне). Ключ считаем из mode/plId/folderPath, а не из
  // getCurrentView(): тот перебирает и фильтрует все треки, в рендере ему не
  // место, а источник целиком определяется этими тремя полями.
  const viewKey =
    mode === 'pl'
      ? plId
        ? `playlist:${plId}`
        : null
      : mode === 'folder'
        ? folderPath
          ? `folder:${folderPath}`
          : null
        : `lib-${mode}`
  // Наложенный inline-фильтр источник не меняет (тот же `lib-all`), но набор
  // треков — меняет: с ним кнопка обязана играть отфильтрованное, а не встать
  // паузой на том, что уже играет.
  const { mine: viewIsCur, playing: viewPlaying } = useSourcePlayback(
    searchQuery ? null : viewKey,
  )

  /**
   * Ряд действий шапки: «Играть все» + капсулы иконок (либо bulk-режим SelActions,
   * либо кнопки сохранения редактора). Рендерится в одном из двух мест —
   * справа от названия или под ним (`heroBtnsBelow`), поэтому собран отдельно.
   */
  const heroBtns = (
    <div className={`lib-hero-btns${editing || editorClosing ? ' is-anim' : ''}`}>
      {editing ? (
        <div key="edit-actions" className="lib-btn-group">
          <button
            type="button"
            className="btn-icon"
            aria-label={t('common.cancel')}
            onClick={cancelEdit}
          >
            <Ico name="close" width={14} height={14} />
          </button>
          <button
            type="button"
            className="btn-icon is-save"
            aria-label={t('common.save')}
            onClick={saveEdit}
            disabled={!editName.trim()}
          >
            <Ico name="check" variant="bold" width={15} height={15} />
          </button>
        </div>
      ) : selMode ? (
        <>
          {/* Кнопки поиска в bulk-ряду нет, но уже наложенный фильтр прятать
              нельзя — иначе список отфильтрован «невидимо». Держим строку. */}
          {searchOpen && searchCapsule}
          <SelActions />
        </>
      ) : (
        <>
          {/* «Назад к сетке» — только в grid-виде, когда провалились в раздел. */}
          {libView === 'grid' && (
            <div key="back" className="lib-btn-group">
              <button className="btn-icon" id="libBackToGrid" onClick={backToGrid}>
                <Ico name="arrowLeft" width={14} height={14} />
              </button>
            </div>
          )}
          {/* Пока очередь набрана этим видом — кнопка пауза/плей по нему, а не
              перезапуск с первого трека: иначе клик терял бы то, что играет. */}
          <button
            key="play-all"
            className="btn-play-all"
            onClick={() => {
              if (viewIsCur) {
                togglePlay()
                return
              }
              const view = getCurrentView()
              if (!view.tracks.length) return
              playFromSource(view.tracks.map((t) => t.id), view.source)
            }}
          >
            <Ico name={viewPlaying ? 'pause' : 'play'} width={16} height={16} />
            {viewPlaying ? t('common.pause') : t('lib.playAll')}
          </button>
          {/* Иконки собраны в капсулы — как в шапке артиста/плейлиста в поиске
              (.sp-am-btn-group): работа со списком слева, воспроизведение/меню справа.
              Открытый поиск подменяет левую капсулу строкой ввода той же высоты —
              название и подпись при этом остаются на месте. */}
          {searchOpen ? (
            searchCapsule
          ) : (
            <div key="grp-list" className="lib-btn-group">
              <button className="btn-icon" id="libInlineSearchBtn" onClick={toggleSearch}>
                <Ico name="search" width={14} height={14} />
              </button>
              {mode === 'pl' && activePlaylist && (
                <button
                  className="btn-icon"
                  id="plEditBtn"
                  aria-label={t('lib.plmenu.editPlaylist')}
                  onClick={() => startEdit(activePlaylist.id)}
                >
                  <Ico name="edit" width={14} height={14} />
                </button>
              )}
              {/* Редактирование треков: включает selMode — ряд подменяется SelActions. */}
              <button
                className="btn-icon"
                id="libSelModeBtn"
                aria-label={t('lib.sel.edit')}
                onClick={() => setSticky(true)}
              >
                <Ico name="square" width={14} height={14} />
              </button>
            </div>
          )}
          <div key="grp-play" className="lib-btn-group">
            {/* Весь текущий вид (плейлист/папка/любимое) — в конец очереди.
                Источник передаём для случая пустой очереди: там добавление
                превращается в запуск и ярлык источника должен быть верным. */}
            <button
              className="btn-icon"
              id="libToQueueBtn"
              aria-label={t('lib.plmenu.toQueue')}
              onClick={() => {
                const view = getCurrentView()
                if (!view.tracks.length) return
                addTracksToQueue(view.tracks.map((t) => t.id), view.source)
              }}
            >
              <Ico name="addQueue" width={14} height={14} />
            </button>
            <button
              className="btn-icon"
              id="libPlayNextBtn"
              aria-label={t('lib.plmenu.playNext')}
              onClick={() => {
                const view = getCurrentView()
                if (!view.tracks.length) return
                playTracksNext(view.tracks.map((t) => t.id), view.source)
              }}
            >
              <Ico name="playNext" width={13} height={13} />
            </button>
            <button
              className="btn-icon"
              onClick={() => {
                const view = getCurrentView()
                if (!view.tracks.length) return
                playShuffledFromSource(view.tracks.map((t) => t.id), view.source)
              }}
            >
              <Ico name="shuffle" width={13} height={13} />
            </button>
            {/* Системный диалог Tauri, а не <input type=file>: нужен путь к
                файлу, а браузерный File его не отдаёт. */}
            {mode === 'all' && (
              <button
                id="libUploadBtn"
                className="btn-icon"
                onClick={() => void importTracks().catch((e) => console.warn('importTracks failed', e))}
              >
                <Ico name="add" width={14} height={14} />
              </button>
            )}
            <button
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
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="lib-content">
      {overview ? (
        <LibGridOverview />
      ) : (
      <>
      <div
        className="lib-content-head"
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
                  <Ico name="trash" width={12} height={12} style={{ display: 'block', flexShrink: 0 }} />
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
                  : {}),
              }}
            >
              {!heroCover && <HeroIcon />}
            </div>
          )}
          <div className="lib-hero-main">
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
              {/* Подпись остаётся и в редакторе: шапка не должна «пустеть» —
                  меняются только два поля, остальная информация на месте. */}
              <div className="lib-hero-sub" id="libHeroSub">
                {heroSub}
                {activePlaylist && <PlaylistOfflineTag trackIds={activePlaylist.trs} />}
                {activePlaylist && <CreatedMeta ts={plCreatedAt(activePlaylist)} dot />}
              </div>
            </div>
          ) : (
            <div style={{ minWidth: 0 }} id="libHeroNameWrap">
              {/* Неразрывное длинное название (без пробелов) не переносится и
                  раньше лезло под кнопки шапки — теперь clip + hover-marquee. */}
              <HoverMarquee className="lib-hero-name" id="libHeroName" text={heroName} />
              {/* Слот описания: у плейлиста — его текст, у папки — полный путь
                  (клик открывает её в проводнике). */}
              {mode === 'folder' && folderPath ? (
                <PathLine
                  className="lib-hero-desc"
                  id="libHeroDesc"
                  path={folderPath}
                  kind="folder"
                />
              ) : activePlaylist?.desc ? (
                <div className="lib-hero-desc" id="libHeroDesc">
                  {activePlaylist.desc}
                </div>
              ) : (
                <div className="lib-hero-desc" id="libHeroDesc" style={{ display: 'none' }} />
              )}
              {/* Пустую подпись не рисуем совсем: у .lib-hero-sub свой
                  margin-top, и пустой div сдвигал бы название вверх на 5px
                  относительно разделов со счётчиком. */}
              {(heroSub || (mode === 'pl' && activePlaylist)) && (
                <div className="lib-hero-sub" id="libHeroSub">
                  {heroSub}
                  {mode === 'pl' && activePlaylist && (
                    <PlaylistOfflineTag trackIds={activePlaylist.trs} />
                  )}
                  {/* Дата создания — хвостом подписи, а не отдельной строкой:
                      в шапке уже три строки (имя, описание, счётчик). */}
                  {mode === 'pl' && activePlaylist && (
                    <CreatedMeta ts={plCreatedAt(activePlaylist)} dot />
                  )}
                </div>
              )}
            </div>
          )}
          {/* Кнопки редактора (✕ / ✓) всегда справа от текста — раскладка
              «под названием» на них не распространяется. */}
          {heroBtnsBelow && !editing && heroBtns}
          </div>
          {(!heroBtnsBelow || editing) && heroBtns}
        </div>
        {/* Индикатор прокрутки на нижней границе шапки — отражает/двигает
            вертикальный скролл трек-листа. Только когда список показан. */}
        {!editing && !editorClosing && <LibScrollbar />}
      </div>
      {editing || editorClosing ? (
        // Большой редактор: трек-лист скрыт, на его месте — источники обновления.
        <PlSourcesEditor sources={editSources} onChange={setEditSources} closing={!editing} />
      ) : (
        <LibTracklist />
      )}
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
      />
    </div>
  )
}

// ── Hero конфигурация для каждого режима ──────────────────────────────

interface HeroCounts {
  totalTracks: number
  favCount: number
  folderPath: string | null
  folderTracksCount: number
  playlist?: Playlist
  allTracks: Track[]
  favs: Map<string, number>
  folderTracks: Track[]
  /** История: треков в списке и сколько по ним наслушано, сек. */
  hist: { tracks: number; sec: number }
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
        // Время тут — прослушанное (длительность × число прослушиваний), а не
        // суммарная длина списка, как у «Всех треков»: для истории осмысленно
        // именно оно. Подписи раньше не было, потому что счётчик упирался в
        // лимит 200 и ничего не сообщал; теперь считается по журналу.
        heroSub: tracksAndDuration(c.hist.tracks, c.hist.sec),
        heroIconClass: 'hist-icon',
        HeroIcon: HistoryHeroIcon,
      }
    case 'folder': {
      const dur = sumDurations(c.folderTracks.map((t) => t.dur))
      return {
        heroName: c.folderPath ? folderName(c.folderPath) : tFn('lib.folder'),
        heroSub: tracksAndDuration(c.folderTracksCount, dur),
        // Как в сайдбаре и сетке: акцентная подложка и папка, а не нотка.
        heroIconClass: 'folder-icon',
        HeroIcon: FolderHeroIcon,
      }
    }
    case 'pl': {
      const pl = c.playlist
      const byId = new Map(c.allTracks.map((t) => [t.id, t]))
      const dur = pl ? sumDurations(pl.trs.map((id) => byId.get(id)?.dur)) : 0
      const covers = pl ? pl.trs.map((id) => byId.get(id)?.cover) : []
      return {
        heroName: pl?.name ?? tFn('lib.playlist'),
        heroSub: tracksAndDuration(pl?.trs.length ?? 0, dur),
        // Без обложки рисуем мозаику из обложек треков (до 4), а если и их нет —
        // ту же пустую обложку, что в сайдбаре и сетке (`EmptyCover`, свой фон).
        // Нотка тут была бы неверна: у неё в библиотеке значение «раздел
        // Все треки», а не «обложки нет».
        // Классов нет и с обложкой: `off-icon` тут раньше стоял ради тинта под
        // картинкой, а теперь он несёт вид системного раздела (рамка + нейтральная
        // подложка) — на обложке плейлиста это лишняя обводка.
        heroIconClass: '',
        HeroIcon: pl ? () => <PlaylistCover covers={covers} /> : NoteHeroIcon,
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
  <Ico name="note" width={44} height={44} style={{ color: 'var(--sys-all-ico)' }} />
)

const HeartHeroIcon = () => (
  <Ico name="heart" variant="bold" width={44} height={44} style={{ color: 'var(--sys-fav-ico)' }} />
)

const HistoryHeroIcon = () => (
  <Ico name="clock" width={44} height={44} style={{ color: 'var(--sys-hist-ico)' }} />
)

const FolderHeroIcon = () => (
  <Ico name="folder" width={44} height={44} style={{ color: 'var(--accent)' }} />
)
