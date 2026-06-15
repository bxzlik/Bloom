import type { Track } from '@entities/track'

/**
 * Persist пользовательского порядка треков в библиотеке между запусками.
 *
 * Сохраняется только массив id'шников. На рестор: треки из IDB + folder_watcher
 * приходят в произвольном порядке, и мы переупорядочиваем их по сохранённому
 * списку. Неизвестные (новые) id — в конец, сохраняя их относительный порядок.
 *
 *: там был просто in-memory массив `tracks`, который
 * persisted в JSON при saveAll(). Мы храним отдельно только порядок,
 * чтобы не дублировать meta (она уже в IDB / Rust).
 */

const LS_KEY = 'bloom_lib_tracks_order'

export const loadTracksOrder = (): string[] => {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const saveTracksOrder = (ids: string[]): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids))
  } catch {
    // localStorage переполнен — игнорируем (порядок просто не сохранится).
  }
}

/**
 * Применяет сохранённый порядок к массиву треков. Треки не упомянутые в
 * сохранённом порядке — в конец, в их исходном порядке (новые приходящие).
 */
export const applyTracksOrder = (tracks: Track[]): Track[] => {
  const order = loadTracksOrder()
  if (!order.length) return tracks
  const byId = new Map(tracks.map((t) => [t.id, t]))
  const out: Track[] = []
  const seen = new Set<string>()
  for (const id of order) {
    const t = byId.get(id)
    if (t) {
      out.push(t)
      seen.add(id)
    }
  }
  for (const t of tracks) {
    if (!seen.has(t.id)) out.push(t)
  }
  return out
}
