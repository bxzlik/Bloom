import type { Track } from '@entities/track'
import { invoke } from '@shared/tauri'
import { getProvider } from '../model/registry'

/**
 * Общий «бридж на SoundCloud» для площадок без собственного стрима (YouTube
 * Music, Spotify). YouTube требует PoToken/cookies, Spotify не отдаёт стрим в
 * принципе — поэтому, мы берём
 * метаданные площадки, а звук — из SoundCloud: ищем тот же трек по «название +
 * артист» и берём лучший матч по пересечению токенов.
 *
 * Возвращает SC-`Track` (уже в реестре — `scProvider.search` его кладёт) либо
 * null, если SoundCloud не зарегистрирован или совпадение не найдено. Вызывающий
 * сам резолвит стрим матча (`resolvePlayableUrl`) — так бридж не зависит от
 * плеера и живёт в слое провайдеров.
 */
export const bridgeMatch = async (t: Track): Promise<Track | null> => {
  const sc = getProvider('soundcloud')
  if (!sc) return null
  const res = await sc.search(`${t.name} ${t.artist}`.trim())
  const match = pickMatch(res.tracks ?? [], t)
  // Диагностика: в общий лог (ui_log) пишем, какой SC-трик подставил бридж.
  void invoke('ui_log', {
    msg: match
      ? `[bridge] "${t.name}" — ${t.artist} → SC: "${match.name}" — ${match.artist} (${match.id})`
      : `[bridge] "${t.name}" — ${t.artist} → SC: совпадение не найдено`,
  }).catch(() => {})
  return match
}

/** Нормализация для сравнения: lower, без скобок, только буквы/цифры. */
const normMatch = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .trim()

/**
 * Лучшее совпадение трека среди кандидатов по пересечению токенов
 * «название+артист». Зеркало `pickPlatformMatch` из плеера (switchPlatform).
 */
const pickMatch = (cands: Track[], cur: Track): Track | null => {
  if (!cands.length) return null
  const curTokens = new Set(
    `${normMatch(cur.name)} ${normMatch(cur.artist)}`.split(' ').filter(Boolean),
  )
  let best = cands[0]!
  let bestScore = -1
  for (const c of cands) {
    const tokens = `${normMatch(c.name)} ${normMatch(c.artist)}`.split(' ').filter(Boolean)
    let hit = 0
    for (const tk of tokens) if (curTokens.has(tk)) hit++
    const score = hit / Math.max(1, curTokens.size)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}
