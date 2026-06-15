/**
 * Парсер LRC-формата (синхронизированный текст).
 * `LyricsController._parseLrc` / `_stripLrc`.
 */

export interface LrcLine {
  /** Секунды от начала трека. */
  time: number
  text: string
}

/** Разбирает `[mm:ss.xx]текст` построчно → отсортированный массив строк. */
export const parseLrc = (lrc: string): LrcLine[] => {
  const lines: LrcLine[] = []
  lrc.split('\n').forEach((row) => {
    const m = row.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/)
    if (!m) return
    const txt = m[3]!.trim()
    if (txt) lines.push({ time: parseInt(m[1]!, 10) * 60 + parseFloat(m[2]!), text: txt })
  })
  return lines.sort((a, b) => a.time - b.time)
}

/** Убирает временные теги — превращает LRC в обычный текст. */
export const stripLrc = (s: string): string =>
  s.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim()
