import { useMemo } from 'react'
import { create } from 'zustand'
import { dictionaries, ru, type TranslationKey } from './dict'

/**
 * Локаль интерфейса. Хранится без persistence в Rust — только
 * `localStorage[bloom_locale]` (по аналогии с темой, см. themeStore).
 *
 * Дефолт определяется один раз при старте: сохранённое значение → язык ОС
 * (`navigator.language`) → `ru`. Переключатель живёт в разделе настроек
 * «Интерфейс» (InterfaceSection).
 */

export type Locale = 'ru' | 'en'

export const LOCALES: { id: Locale; labelKey: TranslationKey; code: string }[] = [
  { id: 'en', labelKey: 'settings.interface.language.en', code: 'EN' },
  { id: 'ru', labelKey: 'settings.interface.language.ru', code: 'RU' },
]

const LS_KEY = 'bloom_locale'

const detectLocale = (): Locale => {
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved === 'ru' || saved === 'en') return saved
  } catch {
    /* localStorage недоступен — игнор */
  }
  // По умолчанию — английский (пока пользователь не выбрал язык сам).
  return 'en'
}

type Vars = Record<string, string | number>

/**
 * Подстановка `{name}`-плейсхолдеров. Отсутствующие переменные оставляем как есть
 * (видимый `{name}` сигналит о пропущенном аргументе).
 */
const interpolate = (str: string, vars?: Vars): string =>
  vars ? str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : str

export type TFunc = (key: TranslationKey, vars?: Vars) => string

/** Собрать `t`-функцию для конкретной локали. Фолбэк: локаль → ru → сам ключ. */
export const makeT = (locale: Locale): TFunc => {
  const dict = dictionaries[locale]
  return (key, vars) => interpolate(dict[key] ?? ru[key] ?? key, vars)
}

interface I18nState {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const useI18nStore = create<I18nState>((set) => ({
  locale: detectLocale(),
  setLocale: (l) => {
    try {
      localStorage.setItem(LS_KEY, l)
    } catch {
      /* full → ignore */
    }
    document.documentElement.lang = l
    set({ locale: l })
  },
}))

/** Текущая локаль (реактивно). */
export const useLocale = (): Locale => useI18nStore((s) => s.locale)

/** Реактивный `t` для компонентов — перерисовывает при смене языка. */
export const useT = (): TFunc => {
  const locale = useI18nStore((s) => s.locale)
  return useMemo(() => makeT(locale), [locale])
}

/**
 * Нереактивный `t` для использования вне React (тосты, утилиты).
 * Не вызывает перерисовку — берёт локаль из стора в момент вызова.
 */
export const t: TFunc = (key, vars) => makeT(useI18nStore.getState().locale)(key, vars)

/** Применить `lang` к <html> при старте. Подключается в App.tsx. */
export const initLocaleAttr = (): void => {
  document.documentElement.lang = useI18nStore.getState().locale
}
