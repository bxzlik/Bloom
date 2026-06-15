import type { Track } from '@entities/track'
import type { PlaySource } from '@features/player/model/queueStore'
import { useLibStore, usePlaylistStore, useFavStore } from '../model'

/**
 * Возвращает текущее представление библиотеки: видимые треки + источник для
 * передачи в queue. Используется hero-кнопками («Играть все», «Перемешать»)
 * и кликом по треку в LibTracklist.
 *
 * Логика фильтрации зеркалит `filterByMode` из LibTracklist — но возвращает
 * также `source`, чтобы plays корректно ярлычились в qpSourcePill.
 *
 * Используется не как React-хук (не подписывается на стор), а как императивная
 * выборка в момент клика — то есть берём актуальное состояние стора.
 */
export const getCurrentView = (): { tracks: Track[]; source: PlaySource } => {
  const lib = useLibStore.getState()
  const { mode, folderPath, plId, tracks: all, searchQuery } = lib
  const playlists = usePlaylistStore.getState().playlists
  const favs = useFavStore.getState().favs

  let base: Track[] = []
  let source: PlaySource = null

  switch (mode) {
    case 'all':
      base = all
      source = { kind: 'lib-all' }
      break
    case 'fav':
      base = all
        .filter((t) => favs.has(t.id))
        .sort((a, b) => (favs.get(b.id) ?? 0) - (favs.get(a.id) ?? 0))
      source = { kind: 'lib-fav' }
      break
    case 'folder':
      if (folderPath) {
        const lp = folderPath.toLowerCase()
        base = all.filter((t) => t._folder?.toLowerCase() === lp)
        const parts = folderPath.replace(/\\/g, '/').split('/').filter(Boolean)
        source = {
          kind: 'folder',
          path: folderPath,
          name: parts[parts.length - 1] || folderPath,
        }
      }
      break
    case 'pl': {
      const pl = plId ? playlists.find((p) => p.id === plId) : undefined
      if (pl) {
        const byId = new Map(all.map((t) => [t.id, t]))
        base = pl.trs.map((id) => byId.get(id)).filter((t): t is Track => !!t)
        source = { kind: 'playlist', id: pl.id, name: pl.name, cover: pl.cover ?? null }
      }
      break
    }
    case 'history':
      // TBD при wiring истории — пока не реализовано.
      break
  }

  // Учитываем активный inline-search (как в LibTracklist).
  if (searchQuery) {
    const q = searchQuery
    base = base.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.artist || '').toLowerCase().includes(q) ||
        (t.album || '').toLowerCase().includes(q),
    )
  }

  return { tracks: base, source }
}
