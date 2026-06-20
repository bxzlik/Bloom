/**
 * Генератор canvas-карточки «Поделиться» — `_scrdBuildCanvas` /
 * `_scrdDraw`. Рисует чёрную карточку: шапка с лого Bloom,
 * квадратная обложка, заголовок и артист по центру. Возвращает `<canvas>`,
 * который модалка показывает (превью) и сохраняет в PNG.
 *
 * Обложка грузится через fetch→blob, чтобы canvas не «протух» из-за CORS
 * (иначе `toDataURL` бросит SecurityError).
 */

import { t } from '@shared/i18n'

export interface ShareCardData {
  title: string
  artist: string
  cover: string | null
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const ellipsis = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string => {
  if (ctx.measureText(text).width <= maxW) return text
  let lo = 0
  let hi = text.length
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid
    else hi = mid
  }
  return text.slice(0, lo) + '…'
}

const FONT = '-apple-system,"SF Pro Display","Segoe UI",sans-serif'

const draw = (
  ctx: CanvasRenderingContext2D,
  CARD_W: number,
  CARD_H: number,
  PAD: number,
  INNER_W: number,
  SCALE: number,
  data: ShareCardData,
  coverImg: HTMLImageElement | null,
  logoImg: HTMLImageElement | null,
): void => {
  const RADIUS = 28 * SCALE
  const AVATAR_SZ = 38 * SCALE
  const META_GAP = 11 * SCALE
  const HEADER_PB = 18 * SCALE
  const HEADER_MB = 18 * SCALE
  const COVER_SZ = INNER_W
  const COVER_MB = 16 * SCALE
  const TITLE_FS = 22 * SCALE
  const TITLE_MB = 6 * SCALE
  const ARTIST_FS = 13 * SCALE

  // Клип всей отрисовки под форму карточки — углы PNG остаются прозрачными.
  ctx.save()
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS)
  ctx.clip()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  let y = PAD

  // Шапка: лого Bloom (без фона) либо буква «B».
  if (logoImg) {
    ctx.drawImage(logoImg, PAD, y, AVATAR_SZ, AVATAR_SZ)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = `700 ${AVATAR_SZ * 0.52}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('B', PAD + AVATAR_SZ / 2, y + AVATAR_SZ / 2)
  }
  const mx = PAD + AVATAR_SZ + META_GAP
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${15 * SCALE}px ${FONT}`
  ctx.fillText('Bloom', mx, y + AVATAR_SZ * 0.5)
  y += AVATAR_SZ + HEADER_PB

  // Разделитель шапки.
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(CARD_W - PAD, y)
  ctx.stroke()
  y += HEADER_MB

  // Обложка.
  roundRect(ctx, PAD, y, COVER_SZ, COVER_SZ, 16 * SCALE)
  ctx.fillStyle = '#1a1a1a'
  ctx.fill()
  if (coverImg) {
    ctx.save()
    roundRect(ctx, PAD, y, COVER_SZ, COVER_SZ, 16 * SCALE)
    ctx.clip()
    const iw = coverImg.naturalWidth || coverImg.width
    const ih = coverImg.naturalHeight || coverImg.height
    let sw: number, sh: number, sx: number, sy: number
    if (iw / ih > 1) {
      sh = ih
      sw = sh
      sx = (iw - sw) / 2
      sy = 0
    } else {
      sw = iw
      sh = sw
      sy = (ih - sh) / 2
      sx = 0
    }
    ctx.drawImage(coverImg, sx, sy, sw, sh, PAD, y, COVER_SZ, COVER_SZ)
    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.font = `${COVER_SZ * 0.14}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♫', PAD + COVER_SZ / 2, y + COVER_SZ / 2)
  }
  y += COVER_SZ + COVER_MB
  ctx.textBaseline = 'alphabetic'

  // Заголовок.
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${TITLE_FS}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(ellipsis(ctx, data.title || t('common.track'), INNER_W - 8 * SCALE), CARD_W / 2, y + TITLE_FS)
  y += Math.ceil(TITLE_FS * 1.22) + TITLE_MB

  // Артист.
  if (data.artist) {
    ctx.fillStyle = 'rgba(255,255,255,0.36)'
    ctx.font = `${ARTIST_FS}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(ellipsis(ctx, data.artist, INNER_W - 8 * SCALE), CARD_W / 2, y + ARTIST_FS)
  }

  // Рамка поверх (после restore клипа).
  ctx.restore()
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS)
  ctx.strokeStyle = 'rgba(255,255,255,0.09)'
  ctx.lineWidth = 2
  ctx.stroke()
}

/** Загрузить изображение через blob (CORS-safe), отдать null при ошибке. */
const loadCoverBlob = (src: string): Promise<HTMLImageElement | null> => {
  const hires = src.replace('-large.', '-t500x500.').replace('-small.', '-t500x500.')
  const tryFetch = (u: string) => fetch(u).then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
  return tryFetch(hires)
    .catch(() => (hires !== src ? tryFetch(src) : Promise.reject('notfound')))
    .then(
      (blob) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const url = URL.createObjectURL(blob)
          const img = new Image()
          img.onload = () => {
            URL.revokeObjectURL(url)
            resolve(img)
          }
          img.onerror = () => {
            URL.revokeObjectURL(url)
            resolve(null)
          }
          img.src = url
        }),
    )
    .catch(() => null)
}

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

/** Построить canvas-карточку «Поделиться». */
export const buildShareCard = async (data: ShareCardData): Promise<HTMLCanvasElement> => {
  const SCALE = 2
  const CARD_W = 380 * SCALE
  const PAD = 20 * SCALE
  const INNER_W = CARD_W - PAD * 2
  const AVATAR_SZ = 38 * SCALE
  const HEADER_PB = 18 * SCALE
  const HEADER_MB = 18 * SCALE
  const COVER_SZ = INNER_W
  const COVER_MB = 16 * SCALE
  const TITLE_FS = 22 * SCALE
  const TITLE_MB = 6 * SCALE
  const ARTIST_FS = 13 * SCALE
  const ARTIST_MB = 20 * SCALE
  const BOTTOM_PAD = 22 * SCALE
  const CARD_H =
    PAD +
    (AVATAR_SZ + HEADER_PB + HEADER_MB) +
    COVER_SZ +
    COVER_MB +
    Math.ceil(TITLE_FS * 1.22) +
    TITLE_MB +
    (data.artist ? Math.ceil(ARTIST_FS * 1.3) : 0) +
    ARTIST_MB +
    BOTTOM_PAD

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')!

  // Обложка → лого → отрисовка (логотип может не загрузиться — рисуем без него).
  let coverImg: HTMLImageElement | null = null
  if (data.cover && data.cover.startsWith('http')) coverImg = await loadCoverBlob(data.cover)
  else if (data.cover && data.cover.startsWith('data:')) coverImg = await loadImage(data.cover)
  const logoImg = await loadImage('/logo.png')

  draw(ctx, CARD_W, CARD_H, PAD, INNER_W, SCALE, data, coverImg, logoImg)
  return canvas
}
