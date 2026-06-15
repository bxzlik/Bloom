/**
 * Волновой слайдер прогресса (тип слайдера «Волновой»).
 * `_initWave`/`_drawWaveBars`/`_drawWaveTo`/`_drawWave`.
 *
 * `waveData` — 120 псевдослучайных высот столбиков, генерируются заново на
 * каждый трек (детерминированной формы нет). Рисуем на
 * `<canvas>` внутри `.ps-bar-wrap`: столбики до позиции — акцентом, остальные —
 * полупрозрачным белым. Видимость канваса — через `body.slider-wave` (CSS).
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
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#888'
  ctx.fillStyle = 'rgba(255,255,255,.2)'
  drawBars(ctx, h, bw)
  if (splitX > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, splitX, h)
    ctx.clip()
    ctx.fillStyle = accent
    drawBars(ctx, h, bw)
    ctx.restore()
  }
}
