/**
 * Визуализатор (анимация частот под музыку). `_vizInit`/
 * `_vizStart`/`_vizStop`/`_vizDraw`. Анализатор берётся из
 * общего аудио-графа (`audioGraph`) — он же обслуживает нормализацию/кроссфейд,
 * т.к. `createMediaElementSource` можно звать на элемент лишь ОДИН раз.
 *
 * ВАЖНО (CORS): граф маршрутизирует ВЕСЬ звук через WebAudio. Если ресурс
 * кросс-доменный без CORS-заголовков (элемент грузился без crossOrigin),
 * узел отдаёт тишину → звук пропадёт. audioEngine ставит crossOrigin='anonymous'
 * для http(s) (SC CDN отдаёт CORS), для blob/local — нет.
 */
import { ensureAudioGraph, resumeAudioGraph, getAnalyserNode } from './audioGraph'

let raf = 0
let canvasEl: HTMLCanvasElement | null = null

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
  const bufLen = analyser.frequencyBinCount
  const data = new Uint8Array(bufLen)
  analyser.getByteFrequencyData(data)
  const bars = 60
  const gap = 2 * dpr
  const bw = Math.max(1, (canvas.width - (bars - 1) * gap) / bars)
  const grad = ctx.createLinearGradient(0, canvas.height, 0, 0)
  grad.addColorStop(0, `rgba(${ar},0.8)`)
  grad.addColorStop(1, `rgba(${ar},0.27)`)
  ctx.fillStyle = grad
  for (let i = 0; i < bars; i++) {
    const idx = Math.floor((i / bars) * bufLen * 0.7)
    const v = data[idx]! / 255
    const h = Math.max(2 * dpr, v * canvas.height * 0.92)
    const x = i * (bw + gap)
    const r = Math.max(0, Math.min(bw / 2, 3 * dpr))
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, canvas.height - h, bw, h, r)
    else ctx.rect(x, canvas.height - h, bw, h)
    ctx.fill()
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
  const c = canvasEl
  if (c) {
    const ctx = c.getContext('2d')
    ctx?.clearRect(0, 0, c.width, c.height)
  }
}
