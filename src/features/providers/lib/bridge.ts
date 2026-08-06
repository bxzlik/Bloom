import type { Track } from '@entities/track'
import { invoke } from '@shared/tauri'
import { getProvider } from '../model/registry'

/**
 * Общий «бридж на SoundCloud» — запасной путь для площадок, когда собственный
 * стрим недоступен (YTM: гео-блок, приватное видео). Берём метаданные площадки,
 * а звук — из SoundCloud: ищем тот же трек по «название + артист» и берём
 * лучший матч по пересечению токенов, если он проходит порог достоверности.
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

/** «m:ss» / «h:mm:ss» → секунды (0, если не разобрать). */
const durSec = (d: string): number => {
  const parts = (d || '').split(':').map(Number)
  if (parts.some(Number.isNaN) || !parts.length) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** Ниже этой доли совпавших токенов матч считаем ложным. */
const MIN_SCORE = 0.6
/** Допустимое расхождение длительности, секунды. */
const MAX_DUR_DELTA = 5

/**
 * Лучшее совпадение трека среди кандидатов по пересечению токенов
 * «название+артист». Зеркало `pickPlatformMatch` из плеера (switchPlatform).
 *
 * Возвращает null, если ничего не дотянуло до `MIN_SCORE`: лучше честно сказать
 * «трек недоступен», чем проиграть кавер или чужую песню. Длительность —
 * второй фильтр: он отсекает часовые сборники и ремиксы с тем же названием
 * (у кандидата или оригинала она может быть неизвестна — тогда не проверяем).
 */
const pickMatch = (cands: Track[], cur: Track): Track | null => {
  if (!cands.length) return null
  const curTokens = new Set(
    `${normMatch(cur.name)} ${normMatch(cur.artist)}`.split(' ').filter(Boolean),
  )
  const want = durSec(cur.dur)

  let best: Track | null = null
  let bestScore = 0
  for (const c of cands) {
    const got = durSec(c.dur)
    if (want && got && Math.abs(want - got) > MAX_DUR_DELTA) continue

    const tokens = `${normMatch(c.name)} ${normMatch(c.artist)}`.split(' ').filter(Boolean)
    let hit = 0
    for (const tk of tokens) if (curTokens.has(tk)) hit++
    const score = hit / Math.max(1, curTokens.size)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return bestScore >= MIN_SCORE ? best : null
}
