/** Секунды → "m:ss" или "h:mm:ss". Отрицательные и NaN → "0:00". */
export const formatTime = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = s.toString().padStart(2, '0')
  if (h > 0) {
    const mm = m.toString().padStart(2, '0')
    return `${h}:${mm}:${ss}`
  }
  return `${m}:${ss}`
}
