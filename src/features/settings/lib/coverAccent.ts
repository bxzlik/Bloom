/**
 * Извлечение цвета из обложки. `extractAccentFromCover` /
 * `_extractColorForMp` + `hslToHex`: canvas 32×32,
 * выбираем самый «сочный» пиксель (saturation × близость L к 0.5), нормализуем
 * S/L, переводим HSL→hex.
 *
 *   - extractAccentFromCover — акцент (для авто-акцента; яркость настраивается)
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

/**
 * Доминантный HSL обложки (h 0–360, s/l 0–1) — сырьё для произвольной
 * раскраски (напр. огненное свечение «Моей волны»). null при CORS/ошибке.
 */
export const extractCoverHsl = (
  imgSrc: string,
): Promise<{ h: number; s: number; l: number } | null> => scanDominantHsl(imgSrc)

/**
 * Яркость авто-акцента (центр коридора светлоты). Дефолт 0.375 — заметно темнее
 * прежних 0.38–0.62, но акцент ещё читается на тёмном фоне; на минимуме шкалы
 * (0.10) коридор 0.025–0.175 почти совпадает с фоном мини-плеера
 * (см. extractMpBgColor).
 */
export const AUTO_ACCENT_L_MIN = 0.1
export const AUTO_ACCENT_L_MAX = 0.6
export const AUTO_ACCENT_L_DEFAULT = 0.375
/** Полуширина коридора светлоты вокруг заданной яркости. */
const L_BAND = 0.075

/**
 * Доминантный HSL → hex акцента при заданной яркости.
 * Насыщенность едет за яркостью (0.75 + level): на тёмном тоне высокая S даёт
 * цветной шум, на светлом — наоборот нужна «сочность».
 */
export const accentHexFromHsl = (
  hsl: { h: number; s: number; l: number },
  level: number = AUTO_ACCENT_L_DEFAULT,
): string => {
  const lvl = Math.max(AUTO_ACCENT_L_MIN, Math.min(AUTO_ACCENT_L_MAX, level))
  const finalS = Math.min(1, hsl.s * (0.75 + lvl))
  const finalL = Math.max(lvl - L_BAND, Math.min(lvl + L_BAND, hsl.l))
  return hslToHex(hsl.h, finalS, finalL)
}

/** Акцент из обложки при заданной яркости (`level` — центр коридора светлоты). */
export const extractAccentFromCover = async (
  imgSrc: string,
  level: number = AUTO_ACCENT_L_DEFAULT,
): Promise<string | null> => {
  const hsl = await scanDominantHsl(imgSrc)
  if (!hsl) return null
  return accentHexFromHsl(hsl, level)
}

/** Тёмный доминант для фона мини-плеера. */
export const extractMpBgColor = async (imgSrc: string): Promise<string | null> => {
  const hsl = await scanDominantHsl(imgSrc)
  if (!hsl) return null
  // Светлота держится в тёмном коридоре, чтобы фон бара в режиме «Цвет обложки»
  // не выбивался из интерфейса. Исходные 0.12–0.28 были заметно светлее «Темы»,
  // 0.06–0.13 — наоборот, проваливались в черноту; текущие значения посередине.
  // Насыщенность слегка подрезана: на тёмном тоне высокая S даёт цветной шум.
  const finalS = Math.min(0.58, hsl.s * 0.78)
  const finalL = Math.max(0.09, Math.min(0.18, hsl.l * 0.45))
  return hslToHex(hsl.h, finalS, finalL)
}
