import type { Track } from '@entities/track'
import { resolveUrlAny, getProvider } from '@features/providers'
import { t as tFn } from '@shared/i18n'
import { usePlaylistStore } from '../model/playlistStore'
import { saveTrackToLibrary } from './saveToLibrary'

/** Площадка по виду ссылки — для бейджа в инпуте импорта (детект без сети). */
export type LinkProvider = 'soundcloud' | 'yandex' | 'ytmusic' | 'spotify'

/**
 * Определить площадку по URL для бейджа. Только распознавание домена — резолв
 * (и собственно поддержка) идёт через `resolveUrlAny`. Возвращает null, если
 * строка не похожа на ссылку известной площадки.
 */
export const detectLinkProvider = (url: string): LinkProvider | null => {
  const u = url.trim()
  if (!u) return null
  if (/soundcloud\.com|snd\.sc/i.test(u)) return 'soundcloud'
  if (/music\.yandex\.[a-z]+/i.test(u)) return 'yandex'
  if (/music\.youtube\.com|(?:^|\.)youtube\.com|youtu\.be/i.test(u)) return 'ytmusic'
  if (/open\.spotify\.com|spotify:/i.test(u)) return 'spotify'
  return null
}

/** Куда импортировать: новый плейлист / во все треки / в существующий плейлист. */
export type ImportTarget =
  | { kind: 'create' }
  | { kind: 'library' }
  | { kind: 'playlist'; id: string }

export interface UrlImportResult {
  /** Название источника (для тоста). */
  title: string
  /** Сколько треков реально добавлено (без дублей). */
  added: number
  /** Всего треков в источнике. */
  total: number
  /** id созданного плейлиста (только для target `create`). */
  createdId?: string
}

interface ResolvedSource {
  title: string
  cover: string | null
  tracks: Track[]
  sourceUrl?: string
}

/**
 * Резолв вставленной ссылки в набор треков. Разрешены ТОЛЬКО коллекции:
 * плейлист, альбом и лайки (профиль). Ссылку на одиночный трек/артиста
 * отклоняем (бросаем ошибку с понятным сообщением).
 */
const resolveSource = async (url: string): Promise<ResolvedSource> => {
  const hit = await resolveUrlAny(url.trim())
  if (!hit) throw new Error(tFn('lib.import.toast.unresolved'))
  const { providerId, resolved } = hit
  const prov = getProvider(providerId)

  if (resolved.type === 'album') {
    if (!prov?.getAlbum) throw new Error(tFn('lib.import.toast.unresolved'))
    const { album, tracks } = await prov.getAlbum(resolved.playlist.id)
    return { title: album.title || resolved.playlist.title, cover: album.cover ?? null, tracks, sourceUrl: album.sourceUrl ?? undefined }
  }
  if (resolved.type === 'playlist') {
    if (!prov?.getPlaylist) throw new Error(tFn('lib.import.toast.unresolved'))
    const { playlist, tracks } = await prov.getPlaylist(resolved.playlist.id)
    return { title: playlist.title || resolved.playlist.title, cover: playlist.cover ?? null, tracks, sourceUrl: playlist.sourceUrl ?? undefined }
  }
  if (resolved.type === 'profile') {
    // Ссылка на профиль (/username) → импортируем его лайки.
    const { profile } = resolved
    return {
      title: tFn('lib.import.likesTitle', { name: profile.artist.name }),
      cover: profile.artist.avatar ?? null,
      tracks: profile.likes,
    }
  }
  // track | artist — не коллекция
  throw new Error(tFn('lib.import.toast.onlyCollections'))
}

/**
 * Импортировать вставленную ссылку (плейлист/альбом/лайки) в выбранную цель.
 * Возвращает результат для тоста. Бросает ошибку с локализованным сообщением,
 * если ссылку не удалось распознать / это не коллекция.
 */
export const importFromUrl = async (
  url: string,
  target: ImportTarget,
): Promise<UrlImportResult> => {
  const src = await resolveSource(url)
  if (!src.tracks.length) throw new Error(tFn('lib.import.toast.empty'))

  const ps = usePlaylistStore.getState()

  if (target.kind === 'create') {
    const pl = ps.createPl(
      src.title,
      undefined,
      src.cover ?? undefined,
      src.sourceUrl ? { scSource: src.sourceUrl } : undefined,
    )
    src.tracks.forEach((t) => saveTrackToLibrary(t))
    // Точный порядок источника (addTrackToPl prepend'ит по одному — перевернул бы список).
    ps.reorderPlTracks(pl.id, src.tracks.map((t) => t.id))
    return { title: src.title, added: src.tracks.length, total: src.tracks.length, createdId: pl.id }
  }

  if (target.kind === 'library') {
    let added = 0
    src.tracks.forEach((t) => {
      if (saveTrackToLibrary(t)) added++
    })
    return { title: src.title, added, total: src.tracks.length }
  }

  // Существующий плейлист — добавляем в конец, сохраняя порядок и без дублей.
  const pl = ps.playlists.find((p) => p.id === target.id)
  src.tracks.forEach((t) => saveTrackToLibrary(t))
  const existing = pl ? pl.trs : []
  const newIds = src.tracks.map((t) => t.id).filter((id) => !existing.includes(id))
  ps.reorderPlTracks(target.id, [...existing, ...newIds])
  return { title: src.title, added: newIds.length, total: src.tracks.length, createdId: target.id }
}
