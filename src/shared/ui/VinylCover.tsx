import { useId } from 'react'

/**
 * Обложка-заглушка для плейлистов без своей обложки: нарисованная виниловая
 * пластинка. Цвет лейбла детерминированно выводится из seed (id плейлиста),
 * поэтому каждый плейлист получает узнаваемый постоянный вид, а не безликую
 * нотку. Масштабируется по контейнеру (width/height 100%), одинаково смотрится
 * и в сайдбаре (16px), и в сетке (~140px).
 */

/** Стабильный хеш строки → угол оттенка 0..359. */
const seedHue = (seed: string): number => {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 360
}

export const VinylCover = ({ seed }: { seed: string }) => {
  const hue = seedHue(seed)
  const label = `hsl(${hue} 60% 52%)`
  const labelDk = `hsl(${hue} 58% 38%)`
  // useId гарантирует уникальные id градиентов даже при нескольких винилах в DOM.
  const uid = useId().replace(/:/g, '')
  const discId = `vdisc-${uid}`
  const labelId = `vlbl-${uid}`

  return (
    <svg
      viewBox="0 0 64 64"
      style={{ width: '100%', height: '100%', display: 'block' }}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={discId} cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#3b3b40" />
          <stop offset="45%" stopColor="#1f1f22" />
          <stop offset="100%" stopColor="#0b0b0d" />
        </radialGradient>
        <radialGradient id={labelId} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={label} />
          <stop offset="100%" stopColor={labelDk} />
        </radialGradient>
      </defs>
      {/* диск */}
      <circle cx="32" cy="32" r="31" fill={`url(#${discId})`} />
      {/* грувы (концентрические бороздки) */}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.06">
        <circle cx="32" cy="32" r="27.5" />
        <circle cx="32" cy="32" r="24.5" />
        <circle cx="32" cy="32" r="21.5" />
        <circle cx="32" cy="32" r="18.5" />
        <circle cx="32" cy="32" r="15.5" />
      </g>
      {/* блик сверху */}
      <path
        d="M13 16 A24 24 0 0 1 49 14"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.10"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* лейбл */}
      <circle cx="32" cy="32" r="11" fill={`url(#${labelId})`} />
      <circle cx="32" cy="32" r="11" fill="none" stroke="#000000" strokeOpacity="0.18" />
      {/* центральная дырка */}
      <circle cx="32" cy="32" r="1.7" fill="#0b0b0d" />
    </svg>
  )
}
