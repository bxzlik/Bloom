/**
 * Периоды «Итогов»: месяц и год.
 *
 * Недели больше нет — за семь дней не набирается ничего, что стоило бы
 * показывать историей, и напоминание каждый понедельник быстро надоедало.
 *
 * Доступность у месяца и года РАЗНАЯ, и это главное правило файла:
 *   месяц — доступен ВСЕГДА (кнопка «Итоги месяца» в панели статистики),
 *           а 1-го числа, пока их не посмотрели, карточка статистики в профиле
 *           подменяется входом в итоги прошедшего месяца;
 *   год   — только с 21 по 31 декабря: вне окна отдельной плашки просто нет.
 *
 * Ручки тюнинга — константы ниже. Проверить год и напоминание вне окна можно
 * force-режимом (`localStorage.bloom_wrapped_force = '1'`).
 */

export type PeriodKind = 'month' | 'year'

/** День месяца, с которого предлагаем итоги прошедшего месяца. */
export const MONTH_WINDOW_DOM = 1
/** Окно «года»: с 21 декабря (месяц 0-based) по 31 декабря включительно. */
export const YEAR_WINDOW_FROM = { month: 11, day: 21 }
export const YEAR_WINDOW_TO = { month: 11, day: 31 }

/** Порядок «значимости»: где показаны оба, год идёт первым. */
export const PERIOD_ORDER: PeriodKind[] = ['year', 'month']

export interface PeriodRange {
  kind: PeriodKind
  /** Начало периода, включительно (локальная полночь). */
  from: number
  /** Конец периода, НЕ включительно. */
  to: number
}

/**
 * Границы периода. Месяц — ПРОШЕДШИЙ целиком (цифры окончательные, ничего не
 * дорастёт), год — текущий с 1 января по «сейчас» (так же делают площадки в
 * декабре).
 */
export const periodRange = (kind: PeriodKind, now: Date = new Date()): PeriodRange => {
  if (kind === 'month') {
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    // Режим проверки берёт ИДУЩИЙ месяц. Журнал копится только с обновления,
    // поэтому у прошедшего месяца сплошь и рядом ноль событий — и проверять
    // подмену карточки было бы нечем: итогов месяца просто не существует.
    if (forcedByLs()) return { kind, from: thisMonth.getTime(), to: now.getTime() }
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { kind, from: prev.getTime(), to: thisMonth.getTime() }
  }
  return { kind, from: new Date(now.getFullYear(), 0, 1).getTime(), to: now.getTime() }
}

/**
 * Режим проверки — скрытый флаг для девтулзы: считать, что окна показа идут
 * прямо сейчас. Без него итоги года видны только в декабре, а подмена карточки
 * гаснет после первого просмотра, и проверить их вёрстку было бы нечем.
 *
 *   localStorage.bloom_wrapped_force = '1'   — включить
 *   localStorage.removeItem('bloom_wrapped_force')  — выключить
 *   localStorage.removeItem('bloom_wrapped_seen')   — «ещё не смотрел»
 *
 * Тумблера в настройках намеренно нет: итоги не настраиваются, они случаются.
 */
export const forcedByLs = (): boolean => {
  try {
    return localStorage.getItem('bloom_wrapped_force') === '1'
  } catch {
    return false
  }
}

/** Идёт ли окно итогов года (21–31 декабря). Вне его плашки года нет вообще. */
export const inYearWindow = (now: Date = new Date()): boolean => {
  if (forcedByLs()) return true
  const m = now.getMonth()
  const d = now.getDate()
  if (m < YEAR_WINDOW_FROM.month || m > YEAR_WINDOW_TO.month) return false
  if (m === YEAR_WINDOW_FROM.month && d < YEAR_WINDOW_FROM.day) return false
  if (m === YEAR_WINDOW_TO.month && d > YEAR_WINDOW_TO.day) return false
  return true
}

/**
 * Наступило ли число, с которого предлагаем итоги месяца. Это НЕ «доступны ли
 * они» (смотреть месяц можно всегда) — только момент, когда карточка статистики
 * в профиле подменяется входом и когда уместно напоминание.
 */
export const inMonthWindow = (now: Date = new Date()): boolean =>
  forcedByLs() || now.getDate() >= MONTH_WINDOW_DOM

/**
 * О каких итогах «сегодня» уместно НАПОМНИТЬ. У месяца это ровно 1-е число (а не
 * весь месяц, как у подмены карточки): напоминание — событие, а не состояние.
 */
export const scheduledPeriods = (now: Date = new Date(), force = false): PeriodKind[] => {
  if (force || forcedByLs()) return [...PERIOD_ORDER]
  const out: PeriodKind[] = []
  if (inYearWindow(now)) out.push('year')
  if (now.getDate() === MONTH_WINDOW_DOM) out.push('month')
  return out
}

/**
 * Стабильный ключ периода («2026-07» / «2026») — им помечаем просмотренные
 * итоги: по нему карточка статистики понимает, что подменяться уже не нужно.
 */
export const periodKey = (r: PeriodRange): string => {
  const d = new Date(r.from)
  if (r.kind === 'year') return String(d.getFullYear())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const SEEN_KEY = 'bloom_wrapped_seen'
/** Про какие периоды уже кидали уведомление — чтобы не звенеть каждый запуск. */
const NOTIFIED_KEY = 'bloom_wrapped_notified'

const readMarks = (key: string): Record<string, string> => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '{}')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string>
  } catch {
    // повреждённый JSON — считаем, что отметок нет
  }
  return {}
}

const mark = (key: string, r: PeriodRange): void => {
  try {
    localStorage.setItem(key, JSON.stringify({ ...readMarks(key), [r.kind]: periodKey(r) }))
  } catch {
    // переполнение — не критично, метка просто не запомнится
  }
}

export const isPeriodSeen = (r: PeriodRange): boolean => readMarks(SEEN_KEY)[r.kind] === periodKey(r)
export const markPeriodSeen = (r: PeriodRange): void => mark(SEEN_KEY, r)

/**
 * Уведомление про конкретный период кидаем один раз: список уведомлений живёт
 * только в сессии, а метка — в localStorage, поэтому перезапуск приложения в тот
 * же день не звенит повторно.
 */
export const isPeriodNotified = (r: PeriodRange): boolean =>
  readMarks(NOTIFIED_KEY)[r.kind] === periodKey(r)
export const markPeriodNotified = (r: PeriodRange): void => mark(NOTIFIED_KEY, r)


/**
 * Подпись диапазона: «Июль 2026» / «2026».
 * Месяц идёт с заглавной — это заголовок, а toLocaleDateString даёт строчную.
 */
export const periodDatesLabel = (r: PeriodRange, locale: string): string => {
  const from = new Date(r.from)
  if (r.kind === 'year') return String(from.getFullYear())
  // Собираем руками: у ru-локали `{month, year}` даёт «август 2026 г.» — «г.» лишнее.
  const mon = from.toLocaleDateString(locale, { month: 'long' })
  return `${mon.charAt(0).toUpperCase()}${mon.slice(1)} ${from.getFullYear()}`
}
