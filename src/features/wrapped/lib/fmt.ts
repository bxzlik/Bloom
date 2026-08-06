import { t, type TranslationKey } from '@shared/i18n'

/**
 * Числительные для «Итогов». В приложении нет общего plural-хелпера (компоненты
 * ветвятся по локали руками), но здесь чисел много — держим одно место.
 *
 * Русский: 3 формы (1 трек / 2 трека / 5 треков), английский: 2 (форма few не
 * используется — в en-словаре она совпадает с many).
 */

export type PluralNoun = 'plays' | 'tracks' | 'artists' | 'days' | 'hours' | 'minutes'

const ruForm = (n: number): 'one' | 'few' | 'many' => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'one'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few'
  return 'many'
}

/** Только слово, без числа («треков»). */
export const pluralWord = (locale: string, n: number, noun: PluralNoun): string => {
  const form = locale === 'ru' ? ruForm(n) : n === 1 ? 'one' : 'many'
  return t(`wrapped.n.${noun}.${form}` as TranslationKey)
}

/** Число + слово («128 треков»). */
export const plural = (locale: string, n: number, noun: PluralNoun): string =>
  `${n.toLocaleString(locale)} ${pluralWord(locale, n, noun)}`

/**
 * Время прослушивания: «12 часов 34 минуты», «45 минут», «меньше минуты».
 * Секунды не показываем — это оценка, а не секундомер.
 */
export const fmtListenTime = (locale: string, sec: number): string => {
  const totalMin = Math.round(sec / 60)
  if (totalMin < 1) return t('wrapped.time.lessThanMin')
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (!h) return plural(locale, m, 'minutes')
  if (!m) return plural(locale, h, 'hours')
  return `${plural(locale, h, 'hours')} ${plural(locale, m, 'minutes')}`
}

/** «14:00 — 15:00» для любимого часа. */
export const fmtHourRange = (hour: number): string =>
  `${String(hour).padStart(2, '0')}:00 — ${String((hour + 1) % 24).padStart(2, '0')}:00`
