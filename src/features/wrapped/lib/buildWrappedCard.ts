/**
 * Canvas-постер «Итогов» — финальный слайд истории, сохраняется в PNG через
 * `cover_download` (тот же путь, что у buildShareCard).
 *
 * Строки приходят готовыми: локализацию и склонения делает вызывающий слайд,
 * здесь только рисование.
 */

export interface WrappedCardTrack {
  name: string
  artist: string
  cover: string | null
}

export interface WrappedCardData {
  /** «Итоги года» */
  title: string
  /** «2026» / «28 июля — 3 августа» */
  dates: string
  /** Подписи и значения двух крупных чисел. */
  timeLabel: string
  timeValue: string
  playsLabel: string
  playsValue: string
  tracksLabel: string
  artistsLabel: string
  tracks: WrappedCardTrack[]
  artists: string[]
  /** Акцентные цвета (hex) — берём из темы, чтобы карточка не спорила с UI. */
  accent: string
  accent2: string
}

const FONT = '-apple-system,"SF Pro Display","Segoe UI",sans-serif'

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

/** Загрузка картинки через blob — иначе canvas «протухает» из-за CORS. */
const loadImg = (src: string): Promise<HTMLImageElement | null> => {
  const asBlob = (u: string) =>
    fetch(u)
      .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
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
  if (src.startsWith('data:')) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    })
  }
  return asBlob(src.replace('-large.', '-t500x500.'))
    .then((img) => img ?? asBlob(src))
    .catch(() => null)
}

/**
 * Лого приложения (`/logo.png`) белым по альфе. В тайтлбаре тот же файл
 * используется как CSS-маска с `currentColor`, поэтому его собственный цвет
 * ненадёжен — перекрашиваем через `source-in`.
 */
const loadLogo = async (size: number): Promise<HTMLCanvasElement | null> => {
  const img = await loadImg('/logo.png')
  if (!img) return null
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const cx = c.getContext('2d')
  if (!cx) return null
  cx.drawImage(img, 0, 0, size, size)
  cx.globalCompositeOperation = 'source-in'
  cx.fillStyle = '#fff'
  cx.fillRect(0, 0, size, size)
  return c
}

const drawCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  radius: number,
): void => {
  ctx.save()
  roundRect(ctx, x, y, size, size, radius)
  ctx.clip()
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  const side = Math.min(iw, ih)
  ctx.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, x, y, size, size)
  ctx.restore()
}

/** Построить постер «Итогов». Размер 3:4 — удобно для сторис/чатов. */
export const buildWrappedCard = async (data: WrappedCardData): Promise<HTMLCanvasElement> => {
  const S = 2
  const W = 420 * S
  const H = 560 * S
  const PAD = 26 * S

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const LOGO = 17 * S
  const [covers, logo] = await Promise.all([
    Promise.all(data.tracks.slice(0, 5).map((t) => (t.cover ? loadImg(t.cover) : null))),
    loadLogo(LOGO),
  ])

  ctx.save()
  roundRect(ctx, 0, 0, W, H, 30 * S)
  ctx.clip()

  // Фон: тёмная база + акцентный градиент из темы.
  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, W, H)
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, data.accent)
  g.addColorStop(1, data.accent2)
  ctx.globalAlpha = 0.5
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H * 0.52)
  ctx.globalAlpha = 1
  const fade = ctx.createLinearGradient(0, 0, 0, H * 0.52)
  fade.addColorStop(0, 'rgba(13,13,13,0)')
  fade.addColorStop(1, 'rgba(13,13,13,1)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, W, H * 0.52)

  let y = PAD

  // Шапка: лого + бренд, ниже заголовок периода.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (logo) {
    ctx.globalAlpha = 0.85
    ctx.drawImage(logo, PAD, y, LOGO, LOGO)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `700 ${12 * S}px ${FONT}`
  ctx.letterSpacing = `${1 * S}px`
  ctx.fillText('BLOOM', PAD + (logo ? LOGO + 8 * S : 0), y + 12.5 * S)
  ctx.letterSpacing = '0px'
  y += 28 * S

  ctx.fillStyle = '#fff'
  ctx.font = `800 ${28 * S}px ${FONT}`
  ctx.fillText(ellipsis(ctx, data.title, W - PAD * 2), PAD, y + 24 * S)
  y += 36 * S

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `${13 * S}px ${FONT}`
  ctx.fillText(ellipsis(ctx, data.dates, W - PAD * 2), PAD, y + 12 * S)
  y += 30 * S

  // Два крупных числа.
  const colW = (W - PAD * 2) / 2
  const nums: [string, string][] = [
    [data.timeValue, data.timeLabel],
    [data.playsValue, data.playsLabel],
  ]
  nums.forEach(([val, lbl], i) => {
    const x = PAD + colW * i
    ctx.fillStyle = '#fff'
    ctx.font = `800 ${24 * S}px ${FONT}`
    ctx.fillText(ellipsis(ctx, val, colW - 10 * S), x, y + 22 * S)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = `${11 * S}px ${FONT}`
    ctx.fillText(ellipsis(ctx, lbl, colW - 10 * S), x, y + 40 * S)
  })
  y += 62 * S

  // Топ-треки.
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = `700 ${11 * S}px ${FONT}`
  ctx.fillText(data.tracksLabel.toUpperCase(), PAD, y)
  y += 14 * S

  const ROW = 46 * S
  const COV = 36 * S
  data.tracks.slice(0, 5).forEach((tr, i) => {
    const ry = y + ROW * i
    const img = covers[i]
    if (img) drawCover(ctx, img, PAD, ry, COV, 8 * S)
    else {
      roundRect(ctx, PAD, ry, COV, COV, 8 * S)
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fill()
    }
    const tx = PAD + COV + 12 * S
    const tw = W - PAD - tx - 24 * S
    ctx.fillStyle = '#fff'
    ctx.font = `600 ${13 * S}px ${FONT}`
    ctx.fillText(ellipsis(ctx, `${i + 1}. ${tr.name}`, tw), tx, ry + 15 * S)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = `${11 * S}px ${FONT}`
    ctx.fillText(ellipsis(ctx, tr.artist, tw), tx, ry + 30 * S)
  })
  y += ROW * Math.max(1, Math.min(5, data.tracks.length)) + 12 * S

  // Топ-артисты одной строкой-«чипами».
  if (data.artists.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = `700 ${11 * S}px ${FONT}`
    ctx.fillText(data.artistsLabel.toUpperCase(), PAD, y)
    y += 18 * S
    ctx.font = `600 ${12 * S}px ${FONT}`
    let cx = PAD
    for (const name of data.artists.slice(0, 5)) {
      const label = ellipsis(ctx, name, W - PAD * 2 - 24 * S)
      const cw = ctx.measureText(label).width + 20 * S
      if (cx + cw > W - PAD) break
      roundRect(ctx, cx, y, cw, 26 * S, 13 * S)
      ctx.fillStyle = 'rgba(255,255,255,0.09)'
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = `600 ${12 * S}px ${FONT}`
      ctx.fillText(label, cx + 10 * S, y + 17 * S)
      cx += cw + 8 * S
    }
  }

  ctx.restore()
  roundRect(ctx, 0, 0, W, H, 30 * S)
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 2
  ctx.stroke()

  return canvas
}
