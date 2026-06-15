import type { LibSidebarSort } from './useLibSidebarSort'
import type { UnifiedItem } from '../model'

/**
 * Запись объединённого списка библиотеки (плейлист / папка / артист) с именем
 * для сортировки. Совместима с `UnifiedItem` (доп. поле `name`).
 */
export type UnifiedEntry =
  | { type: 'playlist'; id: string; name: string }
  | { type: 'folder'; id: string; name: string }
  | { type: 'artist'; id: string; name: string }

const TYPE_ORDER = { playlist: 0, folder: 1, artist: 2 } as const

/**
 * Построить упорядоченный список записей библиотеки (плейлисты+папки+артисты)
 * `_buildUnifiedOrder`/buildEntries: при `default` — кастомный
 * порядок (`applyOrder`), иначе сорт по имени/типу; закреплённые — всегда наверх.
 * Используется и сайдбаром-списком (UnifiedList), и grid-обзором (LibGridOverview).
 */
export const buildOrderedUnifiedEntries = (params: {
  playlists: { id: string; name: string }[]
  folders: { id: string; name: string }[]
  artists: { id: string; name: string }[]
  order: UnifiedItem[]
  applyOrder: <T extends UnifiedItem>(entries: T[]) => T[]
  sortMode: LibSidebarSort
}): { entries: UnifiedEntry[]; pinnedSet: Set<string> } => {
  const { playlists, folders, artists, order, applyOrder, sortMode } = params
  const pls: UnifiedEntry[] = playlists.map((p) => ({ type: 'playlist', id: p.id, name: p.name }))
  const fldrs: UnifiedEntry[] = folders.map((f) => ({ type: 'folder', id: f.id, name: f.name }))
  const arts: UnifiedEntry[] = artists.map((a) => ({ type: 'artist', id: a.id, name: a.name }))

  let combined: UnifiedEntry[]
  if (sortMode === 'default') {
    combined = applyOrder([...pls, ...fldrs, ...arts])
  } else {
    const cmp = (a: UnifiedEntry, b: UnifiedEntry): number => {
      if (sortMode === 'name-asc')
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'ru', { sensitivity: 'base' })
      if (sortMode === 'name-desc')
        return b.name.toLowerCase().localeCompare(a.name.toLowerCase(), 'ru', { sensitivity: 'base' })
      return TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
    }
    combined = [...pls, ...fldrs, ...arts].sort(cmp)
  }

  const pinnedSet = new Set(order.filter((o) => o.pinned).map((o) => `${o.type}:${o.id}`))
  const pinned = combined.filter((e) => pinnedSet.has(`${e.type}:${e.id}`))
  const unpinned = combined.filter((e) => !pinnedSet.has(`${e.type}:${e.id}`))
  return { entries: [...pinned, ...unpinned], pinnedSet }
}
