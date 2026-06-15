import { create } from 'zustand'
import type { Track } from '@entities/track'
import type { LibMode } from './types'
import { applyTracksOrder, loadTracksOrder, saveTracksOrder } from '../lib/tracksOrder'

/** Режимы сортировки tracklist'а `libSortMode`. */
export type TrackSortMode = 'default' | 'name' | 'artist' | 'dur' | 'date' | 'plays' | 'album'
export type TrackSortDir = 'asc' | 'desc'

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
  sbCompact: boolean
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
  toggleSbCompact: () => void
  setSearchQuery: (q: string) => void

  // — Обновления —
  setFolders: (paths: string[]) => void
  /** Добавить/обновить треки (merge по id). `prepend` — новые наверх. */
  addTracks: (batch: Track[], opts?: { prepend?: boolean }) => void
  /** Удалить все треки указанной папки (на event bloom-folder-removed). */
  removeFolderTracks: (folderPath: string) => void
  /** Удалить один трек по id. */
  removeTrack: (trackId: string) => void
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

export const useLibStore = create<LibState>((set) => ({
  mode: 'all',
  plId: null,
  folderPath: null,
  sbCompact: false,
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
  toggleSbCompact: () => set((s) => ({ sbCompact: !s.sbCompact })),
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
        // Если есть сохранённый порядок — поднимаем новые id в его начало.
        // Иначе applyTracksOrder (ниже) отправил бы неизвестные id в КОНЕЦ,
        // и prepend визуально не сработал бы.
        const order = loadTracksOrder()
        if (order.length) {
          const existing = new Set(s.tracks.map((t) => t.id))
          const newIds = batch.map((t) => t.id).filter((id) => !existing.has(id))
          if (newIds.length) {
            const newSet = new Set(newIds)
            saveTracksOrder([...newIds, ...order.filter((id) => !newSet.has(id))])
          }
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

  removeTrack: (trackId) =>
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== trackId),
    })),

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
