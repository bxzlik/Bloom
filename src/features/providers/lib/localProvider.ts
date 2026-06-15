import type { Track } from '@entities/track'
import type { Playlist as PlaylistEntity } from '@entities/playlist'
import { useLibStore, usePlaylistStore } from '@features/library'
import type { MusicProvider, SearchResults } from '../model/types'

/** Подстрока в name/artist/album трека (lowercase-сравнение). */
const trackMatches = (t: Track, q: string): boolean => {
  const hay = `${t.name ?? ''} ${t.artist ?? ''} ${t.album ?? ''}`.toLowerCase()
  return hay.includes(q)
}

/**
 * Встроенный провайдер «локальная библиотека». Источник правды — `useLibStore`
 * (треки) + `usePlaylistStore` (плейлисты); ничего сетевого, поиск синхронный.
 *
 * Это первая (референсная) реализация `MusicProvider`: показывает, что нужно от
 * площадки — отдать выдачу в общих `entities/*`. Сетевые провайдеры (SoundCloud,
 * Yandex) повторяют ровно эту форму, меняя лишь ИСТОЧНИК данных.
 *
 * Треки локального провайдера уже лежат в `useLibStore`, поэтому плеер находит их
 * через `findTrack` без участия `trackRegistry` (тот — для НЕлокальных).
 */
export const localProvider: MusicProvider = {
  id: 'local',
  label: 'Моя библиотека',

  async search(query): Promise<Partial<SearchResults>> {
    const q = query.trim().toLowerCase()
    if (!q) return {}

    const tracks = useLibStore.getState().tracks.filter((t) => trackMatches(t, q))

    const playlists: PlaylistEntity[] = usePlaylistStore
      .getState()
      .playlists.filter((p) => p.name.toLowerCase().includes(q))
      .map((p) => ({
        id: p.id,
        title: p.name,
        cover: p.cover ?? null,
        trackCount: p.trs.length,
        source: 'local' as const,
      }))

    return { tracks, playlists }
  },

  /** Локальный плейлист открывается в том же DetailView, что и сетевые. */
  async getPlaylist(id): Promise<{ playlist: PlaylistEntity; tracks: Track[] }> {
    const pl = usePlaylistStore.getState().playlists.find((p) => p.id === id)
    if (!pl) throw new Error('Плейлист не найден')
    const byId = new Map(useLibStore.getState().tracks.map((t) => [t.id, t]))
    const tracks = pl.trs.map((tid) => byId.get(tid)).filter((t): t is Track => !!t)
    const playlist: PlaylistEntity = {
      id: pl.id,
      title: pl.name,
      cover: pl.cover ?? null,
      trackCount: tracks.length,
      source: 'local',
    }
    return { playlist, tracks }
  },
}
