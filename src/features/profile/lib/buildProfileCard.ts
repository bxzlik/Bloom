/**
 * Canvas-карточка профиля для «Поделиться».
 * `_buildProfileCardCanvas`: чёрная карточка с шапкой Bloom,
 * круглым аватаром + ником/био, 2×2 сеткой статистики и футером.
 *
 * Статистика (треки/прослушивания/время/любимый артист) передаётся снаружи —
 * считается из истории (как StatsSection), а не из мёртвого playCount.
 */
import { t } from '@shared/i18n'

export interface ProfileCardData {
  name: string
  bio: string
  avatar: string | null
  bannerColor: string
  bannerColor2: string
  trackCount: number
  plays: number
  /** Готовая строка времени (fmtDurLong). */
  timeStr: string
  favArtist: string
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

/** Загрузить картинку: data: напрямую, http через fetch→blob (CORS-safe). null при ошибке. */
const loadImg = (src: string | null): Promise<HTMLImageElement | null> => {
  if (!src) return Promise.resolve(null)
  if (src.startsWith('data:')) {
    return new Promise((resolve) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => resolve(null)
      im.src = src
    })
  }
  return fetch(src)
    .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
    .then(
      (b) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const u = URL.createObjectURL(b)
          const im = new Image()
          im.onload = () => {
            URL.revokeObjectURL(u)
            resolve(im)
          }
          im.onerror = () => {
            URL.revokeObjectURL(u)
            resolve(null)
          }
          im.src = u
        }),
    )
    .catch(() => null)
}

export const buildProfileCard = async (d: ProfileCardData): Promise<HTMLCanvasElement> => {
  const S = 2
  const CARD_W = 380 * S
  const PAD = 20 * S
  const INNER_W = CARD_W - PAD * 2
  const RADIUS = 28 * S

  const AVA_SZ = 38 * S
  const HEADER_H = AVA_SZ
  const HEADER_PB = 18 * S
  const SEP = 1
  const HEADER_MB = 18 * S

  const PROF_AVA = 64 * S
  const PROF_H = PROF_AVA
  const PROF_MB = 16 * S

  const GRID_GAP = 10 * S
  const CELL_VAL_FS = 20 * S
  const CELL_LBL_FS = 8 * S
  const CELL_PAD_V = 12 * S
  const CELL_H = CELL_PAD_V + CELL_VAL_FS + 6 * S + CELL_LBL_FS + CELL_PAD_V
  const GRID_H = 2 * CELL_H + GRID_GAP

  const FOOTER_PT = 18 * S
  const FOOTER_BTN_SZ = 40 * S
  const FOOTER_H = FOOTER_BTN_SZ
  const BOT_PAD = 22 * S

  const CARD_H =
    PAD + HEADER_H + HEADER_PB + SEP + HEADER_MB + PROF_H + PROF_MB + GRID_H + FOOTER_PT + FOOTER_H + BOT_PAD

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')!

  const avatarImg = await loadImg(d.avatar)
  const logoImg = await loadImg('/logo.png')

  ctx.save()
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS)
  ctx.clip()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  let y = PAD

  // ---- HEADER ----
  if (logoImg) {
    ctx.save()
    roundRect(ctx, PAD, y, AVA_SZ, AVA_SZ, 10 * S)
    ctx.clip()
    ctx.drawImage(logoImg, PAD, y, AVA_SZ, AVA_SZ)
    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.12)'
    roundRect(ctx, PAD, y, AVA_SZ, AVA_SZ, 10 * S)
    ctx.fill()
  }
  const mx = PAD + AVA_SZ + 11 * S
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${13 * S}px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Bloom', mx, y + AVA_SZ * 0.36)
  ctx.fillStyle = 'rgba(255,255,255,.35)'
  ctx.font = `${11 * S}px ${FONT}`
  ctx.fillText('shared their profile', mx, y + AVA_SZ * 0.72)

  y += HEADER_H + HEADER_PB

  // separator
  ctx.strokeStyle = 'rgba(255,255,255,.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(CARD_W - PAD, y)
  ctx.stroke()
  y += SEP + HEADER_MB

  // ---- PROFILE ROW ----
  ctx.save()
  ctx.beginPath()
  ctx.arc(PAD + PROF_AVA / 2, y + PROF_AVA / 2, PROF_AVA / 2, 0, Math.PI * 2)
  ctx.clip()
  if (avatarImg) {
    const iw = avatarImg.naturalWidth || avatarImg.width
    const ih = avatarImg.naturalHeight || avatarImg.height
    const sc = Math.max(PROF_AVA / iw, PROF_AVA / ih)
    const dw = iw * sc
    const dh = ih * sc
    ctx.drawImage(avatarImg, PAD + (PROF_AVA - dw) / 2, y + (PROF_AVA - dh) / 2, dw, dh)
  } else {
    const grd = ctx.createLinearGradient(PAD, y, PAD + PROF_AVA, y + PROF_AVA)
    grd.addColorStop(0, d.bannerColor || '#222')
    grd.addColorStop(1, d.bannerColor2 || '#111')
    ctx.fillStyle = grd
    ctx.fillRect(PAD, y, PROF_AVA, PROF_AVA)
    ctx.fillStyle = 'rgba(255,255,255,.4)'
    ctx.font = `700 ${PROF_AVA * 0.4}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((d.name || 'U').charAt(0).toUpperCase(), PAD + PROF_AVA / 2, y + PROF_AVA / 2)
  }
  ctx.restore()

  const tx = PAD + PROF_AVA + 14 * S
  const availW = CARD_W - PAD - tx
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${22 * S}px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(ellipsis(ctx, d.name || t('common.defaultUser'), availW), tx, y + PROF_AVA * 0.46)
  if (d.bio) {
    ctx.fillStyle = 'rgba(255,255,255,.36)'
    ctx.font = `${12 * S}px ${FONT}`
    ctx.fillText(ellipsis(ctx, d.bio, availW), tx, y + PROF_AVA * 0.46 + 14 * S + 12 * S)
  }

  y += PROF_H + PROF_MB

  // ---- 2×2 STATS GRID ----
  const COL_W = (INNER_W - GRID_GAP) / 2
  const statItems = [
    { val: String(d.trackCount), lbl: t('stats.card.tracks') },
    { val: String(d.plays), lbl: t('stats.card.plays') },
    { val: d.timeStr, lbl: t('stats.card.time') },
    { val: d.favArtist, lbl: t('stats.card.favArtist') },
  ]
  for (let si = 0; si < 4; si++) {
    const col = si % 2
    const row = Math.floor(si / 2)
    const cellX = PAD + col * (COL_W + GRID_GAP)
    const cellY = y + row * (CELL_H + GRID_GAP)
    ctx.fillStyle = 'rgba(255,255,255,.06)'
    roundRect(ctx, cellX, cellY, COL_W, CELL_H, 10 * S)
    ctx.fill()
    const valStr = statItems[si]!.val
    let valFS = CELL_VAL_FS
    ctx.font = `800 ${valFS}px ${FONT}`
    if (ctx.measureText(valStr).width > COL_W - 16 * S) {
      valFS = Math.max(11 * S, Math.floor((valFS * (COL_W - 16 * S)) / ctx.measureText(valStr).width))
    }
    ctx.font = `800 ${valFS}px ${FONT}`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(ellipsis(ctx, valStr, COL_W - 12 * S), cellX + 8 * S, cellY + CELL_PAD_V + valFS)
    ctx.fillStyle = 'rgba(255,255,255,.35)'
    ctx.font = `700 ${CELL_LBL_FS}px ${FONT}`
    ctx.fillText(statItems[si]!.lbl, cellX + 8 * S, cellY + CELL_PAD_V + valFS + 6 * S + CELL_LBL_FS)
  }
  y += 2 * CELL_H + GRID_GAP + 12 * S

  // ---- FOOTER ----
  ctx.strokeStyle = 'rgba(255,255,255,.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y + FOOTER_PT * 0.5)
  ctx.lineTo(CARD_W - PAD, y + FOOTER_PT * 0.5)
  ctx.stroke()
  y += FOOTER_PT

  ctx.fillStyle = 'rgba(255,255,255,.26)'
  ctx.font = `500 ${12 * S}px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${d.plays.toLocaleString('ru-RU')} прослушиваний`, PAD, y + FOOTER_BTN_SZ / 2)

  const btnX = CARD_W - PAD - FOOTER_BTN_SZ
  const btnY = y
  ctx.save()
  ctx.beginPath()
  ctx.arc(btnX + FOOTER_BTN_SZ / 2, btnY + FOOTER_BTN_SZ / 2, FOOTER_BTN_SZ / 2, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 2.5 * S
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const ax2 = btnX + FOOTER_BTN_SZ / 2
  const ay2 = btnY + FOOTER_BTN_SZ / 2
  const arr = 8 * S
  ctx.beginPath()
  ctx.moveTo(ax2 - arr * 0.6, ay2)
  ctx.lineTo(ax2 + arr * 0.6, ay2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ax2 + arr * 0.05, ay2 - arr * 0.55)
  ctx.lineTo(ax2 + arr * 0.6, ay2)
  ctx.lineTo(ax2 + arr * 0.05, ay2 + arr * 0.55)
  ctx.stroke()
  ctx.restore()

  // outer border
  ctx.restore()
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS)
  ctx.strokeStyle = 'rgba(255,255,255,.09)'
  ctx.lineWidth = 2
  ctx.stroke()

  return canvas
}
