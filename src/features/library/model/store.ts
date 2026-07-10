import { create } from 'zustand'
import type { Track } from '@entities/track'
import type { LibMode } from './types'
import { applyTracksOrder, loadTracksOrder, saveTracksOrder } from '../lib/tracksOrder'

/** Режимы сортировки tracklist'а `libSortMode`. */
export type TrackSortMode = 'default' | 'name' | 'artist' | 'dur' | 'date' | 'plays' | 'album'
export type TrackSortDir = 'asc' | 'desc'

/**
 * Вид строк сайдбара библиотеки (кнопка `libSbCompactBtn`, циклится):
 * - `full`    — обложка + название + подпись + play (по умолчанию)
 * - `text`    — только текст, без обложек (компактный)
 * - `covers`  — только обложки крупным столбиком, без текста
 */
export type SbView = 'full' | 'text' | 'covers'
const SB_VIEW_CYCLE: SbView[] = ['full', 'text', 'covers']

// Вид сайдбара персистим в localStorage — переживает перезапуск приложения.
const SB_VIEW_KEY = 'bloom_lib_sbview'
const loadSbView = (): SbView => {
  const v = localStorage.getItem(SB_VIEW_KEY)
  return v === 'text' || v === 'covers' ? v : 'full'
}

/**
 * Стор библиотеки. Поля: `libMode`, `libPlId`, `libFolderPath`, `libSbCompact`.
 *
 * Источники tracks:
 * - События `bloom-folder-tracks` от Rust (folder_watcher) — папки пользователя
 * - Ручная загрузка через `addTracks` — handleFiles из file picker / drag-drop
 *
 * Все источники приводятся к унифицированному `Track` из entities.
 */
export interface LibState {
  mode: LibMode
  plId: string | null
  folderPath: string | null
  sbView: SbView
  /**
   * Показывать ли grid-обзор библиотеки. Имеет
   * смысл только когда вид библиотеки = «сетка» (uiPrefs.libView==='grid'):
   * true = обзор-сетка карточек, false = провалились в плейлист/папку/раздел
   * (трек-лист + кнопка «назад»). Сбрасывается в false при любом выборе раздела,
   * в true — `backToGrid()`.
   */
  gridHome: boolean

  /** Все треки в библиотеке (любого источника). */
  tracks: Track[]
  /** Текущий список путей пользовательских папок. */
  folders: string[]
  /** Inline-поиск в текущем view (libInlineSearch); lowercase. */
  searchQuery: string

  selectBuiltin: (m: 'all' | 'fav' | 'history') => void
  selectPlaylist: (id: string) => void
  selectFolder: (path: string) => void
  /** Вернуться к grid-обзору библиотеки. */
  backToGrid: () => void
  /**
   * Вызывается СИНХРОННО при переходе на вкладку библиотеки (goNav('lib')).
   * Показывает grid-обзор, если мы не «провалились» в плейлист/папку — со
   * старого goNav-блока. Делается синхронно (не в useEffect), чтобы
   * последующий явный `selectBuiltin('fav')` из deep-link главной мог перетереть
   * gridHome=false (иначе async-эффект возвращал бы обзор поверх выбора).
   */
  onEnterLibrary: () => void
  /** Циклически переключить вид сайдбара: full → text → covers → full. */
  cycleSbView: () => void
  setSearchQuery: (q: string) => void

  // — Обновления —
  setFolders: (paths: string[]) => void
  /** Добавить/обновить треки (merge по id). `prepend` — новые наверх. */
  addTracks: (batch: Track[], opts?: { prepend?: boolean }) => void
  /** Удалить все треки указанной папки (на event bloom-folder-removed). */
  removeFolderTracks: (folderPath: string) => void
  /**
   * После скана убрать треки просканированных папок, которых больше нет на диске
   * (файл удалили, пока watcher не слушал). Папки, которые не удалось прочитать,
   * в `scannedFolders` не приходят — их треки не трогаем, иначе отключённая
   * флешка вычистила бы всю свою музыку из плейлистов.
   *
   * Возвращает id вычищенных треков — для каскадной чистки ссылок.
   */
  pruneFolderTracks: (scannedFolders: string[], aliveIds: string[]) => string[]
  /** Удалить один трек по id. */
  removeTrack: (trackId: string) => void
  /**
   * Заменить трек новым (версией с другой площадки), сохранив позицию в списке.
   * id меняется — правим и сохранённый tracksOrder. Ремап ссылок в плейлистах/
   * лайках/IDB — на вызывающей стороне (replaceLibTrack).
   */
  replaceTrack: (oldId: string, next: Track) => void
  /**
   * Переупорядочить треки по списку id (drag-reorder в mode='all'/'fav').
   * Не персистится в IDB — порядок живёт только в runtime; folder_watcher и
   * IDB rehydrate могут перезаписать. Полноценный persist — отдельной фазой.
   */
  reorderTracks: (ids: string[]) => void

  /** Текущий режим сортировки tracklist'а. */
  sortMode: TrackSortMode
  sortDir: TrackSortDir
  /**
   * Установить режим сортировки. Если тот же mode — toggle dir.
   * При смене на новый mode dir сбрасывается в дефолт для этого типа:
   * date/plays → desc, остальные → asc, default → asc (не используется).
   */
  setSort: (mode: TrackSortMode) => void
}

export const useLibStore = create<LibState>((set, get) => ({
  mode: 'all',
  plId: null,
  folderPath: null,
  sbView: loadSbView(),
  gridHome: true,
  tracks: [],
  folders: [],
  searchQuery: '',

  // При смене раздела сбрасываем поиск + выходим из grid-обзора.
  selectBuiltin: (m) =>
    set({ mode: m, plId: null, folderPath: null, searchQuery: '', gridHome: false }),
  selectPlaylist: (id) =>
    set({ mode: 'pl', plId: id, folderPath: null, searchQuery: '', gridHome: false }),
  selectFolder: (path) =>
    set({ mode: 'folder', folderPath: path, plId: null, searchQuery: '', gridHome: false }),
  backToGrid: () =>
    set({ mode: 'all', plId: null, folderPath: null, searchQuery: '', gridHome: true }),

  onEnterLibrary: () =>
    set((s) => (s.plId === null && s.folderPath === null ? { gridHome: true } : s)),
  cycleSbView: () =>
    set((s) => {
      const next = SB_VIEW_CYCLE[(SB_VIEW_CYCLE.indexOf(s.sbView) + 1) % SB_VIEW_CYCLE.length]
      try {
        localStorage.setItem(SB_VIEW_KEY, next)
      } catch {
        /* quota → ignore */
      }
      return { sbView: next }
    }),
  setSearchQuery: (q) => set({ searchQuery: q.toLowerCase() }),

  setFolders: (paths) => set({ folders: paths }),

  addTracks: (batch, opts) =>
    set((s) => {
      if (!batch.length) return s
      const map = new Map<string, Track>()
      if (opts?.prepend) {
        // Новые — наверх (unshift).
        for (const t of batch) map.set(t.id, t)
        for (const t of s.tracks) if (!map.has(t.id)) map.set(t.id, t)
        // Поднимаем новые id в начало сохранённого порядка и ПЕРСИСТИМ его.
        // Без этого prepend живёт только в текущей сессии (порядок вставки в
        // Map), а после рестарта applyTracksOrder отправил бы новые id в КОНЕЦ
        // (или вернул бы произвольный порядок IDB, если order пуст) — трек
        // «падал» бы вниз. Если порядка ещё нет — заводим его от текущих треков.
        //
        // «Новым» считаем id, которого нет НИ в сторе, НИ в сохранённом порядке.
        // Это важно для folder_watcher / импорта: на каждом старте они заново
        // присылают уже известные треки, и без проверки order их порядок
        // перетасовывался бы при каждом запуске.
        const order = loadTracksOrder()
        const known = new Set([...s.tracks.map((t) => t.id), ...order])
        const newIds = batch.map((t) => t.id).filter((id) => !known.has(id))
        if (newIds.length) {
          const newSet = new Set(newIds)
          const base = order.length ? order : s.tracks.map((t) => t.id)
          saveTracksOrder([...newIds, ...base.filter((id) => !newSet.has(id))])
        }
      } else {
        for (const t of s.tracks) map.set(t.id, t)
        for (const t of batch) map.set(t.id, t)
      }
      // Применяем сохранённый пользовательский порядок.
      return { tracks: applyTracksOrder(Array.from(map.values())) }
    }),

  removeFolderTracks: (folderPath) =>
    set((s) => ({
      tracks: s.tracks.filter((t) => t._folder !== folderPath),
    })),

  pruneFolderTracks: (scannedFolders, aliveIds) => {
    const scanned = new Set(scannedFolders.map((f) => f.toLowerCase()))
    const alive = new Set(aliveIds)
    const goneIds = get()
      .tracks.filter(
        (t) => t._folder && scanned.has(t._folder.toLowerCase()) && !alive.has(t.id),
      )
      .map((t) => t.id)
    if (goneIds.length) {
      const gone = new Set(goneIds)
      set((s) => ({ tracks: s.tracks.filter((t) => !gone.has(t.id)) }))
    }
    return goneIds
  },

  removeTrack: (trackId) =>
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== trackId),
    })),

  replaceTrack: (oldId, next) =>
    set((s) => {
      const idx = s.tracks.findIndex((t) => t.id === oldId)
      if (idx < 0) return s
      const tracks = s.tracks.slice()
      tracks[idx] = next
      // Ремап сохранённого порядка, если oldId в нём был — иначе после рестарта
      // applyTracksOrder не нашёл бы новый id и увёл его в конец списка.
      const order = loadTracksOrder()
      if (order.includes(oldId)) {
        saveTracksOrder(order.map((id) => (id === oldId ? next.id : id)))
      }
      return { tracks }
    }),

  reorderTracks: (ids) =>
    set((s) => {
      const byId = new Map(s.tracks.map((t) => [t.id, t]))
      const next: typeof s.tracks = []
      const seen = new Set<string>()
      for (const id of ids) {
        const t = byId.get(id)
        if (t) {
          next.push(t)
          seen.add(id)
        }
      }
      // Треки не упомянутые в ids (новые/невидимые) — в конец, в исходном порядке.
      for (const t of s.tracks) {
        if (!seen.has(t.id)) next.push(t)
      }
      // Persist в localStorage — порядок переживёт перезагрузку.
      saveTracksOrder(next.map((t) => t.id))
      return { tracks: next }
    }),

  sortMode: 'default',
  sortDir: 'asc',
  setSort: (mode) =>
    set((s) => {
      if (mode === s.sortMode && mode !== 'default') {
        // Toggle direction.
        return { sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' }
      }
      // Новый mode — дефолтное направление.
      const defaultDir: TrackSortDir =
        mode === 'date' || mode === 'plays' ? 'desc' : 'asc'
      return { sortMode: mode, sortDir: defaultDir }
    }),
}))
