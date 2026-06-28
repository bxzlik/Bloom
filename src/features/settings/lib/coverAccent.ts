/**
 * Извлечение цвета из обложки. `extractAccentFromCover` /
 * `_extractColorForMp` + `hslToHex`: canvas 32×32,
 * выбираем самый «сочный» пиксель (saturation × близость L к 0.5), нормализуем
 * S/L, переводим HSL→hex.
 *
 *   - extractAccentFromCover — яркий акцент (для авто-акцента)
 *   - extractMpBgColor       — тёмный доминант (для фона мини-плеера, mode coverColor)
 *
 * Возвращает hex или null (CORS-tainted canvas / ошибка загрузки → null).
 *
 * Удалённые картинки (обложка-гифка по ссылке) тейнтят canvas → getImageData
 * бросает. Поэтому при провале прямого скана для http(s) повторяем из локального
 * data-URL (см. resolveLocalSrc — тянет байты через Rust, в обход CORS).
 */

import { resolveLocalSrc } from './gifFreeze'

const hslToHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): string => {
    const k = (n + h / 30) % 12
    const col = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * col)
      .toString(16)
      .padStart(2, '0')
  }
  return '#' + f(0) + f(8) + f(4)
}

/** Скан одного локального src (32×32) → доминантный пиксель в HSL, или null. */
const scanFrom = (
  src: string,
): Promise<{ h: number; s: number; l: number } | null> =>
  new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 32
        c.height = 32
        const x = c.getContext('2d')
        if (!x) return resolve(null)
        x.drawImage(img, 0, 0, 32, 32)
        const d = x.getImageData(0, 0, 32, 32).data
        let bestH = 0
        let bestS = 0
        let bestL = 0
        let bestScore = -1
        for (let i = 0; i < d.length; i += 16) {
          const r = d[i]! / 255
          const g = d[i + 1]! / 255
          const b = d[i + 2]! / 255
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const l = (max + min) / 2
          const s = max === min ? 0 : l < 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min)
          const score = s * (1 - Math.abs(l - 0.5) * 1.5)
          if (score > bestScore) {
            bestScore = score
            let h = 0
            if (max !== min) {
              if (max === r) h = ((g - b) / (max - min) + 6) % 6
              else if (max === g) h = (b - r) / (max - min) + 2
              else h = (r - g) / (max - min) + 4
              h = Math.round(h * 60)
            }
            bestH = h
            bestS = s
            bestL = l
          }
        }
        resolve({ h: bestH, s: bestS, l: bestL })
      } catch {
        resolve(null) // CORS-tainted canvas
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })

/** Скан 32×32 → доминантный пиксель в HSL (общая часть обоих экстракторов). */
const scanDominantHsl = async (
  src: string,
): Promise<{ h: number; s: number; l: number } | null> => {
  if (!src) return null
  const direct = await scanFrom(src)
  if (direct) return direct
  // Прямой скан не вышел (вероятно CORS-тейнт удалённой картинки) — тянем байты
  // через Rust и пробуем снова из локального data-URL.
  if (/^https?:\/\//i.test(src)) {
    const local = await resolveLocalSrc(src)
    if (local !== src) return scanFrom(local)
  }
  return null
}

/** Яркий акцент из обложки. */
export const extractAccentFromCover = async (imgSrc: string): Promise<string | null> => {
  const hsl = await scanDominantHsl(imgSrc)
  if (!hsl) return null
  const finalS = Math.min(1, hsl.s * 1.3)
  const finalL = Math.max(0.38, Math.min(0.62, hsl.l))
  return hslToHex(hsl.h, finalS, finalL)
}

/** Тёмный доминант для фона мини-плеера. */
export const extractMpBgColor = async (imgSrc: string): Promise<string | null> => {
  const hsl = await scanDominantHsl(imgSrc)
  if (!hsl) return null
  const finalS = Math.min(0.65, hsl.s * 0.85)
  const finalL = Math.max(0.12, Math.min(0.28, hsl.l * 0.6))
  return hslToHex(hsl.h, finalS, finalL)
}
