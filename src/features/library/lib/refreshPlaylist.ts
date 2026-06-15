import type { Track } from '@entities/track'
import { toast } from '@shared/ui'
import { usePlaylistStore } from '../model/playlistStore'
import { saveTrackToLibrary } from './saveToLibrary'

/**
 * «Обновить треки» SC-плейлиста:
 * две ветки — `scSource` (плейлист по permalink) и `scLikes` (лайки пользователя
 * по user-id). Логика обновления (сохранить новые в библиотеку + дописать наверх)
 * живёт здесь, в library; а «как достать свежие треки» — у площадки, которая
 * регистрирует фетчер (паттерн как `registerSourceResolver`, чтобы library НЕ
 * импортировал soundcloud — иначе цикл).
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

export const refreshScPlaylist = async (plId: string): Promise<void> => {
  const pl = usePlaylistStore.getState().playlists.find((p) => p.id === plId)
  const src: PlaylistSource | null = pl?.scSource
    ? { kind: 'playlist', url: pl.scSource }
    : pl?.scLikes
      ? { kind: 'likes', userId: pl.scLikes }
      : null
  if (!pl || !src || !_fetcher) return

  toast(src.kind === 'likes' ? 'Обновляем лайки…' : 'Обновляем плейлист…')
  try {
    const fresh = await _fetcher(src)
    // Актуальный список треков плейлиста (мог измениться за время запроса).
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
      // Новые — наверх ( `pl.trs = newIds.concat(pl.trs)`).
      usePlaylistStore.getState().reorderPlTracks(plId, [...newIds, ...cur.trs])
    }
    toast(newIds.length ? `Добавлено новых треков: ${newIds.length}` : 'Новых треков нет')
  } catch (e) {
    console.warn('refreshScPlaylist failed', e)
    toast('Ошибка обновления: ' + (e instanceof Error ? e.message : String(e)))
  }
}
