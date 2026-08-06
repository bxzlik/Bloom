import type { Track } from '@entities/track'

/**
 * Сопоставление одного и того же трека на РАЗНЫХ площадках — общий матчер для
 * массовых операций (перенос плейлиста). В отличие от `pickMatch` в bridge.ts
 * (там достаточно «да/нет» для одной подмены звука) здесь нужен РАНЖИРОВАННЫЙ
 * список кандидатов со счётом: спорные случаи уходят пользователю на ручной
 * выбор, поэтому важно не только «лучший», но и «кто ещё был похож».
 *
 * Счёт = 0.65 × похожесть названия + 0.35 × похожесть артиста, с поправкой на
 * длительность. Названия и артисты считаются по-разному намеренно:
 * - название сравнивается симметрично (Жаккар): лишние слова у кандидата
 *   («… (Sped Up)», «… — Live») ДОЛЖНЫ штрафоваться, это чаще всего другая версия;
 * - артист — по вложенности (|A∩B| / min): «Artist A, Artist B» на одной площадке
 *   и «Artist A» на другой — тот же трек, штрафовать не за что.
 */

/** Нормализация: lower, без скобочных уточнений, только буквы/цифры. */
const norm = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()

/** Шумовые слова, которые сами по себе не делают трек другим. */
const NOISE = new Set([
  'feat', 'ft', 'featuring', 'prod', 'by', 'the', 'a', 'an', 'and', 'и',
  'official', 'audio', 'video', 'lyrics', 'hd', 'hq',
  'remaster', 'remastered', 'version', 'edition', 'bonus', 'track',
])

const tokens = (s: string): string[] =>
  norm(s).split(' ').filter((w) => w && !NOISE.has(w))

/** «m:ss» / «h:mm:ss» → секунды (0 — длительность неизвестна). */
export const durToSec = (d: string): number => {
  const parts = (d || '').split(':').map(Number)
  if (!parts.length || parts.some(Number.isNaN)) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** Жаккар по множествам токенов (1 — совпали полностью, 0 — не пересеклись). */
const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

/** Вложенность: доля меньшего множества, попавшая в большее. */
const containment = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / Math.min(a.size, b.size)
}

/**
 * Счёт похожести кандидата на исходный трек, 0..1.
 *
 * Длительность — множитель, а не слагаемое: расхождение больше `HARD_DUR_DELTA`
 * почти всегда означает другую вещь (микс, часовая сборка, «slowed»), и никакое
 * совпадение названий этого не перевешивает. Если у кого-то длительность
 * неизвестна (0) — множитель не применяем.
 */
export const matchScore = (cand: Track, src: Track): number => {
  const nameA = new Set(tokens(src.name))
  const nameB = new Set(tokens(cand.name))
  const artA = new Set(tokens(src.artist))
  const artB = new Set(tokens(cand.artist))

  // Артист может быть склеен с названием (частая беда YTM-видео: «Artist - Song»).
  // Даём второй шанс: ищем токены артиста ещё и в названии кандидата.
  const artScore = Math.max(
    containment(artA, artB),
    artA.size ? containment(artA, new Set([...nameB, ...artB])) * 0.9 : 0,
  )

  let score = 0.65 * jaccard(nameA, nameB) + 0.35 * artScore

  const want = durToSec(src.dur)
  const got = durToSec(cand.dur)
  if (want && got) {
    const delta = Math.abs(want - got)
    if (delta > HARD_DUR_DELTA) score *= 0.35
    else if (delta > SOFT_DUR_DELTA) score *= 0.8
    else score = Math.min(1, score + 0.05)
  }
  return score
}

/** Расхождение длительности, после которого счёт почти обнуляется, секунды. */
const HARD_DUR_DELTA = 20
/** Расхождение, за которое лишь слегка штрафуем (разные мастеринги/тишина в конце). */
const SOFT_DUR_DELTA = 5

/** Кандидат с посчитанным счётом. */
export interface ScoredMatch {
  track: Track
  score: number
}

/**
 * Отранжировать выдачу площадки относительно исходного трека.
 * Возвращает не более `limit` кандидатов со счётом ≥ `min`, лучший первым.
 */
export const rankMatches = (
  cands: Track[],
  src: Track,
  opts?: { limit?: number; min?: number },
): ScoredMatch[] => {
  const min = opts?.min ?? 0
  const limit = opts?.limit ?? 5
  return cands
    .map((track) => ({ track, score: matchScore(track, src) }))
    .filter((m) => m.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
