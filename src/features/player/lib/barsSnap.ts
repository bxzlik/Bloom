/**
 * Пиксельная подгонка эквалайзера «сейчас играет» (`.bars`).
 *
 * ПРОБЛЕМА. Полосы кажутся разной толщины, когда ширина полосы и шаг между
 * полосами дают ДРОБНОЕ число устройственных пикселей. Множитель — это
 * devicePixelRatio (масштаб системы) × зум вебвью (`setzoom`/`setwinzoom`,
 * свободный процент в настройках). При множителе 1.15 полоса 4px это 4.6
 * устройственных px: соседние полосы попадают на разные субпиксельные фазы, и
 * браузер размывает их по-разному — одна выглядит толще другой.
 *
 * Подобрать константы под это нельзя: зум задаётся слайдером, значений
 * бесконечно много. Поэтому величины считаются в рантайме — берём базовый
 * размер в CSS-px, округляем до целого числа устройственных пикселей и делим
 * обратно на множитель. Итог: и полоса, и шаг ложатся ровно на пиксельную
 * сетку при любом зуме, все три полосы одинаковы.
 *
 * Высота и радиус не участвуют: по вертикали торцы скруглены, субпиксель там
 * не читается.
 *
 * Значения пишутся инлайном в `documentElement`, поэтому перебивают дефолты из
 * `:root` в library.css. Дефолты остаются рабочим фоллбэком — до первого вызова
 * и в зеркальных окнах, где этот модуль не поднимается.
 */

/** Базовые размеры в CSS-px: строки (`w`/`gap`) и крупные карточки (`*Lg`). */
const BASE = { w: 3, gap: 2, wLg: 5, gapLg: 4 } as const

/** Текущий множитель CSS-px → устройственные px (масштаб системы × зум вебвью). */
const scale = (): number => window.devicePixelRatio || 1

/** CSS-px, дающие целое число устройственных px при текущем масштабе. */
const snap = (css: number, s: number): string =>
  `${Math.round((Math.max(1, Math.round(css * s)) / s) * 1e4) / 1e4}px`

const apply = (): void => {
  const s = scale()
  const st = document.documentElement.style
  st.setProperty('--bars-w', snap(BASE.w, s))
  st.setProperty('--bars-gap', snap(BASE.gap, s))
  st.setProperty('--bars-w-lg', snap(BASE.wLg, s))
  st.setProperty('--bars-gap-lg', snap(BASE.gapLg, s))
}

/**
 * Поднять подгонку и следить за сменой масштаба. Возвращает функцию остановки.
 *
 * Зум и перенос окна на монитор с другим DPI меняют devicePixelRatio, но события
 * «dpr изменился» в вебвью нет: слушаем `resize` (он приходит и при зуме) и
 * media-query по текущему разрешению — она перестаёт совпадать ровно в момент
 * смены масштаба, после чего её приходится пересоздавать под новое значение.
 */
export const initBarsSnap = (): (() => void) => {
  let mq: MediaQueryList | null = null
  const onChange = (): void => {
    apply()
    watch()
  }
  const watch = (): void => {
    mq?.removeEventListener('change', onChange)
    mq = window.matchMedia(`(resolution: ${scale()}dppx)`)
    mq.addEventListener('change', onChange)
  }
  apply()
  watch()
  window.addEventListener('resize', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
    mq?.removeEventListener('change', onChange)
    mq = null
  }
}
