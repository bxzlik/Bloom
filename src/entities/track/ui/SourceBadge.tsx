import type { Track } from '../model/types'

/**
 * Лого SoundCloud — фирменная волна + облако (официальный single-path,
 * как на ассете `Favicon Colors`). Красится `currentColor`, чтобы наследовать
 * цвет акцента в бейджах/иконках.
 */
export const ScLogo = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
    <path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM8.65 9.476c.318 2.622.246 4.974 0 7.617a.272.272 0 0 1-.541 0c-.215-2.617-.283-5.012 0-7.617a.272.272 0 0 1 .541 0ZM6.564 8.22c.32 2.87.242 5.392 0 8.871a.266.266 0 0 1-.531 0c-.227-3.426-.302-6.014 0-8.871a.266.266 0 0 1 .531 0ZM4.5 10.469c.317 2.213.252 4.262 0 6.62a.266.266 0 0 1-.531 0c-.22-2.322-.286-4.413 0-6.62a.266.266 0 0 1 .531 0ZM2.408 11.165c.327 1.622.231 3.057 0 5.928a.264.264 0 0 1-.528 0c-.213-2.83-.305-4.305 0-5.928a.264.264 0 0 1 .528 0ZM.387 12.31c.357 1.234.23 2.453 0 4.785a.263.263 0 0 1-.387 0c-.2-2.302-.288-3.555 0-4.785a.197.197 0 0 1 .387 0Z" />
  </svg>
)

/**
 * Лого Яндекс.Музыки — фирменная звезда-вспышка. Path вписан инлайном и красится
 * `currentColor` (в фирменном бренд-SVG цвет фиксированный `#FED42B`), чтобы
 * наследовать цвет акцента в бейджах/иконках, как SoundCloud.
 */
export const YmLogo = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 448 445" fill="currentColor" style={{ display: 'block' }}>
    <path d="M442.973 173.499L441.756 164.528L368.261 147.37L406.225 91.0325L401.739 84.9248L342.538 113.892L349.076 35.1002L342.538 31.8563L305.79 95.1128L262.529 0H254.369L264.962 93.0853L156.773 6.94402L147.396 9.4023L230.673 113.892L65.3346 58.7961L57.5796 67.362L205.355 151.045L2.05279 168.202L0 180.443L211.488 203.303L34.7201 347.834L42.8806 358.859L252.316 244.536L211.083 445H223.729L304.574 256.396L353.562 403.767L362.128 397.228L343.754 249.452L418.466 333.946L422.977 325.38L367.45 220.865L446.242 248.641L447.053 240.05L381.338 187.387L442.973 173.499Z" />
  </svg>
)

/**
 * Акцентный бейдж-плашка с лого площадки. Фон/цвет — акцентные, лого через
 * `currentColor`. Переиспользуется бейджем трека (`SourceBadge`) и бейджем
 * плейлиста «все треки из площадки» (сайдбар библиотеки).
 */
const SourcePlaque = ({
  size,
  children,
  cover,
}: {
  size: number
  children: React.ReactNode
  /** Вариант поверх обложки: круглая полупрозрачная «стеклянная» плашка (фон
   *  затемнён + blur, лого — акцентным цветом), чтобы читалась на любой картинке
   *  и не перекрывала её. Обычный (без `cover`) — акцентная квадратная плашка. */
  cover?: boolean
}) => (
  <span
    className="src-badge"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      flexShrink: 0,
      ...(cover
        ? {
            borderRadius: '50%',
            background: 'rgba(0,0,0,.38)',
            color: 'var(--accent)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)',
          }
        : {
            borderRadius: 'calc(var(--radius) * 0.35)',
            background: 'rgba(var(--accent-rgb),.18)',
            color: 'var(--accent)',
          }),
    }}
  >
    {children}
  </span>
)

/** Акцентный бейдж SoundCloud. */
export const ScBadge = ({ size = 22, cover }: { size?: number; cover?: boolean }) => (
  <SourcePlaque size={size} cover={cover}>
    <ScLogo size={Math.round(size * 0.6)} />
  </SourcePlaque>
)

/** Акцентный бейдж Яндекс.Музыки. */
export const YmBadge = ({ size = 22, cover }: { size?: number; cover?: boolean }) => (
  <SourcePlaque size={size} cover={cover}>
    <YmLogo size={Math.round(size * 0.58)} />
  </SourcePlaque>
)

/**
 * Бейдж источника трека (площадки) `psScBadge`. Показывается только
 * для треков площадок (SoundCloud / Яндекс); локальные/загруженные — без бейджа.
 * Цвет/фон — акцентные.
 */
export const SourceBadge = ({ track, size = 22 }: { track: Track; size?: number }) => {
  if (track._ym) return <YmBadge size={size} />
  if (track._sc) return <ScBadge size={size} />
  return null
}

/**
 * Бейдж источника поверх обложки (нижний-правый угол). Залитый вариант для
 * читаемости на картинке; обёртка `.cov-badge` позиционирует его абсолютно и
 * прячет при наведении на обложку (см. CSS `.trcov:hover/.sp-tc-cover:hover`).
 * Размещается внутри контейнера обложки (`position:relative`).
 */
export const CoverSourceBadge = ({ track, size = 16 }: { track: Track; size?: number }) => {
  const badge = track._ym ? <YmBadge size={size} cover /> : track._sc ? <ScBadge size={size} cover /> : null
  if (!badge) return null
  return <span className="cov-badge">{badge}</span>
}

/**
 * Как `CoverSourceBadge`, но по строковому источнику (`'soundcloud' | 'yandex'`)
 * — для плейлист-карточек, где нет `Track` с флагами `_sc/_ym`.
 */
export const CoverProviderBadge = ({ provider, size = 16 }: { provider?: string | null; size?: number }) => {
  const badge =
    provider === 'yandex' ? <YmBadge size={size} cover /> : provider === 'soundcloud' ? <ScBadge size={size} cover /> : null
  if (!badge) return null
  return <span className="cov-badge">{badge}</span>
}
