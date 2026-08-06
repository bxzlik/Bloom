/**
 * Периоды «Итогов» и расписание их показа.
 *
 * Итоги нельзя показывать посреди периода — год ещё не прошёл, неделя не
 * кончилась. Поэтому у каждого периода есть ОКНО показа, как у площадок:
 *   неделя — каждый понедельник (итоги прошлой недели, пн–вс);
 *   месяц  — 1-е число (итоги прошлого месяца);
 *   год    — с 21 декабря по 31-е (итоги текущего года).
 *
 * Ручки тюнинга — константы ниже. Проверить UI вне окна можно force-режимом
 * (uiPrefs.wrappedAlways либо `localStorage.bloom_wrapped_force = '1'`).
 */

export type PeriodKind = 'week' | 'month' | 'year'

/** День недели окна «недели»: 1 = понедельник (как Date.getDay()). */
export const WEEK_WINDOW_DOW = 1
/** День месяца окна «месяца». */
export const MONTH_WINDOW_DOM = 1
/** Окно «года»: с 21 декабря (месяц 0-based) по 31 декабря включительно. */
export const YEAR_WINDOW_FROM = { month: 11, day: 21 }
export const YEAR_WINDOW_TO = { month: 11, day: 31 }

/**
 * Порядок «значимости»: в пикере и в подписи кружка год важнее месяца, месяц —
 * недели (1 января доступны все три сразу).
 */
export const PERIOD_ORDER: PeriodKind[] = ['year', 'month', 'week']

export interface PeriodRange {
  kind: PeriodKind
  /** Начало периода, включительно (локальная полночь). */
  from: number
  /** Конец периода, НЕ включительно. */
  to: number
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Понедельник той недели, в которую попадает d (локальная полночь). */
const startOfWeek = (d: Date): Date => {
  const s = startOfDay(d)
  // getDay(): вс = 0 → сдвиг 6, пн = 1 → 0.
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
  return s
}

/**
 * Границы периода. Неделя и месяц — ПРОШЕДШИЕ (завершённые) целиком, год —
 * текущий с 1 января по «сейчас» (так же делают Spotify/Яндекс в декабре).
 */
export const periodRange = (kind: PeriodKind, now: Date = new Date()): PeriodRange => {
  if (kind === 'week') {
    const thisWeek = startOfWeek(now)
    const prev = new Date(thisWeek)
    prev.setDate(prev.getDate() - 7)
    return { kind, from: prev.getTime(), to: thisWeek.getTime() }
  }
  if (kind === 'month') {
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { kind, from: prev.getTime(), to: thisMonth.getTime() }
  }
  return { kind, from: new Date(now.getFullYear(), 0, 1).getTime(), to: now.getTime() }
}

const inYearWindow = (now: Date): boolean => {
  const m = now.getMonth()
  const d = now.getDate()
  if (m < YEAR_WINDOW_FROM.month || m > YEAR_WINDOW_TO.month) return false
  if (m === YEAR_WINDOW_FROM.month && d < YEAR_WINDOW_FROM.day) return false
  if (m === YEAR_WINDOW_TO.month && d > YEAR_WINDOW_TO.day) return false
  return true
}

/** Скрытый флаг для проверки итогов вне расписания (девтулза/автотесты). */
export const forcedByLs = (): boolean => {
  try {
    return localStorage.getItem('bloom_wrapped_force') === '1'
  } catch {
    return false
  }
}

/** Какие итоги «сегодня» уместно показывать. force — игнорировать расписание. */
export const availablePeriods = (now: Date = new Date(), force = false): PeriodKind[] => {
  if (force || forcedByLs()) return [...PERIOD_ORDER]
  const out: PeriodKind[] = []
  if (inYearWindow(now)) out.push('year')
  if (now.getDate() === MONTH_WINDOW_DOM) out.push('month')
  if (now.getDay() === WEEK_WINDOW_DOW) out.push('week')
  return out
}

/**
 * Стабильный ключ периода («2026-W31» / «2026-07» / «2026») — им помечаем
 * просмотренные итоги, чтобы кольцо кружка гасло, как у сторис.
 */
export const periodKey = (r: PeriodRange): string => {
  const d = new Date(r.from)
  if (r.kind === 'year') return String(d.getFullYear())
  if (r.kind === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  // Номер ISO-недели от начала периода (понедельника).
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const jan1 = new Date(t.getFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7)
  return `${t.getFullYear()}-W${String(week).padStart(2, '0')}`
}

const SEEN_KEY = 'bloom_wrapped_seen'

const readSeen = (): Record<string, string> => {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string>
  } catch {
    // повреждённый JSON — считаем, что ничего не просмотрено
  }
  return {}
}

export const isPeriodSeen = (r: PeriodRange): boolean => readSeen()[r.kind] === periodKey(r)

export const markPeriodSeen = (r: PeriodRange): void => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [r.kind]: periodKey(r) }))
  } catch {
    // переполнение — не критично, кольцо просто останется «непросмотренным»
  }
}

/**
 * Подпись диапазона: «28 июля — 3 августа» / «Июль» / «2026».
 * Месяц идёт с заглавной — это заголовок, а toLocaleDateString даёт строчную.
 */
export const periodDatesLabel = (r: PeriodRange, locale: string): string => {
  const from = new Date(r.from)
  if (r.kind === 'year') return String(from.getFullYear())
  if (r.kind === 'month') {
    // Собираем руками: у ru-локали `{month, year}` даёт «август 2026 г.» — «г.» лишнее.
    const mon = from.toLocaleDateString(locale, { month: 'long' })
    return `${mon.charAt(0).toUpperCase()}${mon.slice(1)} ${from.getFullYear()}`
  }
  const to = new Date(r.to - 1)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
  // Внутри одного месяца хватит одного его упоминания: «3 — 9 августа».
  if (from.getMonth() === to.getMonth()) {
    return `${from.getDate()} — ${to.toLocaleDateString(locale, opts)}`
  }
  return `${from.toLocaleDateString(locale, opts)} — ${to.toLocaleDateString(locale, opts)}`
}
