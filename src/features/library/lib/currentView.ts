import type { Track } from '@entities/track'
import type { PlaySource } from '@features/player/model/queueStore'
import { isDownloadable } from '@features/player'
import { offline } from '@features/offline'
import { playCount } from '@/db/playStats'
import {
  useLibStore,
  usePlaylistStore,
  useFavStore,
  useHistoryStore,
  type TrackSortMode,
  type TrackSortDir,
} from '../model'
import { resolveHistoryTrack } from './historyTracks'
import { parseDurSec } from './formatCount'

/**
 * Сортировка вида после фильтрации. Общая для LibTracklist и очереди: раньше
 * жила только в списке, и клик по треку в отсортированном виде ставил очередь
 * в исходном порядке — следующим играл не тот трек, что ниже на экране.
 */
export const applySort = (
  tracks: Track[],
  mode: TrackSortMode,
  dir: TrackSortDir,
  libMode: string,
): Track[] => {
  const sd = dir === 'asc' ? 1 : -1
  const sorted = [...tracks]
  switch (mode) {
    case 'name':
      sorted.sort((a, b) => sd * (a.name || '').localeCompare(b.name || '', 'ru'))
      break
    case 'artist':
      sorted.sort((a, b) => sd * (a.artist || '').localeCompare(b.artist || '', 'ru'))
      break
    case 'album':
      sorted.sort((a, b) => sd * (a.album || '').localeCompare(b.album || '', 'ru'))
      break
    case 'dur':
      sorted.sort((a, b) => sd * (parseDurSec(a.dur) - parseDurSec(b.dur)))
      break
    case 'date':
      // В fav-режиме сортируем по favAt, иначе по addedAt.
      sorted.sort((a, b) => {
        if (libMode === 'fav') {
          return sd * (((b.favAt || b.addedAt || 0) - (a.favAt || a.addedAt || 0)))
        }
        return sd * (((a.addedAt || 0) - (b.addedAt || 0)))
      })
      break
    case 'plays':
      // Не `t.playCount` — оно не ведётся и всегда 0, из-за чего пункт меню
      // «По прослушиваниям» молча ничего не делал. Считаем по журналу.
      sorted.sort((a, b) => sd * (playCount(a.id) - playCount(b.id)))
      break
  }
  return sorted
}

/**
 * Отбор «Только скачанные»: остаются локальные файлы (качать их нечего) и
 * треки площадок с офлайн-копией. Общий для LibTracklist и очереди — иначе
 * «Играть все» из отобранного вида играл бы и нескачанное.
 */
export const isOnDisk = (t: Track, isOffline: (id: string) => boolean): boolean =>
  !isDownloadable(t) || isOffline(t.id)

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
    case 'history': {
      // Порядок из истории (последние сверху), как в filterByMode:
      // резолв библиотека → trackRegistry (SC/Yandex/YTM), удалённые скипаем.
      // Резолв идёт до снимка из журнала включительно — иначе всё, что старше
      // ~300 треков, выпадало бы из списка молча (см. historyTracks).
      const byId = new Map(all.map((t) => [t.id, t]))
      for (const e of useHistoryStore.getState().entries) {
        const t = resolveHistoryTrack(e.id, byId)
        if (t) base.push(t)
      }
      source = { kind: 'lib-history' }
      break
    }
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

  // Тот же порядок, что на экране: иначе очередь шла бы мимо видимого списка.
  if (lib.sortMode === 'downloaded') base = base.filter((t) => isOnDisk(t, offline.isOffline))
  else if (lib.sortMode !== 'default') base = applySort(base, lib.sortMode, lib.sortDir, mode)

  return { tracks: base, source }
}
