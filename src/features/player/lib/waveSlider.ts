/**
 * Волновой слайдер прогресса (тип слайдера «Волновой»).
 * `_initWave`/`_drawWaveBars`/`_drawWaveTo`/`_drawWave`.
 *
 * `waveData` — 120 псевдослучайных высот столбиков, генерируются заново на
 * каждый трек (детерминированной формы нет). Рисуем на
 * `<canvas>` внутри `.ps-bar-wrap`: столбики до позиции — акцентом, остальные —
 * плёнкой `--ovl-rgb` (см. `restColor`). Видимость канваса — через
 * `body.slider-wave` (CSS).
 */

let waveData: number[] | null = null

/** Сгенерировать новый узор волны (вызывать на смену трека). */
export const regenWave = (): void => {
  const n = 120
  const s1 = Math.random() * 10
  const s2 = Math.random() * 10
  const s3 = Math.random() * 10
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    const env =
      Math.abs(Math.sin(t * Math.PI * 4 + s1)) * 0.45 +
      Math.abs(Math.sin(t * Math.PI * 9 + s2)) * 0.35 +
      Math.abs(Math.sin(t * Math.PI * 17 + s3)) * 0.2
    out.push(2 + env * 16 + Math.random() * 3)
  }
  waveData = out
}

export const hasWaveData = (): boolean => waveData != null

const drawBars = (ctx: CanvasRenderingContext2D, h: number, bw: number): void => {
  if (!waveData) return
  for (let i = 0; i < waveData.length; i++) {
    const bh = waveData[i]!
    const x = i * bw
    const bwInner = Math.max(bw - 1.5, 1)
    const r = Math.min(bwInner / 2, bh / 2)
    const y = (h - bh) / 2
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x + 0.75, y, bwInner, bh, r)
    else ctx.rect(x + 0.75, y, bwInner, bh)
    ctx.fill()
  }
}

/**
 * Цвет НЕзаполненных столбиков.
 *
 * Раньше был зашит `rgba(255,255,255,.2)`: вдвое ярче любой другой дорожки в
 * приложении (`--track` — 4% плёнки) и невидим на светлой теме. Считаем сами из
 * `--ovl-rgb` — токен плёнки, который сам переворачивается (тёмная тема → белый,
 * светлая → чёрный) и переопределён на «тёмных островах». Берём его с канваса,
 * а не с :root, чтобы такие острова отработали.
 *
 * Ручка яркости — `--wave-rest-a` (по умолчанию .1). `--wave-rest` перебивает
 * всё целиком, но только литеральным цветом: canvas не умеет `var()`, а
 * `getPropertyValue` кастомного свойства отдаёт его нераскрытым.
 */
const restColor = (cs: CSSStyleDeclaration): string => {
  const explicit = cs.getPropertyValue('--wave-rest').trim()
  if (explicit && !explicit.includes('var(')) return explicit
  const rgb = cs.getPropertyValue('--ovl-rgb').trim() || '255,255,255'
  const a = cs.getPropertyValue('--wave-rest-a').trim() || '.1'
  return `rgba(${rgb},${a})`
}

/** Перерисовать волну на канвасе с заливкой до `pct` (0..100). */
export const drawWaveTo = (c: HTMLCanvasElement | null, pct: number): void => {
  if (!c || !waveData || !document.body.classList.contains('slider-wave')) return
  const rect = c.getBoundingClientRect()
  if (!rect.width) return
  const dpr = window.devicePixelRatio || 1
  const needW = Math.round(rect.width * dpr)
  const needH = Math.round(rect.height * dpr)
  if (c.width !== needW || c.height !== needH) {
    c.width = needW
    c.height = needH
  }
  const ctx = c.getContext('2d')
  if (!ctx) return
  const w = rect.width
  const h = rect.height
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const bw = w / waveData.length
  const splitX = (w * pct) / 100
  // Цвета берём с самого канваса, а не из :root: так поверхность может задать
  // свою палитру обычным CSS (фуллскрин — приглушённо-белая вместо акцентной,
  // см. --wave-fill в big-picture.css). По умолчанию — акцент, как было.
  const cs = getComputedStyle(c)
  const played =
    cs.getPropertyValue('--wave-fill').trim() ||
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
    '#888'
  ctx.fillStyle = restColor(cs)
  drawBars(ctx, h, bw)
  if (splitX > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, splitX, h)
    ctx.clip()
    ctx.fillStyle = played
    drawBars(ctx, h, bw)
    ctx.restore()
  }
}
