/**
 * Направление перехода для анимации смены трека (см. `TrackSwap`).
 *
 * +1 — «вперёд» (новый трек приезжает справа), −1 — «назад» (слева).
 *
 * Считается ОДИН раз на реальном переключении показа (`commitDisplay` в
 * `api/play.ts`), а не в компонентах: три поверхности (плеер, нижний бар,
 * фуллскрин) должны ехать в одну сторону, а вычислять её каждой самостоятельно
 * не из чего — к моменту рендера прошлый qIdx уже потерян.
 *
 * Приоритет: явный вызов `markSwapDir` из кнопок «назад/вперёд» (он корректен и
 * при закольцовке очереди, где сравнение индексов дало бы обратное), иначе —
 * сравнение qIdx с предыдущим переключением. Новая очередь (другая ссылка на
 * массив) = «вперёд»: индексы разных очередей несравнимы.
 */

type Dir = 1 | -1

let dir: Dir = 1
let explicit: Dir | null = null
let lastQueue: readonly string[] | null = null
let lastIdx = -1

/** Явно задать направление следующего переключения (кнопки «назад»/«вперёд»). */
export const markSwapDir = (d: Dir): void => {
  explicit = d
}

/**
 * Зафиксировать направление на момент переключения показа. Вызывается из
 * `commitDisplay`; `queue`/`qIdx` — состояние очереди уже ПОСЛЕ setQIdx.
 */
export const commitSwapDir = (queue: readonly string[], qIdx: number): void => {
  if (explicit) dir = explicit
  else if (lastQueue === queue && qIdx >= 0 && lastIdx >= 0) dir = qIdx < lastIdx ? -1 : 1
  else dir = 1
  explicit = null
  lastQueue = queue
  lastIdx = qIdx
}

/** Направление последнего переключения (читают слои анимации). */
export const getSwapDir = (): Dir => dir
