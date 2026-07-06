import type { Track } from '@entities/track'
import { resolveUrlAny, getProvider } from '@features/providers'
import { t as tFn } from '@shared/i18n'
import type { PlSourceRef } from '../model/playlist'
import { usePlaylistStore } from '../model/playlistStore'
import { useFavStore } from '../model/favStore'
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

/** Куда импортировать: новый плейлист / во все треки / в любимые / в существующий плейлист. */
export type ImportTarget =
  | { kind: 'create' }
  | { kind: 'library' }
  | { kind: 'favorites' }
  | { kind: 'playlist'; id: string }

/** Уже разрешённый набор треков для импорта в выбранную цель. */
export interface ImportSource {
  title: string
  cover?: string | null
  tracks: Track[]
  /** Источник — привязывается к плейлисту для «Обновить треки» (любая площадка). */
  source?: PlSourceRef
}

/** Совпадение источников (для дедупликации привязок). */
export const samePlSource = (a: PlSourceRef, b: PlSourceRef): boolean =>
  a.kind === 'url'
    ? b.kind === 'url' && a.url === b.url
    : b.kind === 'scLikes' && a.userId === b.userId

export interface ApplyImportResult {
  /** Сколько треков реально добавлено (без дублей). */
  added: number
  /** id созданного/целевого плейлиста (для `create` и `playlist`). */
  createdId?: string
}

/**
 * Применить импорт уже загруженных треков к цели. Чистая операция над сторами
 * (без сети) — общая для импорта по ссылке и импорта с детальной страницы.
 */
export const applyImport = (target: ImportTarget, src: ImportSource): ApplyImportResult => {
  const { title, cover, tracks, source } = src
  const ps = usePlaylistStore.getState()

  if (target.kind === 'create') {
    const pl = ps.createPl(title, undefined, cover ?? undefined, source ? { sources: [source] } : undefined)
    tracks.forEach((t) => saveTrackToLibrary(t))
    // Точный порядок источника (addTrackToPl prepend'ит по одному — перевернул бы список).
    ps.reorderPlTracks(pl.id, tracks.map((t) => t.id))
    return { added: tracks.length, createdId: pl.id }
  }

  if (target.kind === 'library') {
    let added = 0
    tracks.forEach((t) => {
      if (saveTrackToLibrary(t)) added++
    })
    return { added }
  }

  if (target.kind === 'favorites') {
    const fav = useFavStore.getState()
    let added = 0
    tracks.forEach((t) => {
      saveTrackToLibrary(t)
      if (!fav.isFav(t.id)) {
        fav.setFav(t.id, true)
        added++
      }
    })
    return { added }
  }

  // Существующий плейлист — добавляем в конец, сохраняя порядок и без дублей.
  const pl = ps.playlists.find((p) => p.id === target.id)
  tracks.forEach((t) => saveTrackToLibrary(t))
  const existing = pl ? pl.trs : []
  const newIds = tracks.map((t) => t.id).filter((id) => !existing.includes(id))
  ps.reorderPlTracks(target.id, [...existing, ...newIds])
  // Импортированная коллекция становится источником «Обновить треки» плейлиста
  // (привязок может быть сколько угодно, с разных площадок).
  if (pl && source && !(pl.sources ?? []).some((s) => samePlSource(s, source))) {
    ps.setPlSources(target.id, [...(pl.sources ?? []), source])
  }
  return { added: newIds.length, createdId: target.id }
}

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

export interface ResolvedCollection {
  title: string
  cover: string | null
  tracks: Track[]
  sourceUrl?: string
}

/**
 * Резолв вставленной ссылки в набор треков. Разрешены ТОЛЬКО коллекции:
 * плейлист, альбом и лайки (профиль). Ссылку на одиночный трек/артиста
 * отклоняем (бросаем ошибку с понятным сообщением).
 *
 * Общая точка для импорта по ссылке, привязки источника в редакторе плейлиста
 * и «Обновить треки» (повторный резолв привязанного URL).
 */
export const resolveCollectionUrl = async (url: string): Promise<ResolvedCollection> => {
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
  const src = await resolveCollectionUrl(url)
  if (!src.tracks.length) throw new Error(tFn('lib.import.toast.empty'))

  const res = applyImport(target, {
    title: src.title,
    cover: src.cover,
    tracks: src.tracks,
    // Канонический URL от площадки, иначе — вставленная ссылка как есть
    // (у профилей-лайков sourceUrl нет, но сама ссылка резолвится повторно).
    source: { kind: 'url', url: src.sourceUrl ?? url.trim(), title: src.title },
  })
  return { title: src.title, added: res.added, total: src.tracks.length, createdId: res.createdId }
}
