/**
 * Визуализатор (анимация частот под музыку). `_vizInit`/
 * `_vizStart`/`_vizStop`/`_vizDraw`. Анализатор берётся из
 * общего аудио-графа (`audioGraph`) — он же обслуживает нормализацию/кроссфейд,
 * т.к. `createMediaElementSource` можно звать на элемент лишь ОДИН раз.
 *
 * Два вида (`vizType` в playerViewStore):
 *   - bars — спектр столбцами (зеркально от центра, скруглённые, с бликом).
 *   - wave — плавная симметричная волна (осциллограф-подобная) с ярким центром.
 *
 * ВАЖНО (CORS): граф маршрутизирует ВЕСЬ звук через WebAudio. Если ресурс
 * кросс-доменный без CORS-заголовков (элемент грузился без crossOrigin),
 * узел отдаёт тишину → звук пропадёт. audioEngine ставит crossOrigin='anonymous'
 * для http(s) (SC CDN отдаёт CORS), для blob/local — нет.
 */
import { ensureAudioGraph, resumeAudioGraph, getAnalyserNode } from './audioGraph'
import { usePlayerViewStore } from '@/features/settings/model/playerViewStore'

let raf = 0
let canvasEl: HTMLCanvasElement | null = null
// Временное сглаживание (lerp кадр-к-кадру) — устраняет «дёрганье» спектра.
// Размер подстраивается под число точек активного вида; сброс при смене вида.
let smooth: Float32Array | null = null
let smoothMode = ''

/** Зарегистрировать (или снять) канвас визуализатора. */
export const vizSetCanvas = (c: HTMLCanvasElement | null): void => {
  canvasEl = c
}

/** Цвет акцента → "r,g,b". */
const accentRgb = (): string => {
  try {
    const h = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().replace(/\s/g, '')
    if (/^#[0-9a-fA-F]{6}$/.test(h)) {
      return `${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)}`
    }
    if (/^#[0-9a-fA-F]{3}$/.test(h)) {
      return `${parseInt(h[1]! + h[1]!, 16)},${parseInt(h[2]! + h[2]!, 16)},${parseInt(h[3]! + h[3]!, 16)}`
    }
  } catch {
    /* ignore */
  }
  return '136,136,136'
}

/** Буфер сглаживания нужного размера (сброс при смене вида/размера). */
const ensureSmooth = (mode: string, n: number): Float32Array => {
  if (!smooth || smooth.length !== n || smoothMode !== mode) {
    smooth = new Float32Array(n)
    smoothMode = mode
  }
  return smooth
}

/** Столбцы спектра: от пола вверх, скруглённый верх, градиент. */
const drawBars = (ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, data: Uint8Array, ar: string): void => {
  const bufLen = data.length
  const bars = 64
  const gap = 2 * dpr
  const bw = Math.max(1, (W - (bars - 1) * gap) / bars)
  const buf = ensureSmooth('bars', bars)
  const r = Math.max(0, Math.min(bw / 2, 3 * dpr))
  const grad = ctx.createLinearGradient(0, H, 0, 0)
  grad.addColorStop(0, `rgba(${ar},0.95)`)
  grad.addColorStop(1, `rgba(${ar},0.4)`)
  ctx.fillStyle = grad
  for (let i = 0; i < bars; i++) {
    const idx = Math.floor((i / bars) * bufLen * 0.7)
    // Лёгкое усиление верхов, чтобы спектр не «заваливался» влево.
    const raw = (data[idx]! / 255) * (0.75 + 0.45 * (i / bars))
    // Сглаживание: быстрый подъём, плавное падение.
    const prev = buf[i]!
    const v = raw > prev ? raw : prev + (raw - prev) * 0.32
    buf[i] = v
    const h = Math.max(2 * dpr, Math.min(1, v) * H * 0.94)
    const x = i * (bw + gap)
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, H - h, bw, h, [r, r, 0, 0])
    else ctx.rect(x, H - h, bw, h)
    ctx.fill()
  }
}

/** Волна: плавная огибающая спектра, залитая до пола + яркий контур сверху. */
const drawWave = (ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, data: Uint8Array, ar: string): void => {
  const bufLen = data.length
  const pts = 72
  const buf = ensureSmooth('wave', pts)
  const ys: number[] = new Array(pts)
  for (let i = 0; i < pts; i++) {
    const idx = Math.floor((i / pts) * bufLen * 0.62)
    const raw = (data[idx]! / 255) * (0.7 + 0.5 * (i / pts))
    const prev = buf[i]!
    const v = raw > prev ? prev + (raw - prev) * 0.5 : prev + (raw - prev) * 0.22
    buf[i] = v
    // y верхней линии: больше громкость → меньше y (выше заливка от пола).
    ys[i] = H - Math.max(2 * dpr, Math.min(1, v) * H * 0.94)
  }

  const px = (i: number): number => (i / (pts - 1)) * W

  // Плавная верхняя огибающая через quadratic-кривые по средним точкам.
  const traceTop = (): void => {
    ctx.moveTo(0, ys[0]!)
    for (let i = 0; i < pts - 1; i++) {
      const xc = (px(i) + px(i + 1)) / 2
      const yc = (ys[i]! + ys[i + 1]!) / 2
      ctx.quadraticCurveTo(px(i), ys[i]!, xc, yc)
    }
    ctx.lineTo(W, ys[pts - 1]!)
  }

  // Заливка от линии вниз до пола.
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, `rgba(${ar},0.6)`)
  grad.addColorStop(1, `rgba(${ar},0.12)`)
  ctx.fillStyle = grad
  ctx.beginPath()
  traceTop()
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fill()

  // Яркий контур по верхней линии.
  ctx.lineWidth = 1.8 * dpr
  ctx.strokeStyle = `rgba(${ar},0.95)`
  ctx.lineJoin = 'round'
  ctx.beginPath()
  traceTop()
  ctx.stroke()
}

const draw = (): void => {
  const canvas = canvasEl
  const analyser = getAnalyserNode()
  if (!canvas || !analyser) {
    raf = 0
    return
  }
  raf = requestAnimationFrame(draw)
  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth
  const H = canvas.offsetHeight
  if (W <= 0 || H <= 0) return
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr
    canvas.height = H * dpr
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const ar = accentRgb()
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(data)
  if (usePlayerViewStore.getState().vizType === 'wave') {
    drawWave(ctx, canvas.width, canvas.height, dpr, data, ar)
  } else {
    drawBars(ctx, canvas.width, canvas.height, dpr, data, ar)
  }
}

/** Запустить визуализатор (создаёт общий граф лениво, резюмит контекст). */
export const vizStart = (_audio: HTMLAudioElement): void => {
  if (!ensureAudioGraph()) return
  resumeAudioGraph()
  if (raf) return
  draw()
}

/** Остановить анимацию и очистить канвас. */
export const vizStop = (): void => {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  smooth = null
  smoothMode = ''
  const c = canvasEl
  if (c) {
    const ctx = c.getContext('2d')
    ctx?.clearRect(0, 0, c.width, c.height)
  }
}
