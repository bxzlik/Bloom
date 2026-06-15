import { trackRegistry } from '@entities/track'
import { useHistoryStore, useLibStore } from '../model'

/**
 * Реактивно отдаёт число ВИДИМЫХ записей истории — тех, что резолвятся в
 * существующий трек (библиотека → trackRegistry).
 * `playHistory.filter(e=>!!_trackById(e.id)).length`: счётчик в
 * сайдбаре/сетке должен совпадать с тем, что реально показывает вид «История»
 * (filterByMode 'history' тоже резолвит и скипает удалённые/недоступные).
 *
 * Подписка на entries + tracks (registry — не реактивный Map, но он наполняется
 * при поиске/проигрывании, что и так триггерит ре-рендер этих экранов).
 */
export const usePlayHistoryCount = (): number => {
  const entries = useHistoryStore((s) => s.entries)
  const tracks = useLibStore((s) => s.tracks)
  const byId = new Set(tracks.map((t) => t.id))
  return entries.reduce(
    (n, e) => (byId.has(e.id) || trackRegistry.get(e.id) ? n + 1 : n),
    0,
  )
}
