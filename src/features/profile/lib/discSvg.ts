/**
 * Винил-диск SVG — дефолтный аватар профиля.
 *
 * 6 встроенных пресет-тем; кастомный `discColor` выводит тему из одного цвета.
 * `domId` нужен для уникальных id градиентов внутри одного документа.
 */

/** Дефолтные «яркие» цвета для кастом-пикера диска. */
export const discDefColors = ['#6e3cff', '#ff3c3c', '#1e8cff', '#be32ff', '#28d25a', '#ffb914']

type Theme = [string, string, string, string, string]

const THEMES: Theme[] = [
  ['#1a1235', '#080514', 'rgba(110,60,255,0.4)', 'rgba(50,170,255,0.25)', '#0e0a22'],
  ['#3a0808', '#160202', 'rgba(255,60,60,0.4)', 'rgba(255,140,30,0.25)', '#120303'],
  ['#062038', '#020b18', 'rgba(30,140,255,0.4)', 'rgba(20,220,190,0.25)', '#030d1a'],
  ['#280638', '#100215', 'rgba(190,50,255,0.4)', 'rgba(255,70,160,0.25)', '#0e0218'],
  ['#063020', '#020f08', 'rgba(40,210,90,0.4)', 'rgba(20,255,160,0.25)', '#020e08'],
  ['#302008', '#120c02', 'rgba(255,185,20,0.4)', 'rgba(255,100,20,0.25)', '#100800'],
]

const discThemeFromColor = (hex: string): Theme => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const d = (v: number, f: number) => Math.round(v * f)
  return [
    `rgb(${d(r, 0.28)},${d(g, 0.28)},${d(b, 0.28)})`,
    `rgb(${d(r, 0.1)},${d(g, 0.1)},${d(b, 0.1)})`,
    `rgba(${r},${g},${b},0.4)`,
    `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 60)},${Math.min(255, b + 20)},0.25)`,
    `rgb(${d(r, 0.18)},${d(g, 0.18)},${d(b, 0.18)})`,
  ]
}

export const makeDiscSvg = (idx: number, discColor: string | null, domId: string): string => {
  const i = (((idx % 6) + 6) % 6) as number
  const [b1, b2, s1, s2, cc] = discColor ? discThemeFromColor(discColor) : THEMES[i]!
  const gr = [28, 18]
    .map(
      (r) =>
        `<circle cx="36" cy="36" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`,
    )
    .join('')
  return `<svg viewBox="0 0 72 72" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="${domId}a" cx="40%" cy="34%" r="70%"><stop offset="0%" stop-color="${b1}"/><stop offset="100%" stop-color="${b2}"/></radialGradient><radialGradient id="${domId}b" cx="30%" cy="24%" r="62%"><stop offset="0%" stop-color="${s2}"/><stop offset="48%" stop-color="${s1}"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient><radialGradient id="${domId}c" cx="50%" cy="38%" r="55%"><stop offset="0%" stop-color="${b1}"/><stop offset="100%" stop-color="${cc}"/></radialGradient></defs><circle cx="36" cy="36" r="36" fill="url(#${domId}a)"/>${gr}<circle cx="36" cy="36" r="36" fill="url(#${domId}b)"/><circle cx="28" cy="22" r="5" fill="rgba(255,255,255,0.045)"/><circle cx="36" cy="36" r="10.5" fill="url(#${domId}c)"/><circle cx="36" cy="36" r="2.8" fill="#050505"/></svg>`
}
