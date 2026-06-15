import type { Track } from '@entities/track'
import type { Playlist } from '../model/playlist'
import { useLibStore } from '../model/store'
import { usePlaylistStore } from '../model/playlistStore'
import { idbSaveMeta } from './idb'

/**
 * Экспорт/импорт плейлистов в `.bloomplaylist` (JSON) —
 * `exportPlaylist` / `__bloomImportPlaylistData`.
 *
 * Формат файла: `{ version:1, exported_at, playlists:[...], tracks:[...] }`.
 * `tracks` — метаданные треков, на которые ссылаются плейлисты (без сессионного
 * blob `url`). Реальные файлы НЕ упаковываются: folder/uploaded-треки резолвятся
 * по id из своих источников (Rust folder_watcher / IDB) на этой машине.
 */

export interface ExportBundle {
  version: number
  exported_at: string
  playlists: Playlist[]
  tracks: Track[]
}

/** Собрать bundle для экспорта одного плейлиста (с метаданными его треков). */
export const buildExportBundle = (playlist: Playlist): string => {
  const all = useLibStore.getState().tracks
  const byId = new Map(all.map((t) => [t.id, t]))
  const tracks = playlist.trs
    .map((id) => byId.get(id))
    .filter((t): t is Track => !!t)
    .map((t) => ({ ...t, url: null })) // blob url сессионный — не сохраняем
  const bundle: ExportBundle = {
    version: 1,
    exported_at: new Date().toISOString(),
    playlists: [playlist],
    tracks,
  }
  return JSON.stringify(bundle, null, 2)
}

/**
 * Собрать bundle ВСЕХ плейлистов + всех треков, на которые они ссылаются
 *. Для раздела «Данные».
 */
export const buildExportAllBundle = (): string => {
  const playlists = usePlaylistStore.getState().playlists
  const all = useLibStore.getState().tracks
  const byId = new Map(all.map((t) => [t.id, t]))
  const usedIds = new Set<string>()
  for (const p of playlists) for (const id of p.trs) usedIds.add(id)
  const tracks = [...usedIds]
    .map((id) => byId.get(id))
    .filter((t): t is Track => !!t)
    .map((t) => ({ ...t, url: null }))
  const bundle: ExportBundle = {
    version: 1,
    exported_at: new Date().toISOString(),
    playlists,
    tracks,
  }
  return JSON.stringify(bundle, null, 2)
}

/**
 * Импорт: восстанавливает треки (которых ещё нет в библиотеке) + создаёт
 * плейлисты с НОВЫМИ id (чтобы не конфликтовать с существующими — со
 * старого). Возвращает счётчики или null при невалидном JSON.
 */
export const importPlaylistData = (
  content: string,
): { playlists: number; tracks: number } | null => {
  let parsed: Partial<ExportBundle>
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  const pls = Array.isArray(parsed.playlists) ? parsed.playlists : []
  if (!pls.length) return { playlists: 0, tracks: 0 }

  // Восстанавливаем треки, которых ещё нет (merge по id).
  const existing = new Set(useLibStore.getState().tracks.map((t) => t.id))
  const toAdd: Track[] = []
  for (const t of Array.isArray(parsed.tracks) ? parsed.tracks : []) {
    if (!t || typeof t.id !== 'string' || existing.has(t.id)) continue
    toAdd.push({ ...t, url: null })
  }
  if (toAdd.length) {
    useLibStore.getState().addTracks(toAdd)
    // ВАЖНО: персистим meta в IDB, иначе импортированные треки живут только в
    // памяти и пропадают после перезахода (плейлисты ссылались бы на «мёртвые»
    // id). — импорт сохранял треки в БД. Blob не пакуется:
    // SC/Yandex резолвят стрим по id, folder/uploaded — по своим источникам.
    for (const t of toAdd) void idbSaveMeta(t).catch((e) => console.warn('idbSaveMeta (import) failed', e))
  }

  // Создаём плейлисты с новыми id, сохраняя список треков.
  const plStore = usePlaylistStore.getState()
  let added = 0
  for (const p of pls) {
    if (!p || typeof p.name !== 'string') continue
    const created = plStore.createPl(p.name, p.desc, p.cover ?? undefined)
    const trs = Array.isArray(p.trs) ? p.trs.filter((x) => typeof x === 'string') : []
    if (trs.length) usePlaylistStore.getState().reorderPlTracks(created.id, trs)
    added++
  }
  return { playlists: added, tracks: toAdd.length }
}
