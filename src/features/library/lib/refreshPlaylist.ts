import type { Track } from '@entities/track'
import { toast } from '@shared/ui'
import { t } from '@shared/i18n'
import type { PlSourceRef } from '../model/playlist'
import { usePlaylistStore } from '../model/playlistStore'
import { saveTrackToLibrary } from './saveToLibrary'
import { resolveCollectionUrl } from './importFromUrl'

/**
 * «Обновить треки»: плейлист может иметь несколько привязанных источников
 * (`pl.sources`) — плейлисты/альбомы/лайки с любых площадок. URL-источники
 * резолвятся общим путём импорта (`resolveCollectionUrl` → провайдеры);
 * легаси `scLikes` (лайки SC-пользователя по user-id, без URL) — через
 * фетчер, который регистрирует площадка (паттерн как `registerSourceResolver`,
 * чтобы library НЕ импортировал soundcloud — иначе цикл).
 */

export type PlaylistSource =
  | { kind: 'playlist'; url: string }
  | { kind: 'likes'; userId: string }

type PlaylistFetcher = (src: PlaylistSource) => Promise<Track[]>

let _fetcher: PlaylistFetcher | null = null

/** Площадка регистрирует свой способ загрузить треки плейлиста/лайков. */
export const registerPlaylistFetcher = (fn: PlaylistFetcher): void => {
  _fetcher = fn
}

/** Треки одного источника (кидает при сетевой ошибке / неподдерживаемой ссылке). */
const fetchSourceTracks = async (src: PlSourceRef): Promise<Track[]> => {
  if (src.kind === 'scLikes') {
    if (!_fetcher) return []
    return _fetcher({ kind: 'likes', userId: src.userId })
  }
  return (await resolveCollectionUrl(src.url)).tracks
}

export const refreshPlaylistTracks = async (plId: string): Promise<void> => {
  const pl = usePlaylistStore.getState().playlists.find((p) => p.id === plId)
  const sources = pl?.sources ?? []
  if (!pl || !sources.length) return

  toast(t('toast.refreshPl'))
  // Источники тянем последовательно (их обычно единицы, а параллель зря душит
  // прокси-команды); упавший источник не отменяет остальные.
  const fresh: Track[] = []
  let firstErr: unknown = null
  for (const src of sources) {
    try {
      fresh.push(...(await fetchSourceTracks(src)))
    } catch (e) {
      console.warn('refreshPlaylistTracks: source failed', src, e)
      if (firstErr === null) firstErr = e
    }
  }

  // Актуальный список треков плейлиста (мог измениться за время запросов).
  const cur = usePlaylistStore.getState().playlists.find((p) => p.id === plId)
  if (!cur) return
  const existingSet = new Set(cur.trs)
  const newIds: string[] = []
  for (const t of fresh) {
    saveTrackToLibrary(t) // идемпотентно: уже в библиотеке → no-op
    if (!existingSet.has(t.id)) {
      newIds.push(t.id)
      existingSet.add(t.id)
    }
  }
  if (newIds.length) {
    // Новые — наверх (`pl.trs = newIds.concat(pl.trs)`).
    usePlaylistStore.getState().reorderPlTracks(plId, [...newIds, ...cur.trs])
  }
  if (firstErr !== null && !fresh.length) {
    // Все источники упали — показываем ошибку вместо «новых треков нет».
    toast(t('toast.refreshError', { msg: firstErr instanceof Error ? firstErr.message : String(firstErr) }))
    return
  }
  toast(newIds.length ? t('toast.refreshAdded', { n: newIds.length }) : t('toast.refreshNoNew'))
}
