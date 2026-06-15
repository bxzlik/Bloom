/** Парс длительности "м:сс" / "ч:мм:сс" → секунды. _parseDur. */
export const parseDur = (s: string | undefined): number => {
  if (!s || s === '—') return 0
  const p = s.split(':').map(Number)
  if (p.some((n) => Number.isNaN(n))) return 0
  if (p.length === 2) return p[0]! * 60 + p[1]!
  if (p.length === 3) return p[0]! * 3600 + p[1]! * 60 + p[2]!
  return 0
}

/** Короткий формат длительности: "Nч Nм" / "N мин". _fmtDurLong. */
export const fmtDurLong = (secs: number): string => {
  if (!secs) return '0 мин'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}ч ${m}м`
  return `${m} мин`
}
