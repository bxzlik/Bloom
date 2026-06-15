/** Склонение «N треков / трека / трек» (русский). */
export const tracksLabel = (n: number): string => {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs >= 11 && abs <= 14) return `${n} треков`
  if (last === 1) return `${n} трек`
  if (last >= 2 && last <= 4) return `${n} трека`
  return `${n} треков`
}

/** Склонение «N записей / записи / запись». */
export const recordsLabel = (n: number): string => {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs >= 11 && abs <= 14) return `${n} записей`
  if (last === 1) return `${n} запись`
  if (last >= 2 && last <= 4) return `${n} записи`
  return `${n} записей`
}

/** Парсит «M:SS» / «H:MM:SS» в секунды. Пустые/невалидные → 0. */
export const parseDurSec = (d: string | undefined): number => {
  if (!d || d === '—') return 0
  const parts = d.split(':').map((s) => Number(s))
  if (parts.some(Number.isNaN)) return 0
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0)
  if (parts.length === 3)
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)
  return parts[0] || 0
}

/** Сумма длительностей по массиву dur-строк → секунды. */
export const sumDurations = (durs: (string | undefined)[]): number => {
  let s = 0
  for (const d of durs) s += parseDurSec(d)
  return s
}

/**
 * Форматирует секунды как «1ч 23м» / «45 мин». Не для шкалы прогресса трека (там HH:MM:SS) — только для
 * человекочитаемых длительностей в sub-line'ах библиотеки/плеер-меню.
 */
export const fmtTotalDur = (sec: number): string => {
  if (!Number.isFinite(sec) || sec <= 0) return '0 мин'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}ч ${m}м`
  return `${m} мин`
}

/** «N треков · 1:23:45». Если total=0 — только склонение без хвоста. */
export const tracksAndDuration = (count: number, totalSec: number): string => {
  const left = tracksLabel(count)
  if (totalSec <= 0) return left
  return `${left} · ${fmtTotalDur(totalSec)}`
}

/**
 * Группировочный label для записи истории.
 * «Сегодня» / «Вчера» / «N дней назад» / «Неделю назад» / «15 марта».
 */
export const historyLabel = (ts: number, now: number = Date.now()): string => {
  const DAY = 86400000
  const todayKey = new Date(now).toISOString().slice(0, 10)
  const yesterdayKey = new Date(now - DAY).toISOString().slice(0, 10)
  const key = new Date(ts).toISOString().slice(0, 10)
  if (key === todayKey) return 'Сегодня'
  if (key === yesterdayKey) return 'Вчера'
  const days = Math.floor((now - ts) / DAY)
  if (days < 7) {
    const d = days % 10
    const d100 = days % 100
    if (d === 1 && d100 !== 11) return `${days} день назад`
    if (d >= 2 && d <= 4 && (d100 < 10 || d100 >= 20)) return `${days} дня назад`
    return `${days} дней назад`
  }
  if (days < 14) return 'Неделю назад'
  return new Date(ts).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
}

/** «18:32» — час и минуты по локальной зоне. */
export const historyTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
