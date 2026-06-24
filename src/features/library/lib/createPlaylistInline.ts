import type { Track } from '@entities/track'
import { t as tFn } from '@shared/i18n'
import { usePlaylistStore } from '../model/playlistStore'
import { useLibStore } from '../model/store'
import { usePlEditStore } from '../model/plEditStore'
import { saveTrackToLibrary } from './saveToLibrary'

/**
 * «Мгновенное» создание плейлиста вместо модалки: сразу создаёт плейлист с
 * именем по умолчанию, открывает его в библиотеке и включает inline-редактор в
 * шапке (`startEdit(..., isNew=true)`) — имя выделено, можно сразу переименовать.
 * Если редактирование отменят, а плейлист так и остался пустым, `LibContent`
 * удалит его как брошенный (см. флаг `isNew`).
 *
 * Для трековых сценариев («добавить в новый плейлист»): передаём `track`
 * (registry-трек, который может быть ещё не в библиотеке — сохраним его) или уже
 * библиотечный `trackId`. Навигацию на вкладку библиотеки (`goNav('lib')`) делает
 * вызывающая сторона — помощник не зависит от app-слоя.
 *
 * @returns id созданного плейлиста.
 */
export function createPlaylistInline(opts?: { trackId?: string; track?: Track }): string {
  const ps = usePlaylistStore.getState()
  const pl = ps.createPl(tFn('lib.newpl.newTitle'))

  let trackId = opts?.trackId
  if (opts?.track) {
    saveTrackToLibrary(opts.track) // идемпотентно: если уже в библиотеке — no-op
    trackId = opts.track.id
  }
  if (trackId) ps.addTrackToPl(pl.id, trackId)

  useLibStore.getState().selectPlaylist(pl.id)
  usePlEditStore.getState().startEdit(pl.id, true)
  return pl.id
}

/**
 * Создать плейлист с УЖЕ введённым именем (inline-поле «+» в сайдбаре) — в
 * отличие от `createPlaylistInline` не открывает inline-редактор имени (имя уже
 * задано пользователем) и не помечает плейлист как `isNew` (его не удалят, даже
 * если он останется пустым). Сразу открывает его в библиотеке.
 *
 * @returns id созданного плейлиста.
 */
export function createNamedPlaylist(name: string): string {
  const title = name.trim() || tFn('lib.newpl.newTitle')
  const pl = usePlaylistStore.getState().createPl(title)
  useLibStore.getState().selectPlaylist(pl.id)
  return pl.id
}
