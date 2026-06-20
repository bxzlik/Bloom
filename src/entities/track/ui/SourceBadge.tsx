import type { Track } from '../model/types'
import { useBadgePrefs } from '@shared/lib/badgePrefs'

/** Брендовые цвета площадок (для бейджей/иконок в режиме «свои цвета»). */
const BRAND = {
  soundcloud: '#ff5500',
  yandex: '#fed42b',
  ytmusic: '#ff0033',
  spotify: '#1ED760',
} as const

/** Брендовый цвет площадки по id провайдера (или undefined — local/all/wave). */
export const providerBrandColor = (id: string): string | undefined =>
  (BRAND as Record<string, string>)[id]

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
 * Лого YouTube Music — фирменная прямоугольная «play-кнопка» (официальный ассет
 * `YouTube_full-color_icon_(2024).svg`, viewBox 313×216 — широкий, не квадрат).
 * Монохром через `currentColor` (как Sc/Ym), чтобы наследовать акцент в бейджах;
 * фирменный красный в акцентную плашку не вписывается. Треугольник вырезан
 * `evenodd` поверх скруглённого прямоугольника. Высота — пропорция ассета
 * (~0.69·size), поэтому форма прямоугольная.
 */
export const YtmLogo = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={Math.round(size * 0.69)}
    viewBox="0 0 313.23315 216.02286"
    fill="currentColor"
    style={{ display: 'block' }}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      transform="translate(-54.079375,-5.2758072)"
      d="m 210.53177,221.29866 c 0,0 98.12514,0 122.46443,-6.48069 13.70449,-3.6724 24.01093,-14.2575 27.62825,-27.32688 6.68807,-23.97854 6.68807,-74.41988 6.68807,-74.41988 0,0 0,-50.117297 -6.68807,-73.879819 C 357.00713,25.79798 346.70069,15.42887 332.9962,11.864515 308.65691,5.2758072 210.53177,5.2758072 210.53177,5.2758072 c 0,0 -97.9062,0 -122.135976,6.5887078 -13.485335,3.564355 -24.010529,13.933465 -27.847831,27.326876 -6.468588,23.762522 -6.468588,73.879819 -6.468588,73.879819 0,0 0,50.44134 6.468588,74.41988 3.837302,13.06938 14.362496,23.65448 27.847831,27.32688 24.229776,6.48069 122.135976,6.48069 122.135976,6.48069 z M 259.30109,113.28723 178.29251,67.382379 v 91.809711 z"
    />
  </svg>
)

/**
 * Лого Spotify — фирменный круг с тремя «волнами» (официальный single-path из
 * бренд-ассета). Монохром через `currentColor` (как Sc/Ym/Ytm), чтобы наследовать
 * акцент в бейджах; фирменный зелёный в акцентную плашку не вписывается.
 */
export const SpLogo = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 168 168" fill="currentColor" style={{ display: 'block' }}>
    <path d="m83.996 0.277c-46.249 0-83.743 37.493-83.743 83.742 0 46.251 37.494 83.741 83.743 83.741 46.254 0 83.744-37.49 83.744-83.741 0-46.246-37.49-83.738-83.745-83.738l0.001-0.004zm38.404 120.78c-1.5 2.46-4.72 3.24-7.18 1.73-19.662-12.01-44.414-14.73-73.564-8.07-2.809 0.64-5.609-1.12-6.249-3.93-0.643-2.81 1.11-5.61 3.926-6.25 31.9-7.291 59.263-4.15 81.337 9.34 2.46 1.51 3.24 4.72 1.73 7.18zm10.25-22.805c-1.89 3.075-5.91 4.045-8.98 2.155-22.51-13.839-56.823-17.846-83.448-9.764-3.453 1.043-7.1-0.903-8.148-4.35-1.04-3.453 0.907-7.093 4.354-8.143 30.413-9.228 68.222-4.758 94.072 11.127 3.07 1.89 4.04 5.91 2.15 8.976v-0.001zm0.88-23.744c-26.99-16.031-71.52-17.505-97.289-9.684-4.138 1.255-8.514-1.081-9.768-5.219-1.254-4.14 1.08-8.513 5.221-9.771 29.581-8.98 78.756-7.245 109.83 11.202 3.73 2.209 4.95 7.016 2.74 10.733-2.2 3.722-7.02 4.949-10.73 2.739z" />
  </svg>
)

/**
 * Иконка жёсткого диска — для локальных (загруженных на устройство) треков.
 * Stroke-стиль (в отличие от бренд-лого площадок), наследует цвет через
 * `currentColor`, как и остальные бейджи.
 */
export const HddLogo = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block' }}
  >
    <line x1="22" x2="2" y1="12" y2="12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    <line x1="6" x2="6.01" y1="16" y2="16" />
    <line x1="10" x2="10.01" y1="16" y2="16" />
  </svg>
)

/**
 * Иконка папки — для треков из folder_watcher (отслеживаемая папка на диске).
 * Stroke-стиль, как `HddLogo`; цвет через `currentColor`.
 */
export const FolderLogo = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block' }}
  >
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
)

/**
 * Бейдж-плашка с лого площадки. По умолчанию красится в БРЕНДОВЫЙ цвет площадки
 * (`brand`); при включённой настройке `accentBadges` — в цвет акцента (прежнее
 * поведение). Лого внутри — `currentColor`, наследует цвет плашки. Бейджи без
 * бренда (локальные/папка) всегда акцентные. Переиспользуется бейджем трека и
 * бейджем плейлиста «все треки из площадки».
 */
const SourcePlaque = ({
  size,
  children,
  cover,
  brand,
}: {
  size: number
  children: React.ReactNode
  /** Вариант поверх обложки: круглая полупрозрачная «стеклянная» плашка (фон
   *  затемнён + blur), чтобы читалась на любой картинке и не перекрывала её.
   *  Обычный (без `cover`) — квадратная плашка с тонированным фоном. */
  cover?: boolean
  /** Брендовый цвет площадки. Нет → всегда акцент (локальные/папка). */
  brand?: string
}) => {
  const accentBadges = useBadgePrefs((s) => s.accentBadges)
  const useBrand = !accentBadges && !!brand
  const color = useBrand ? (brand as string) : 'var(--accent)'
  return (
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
              color,
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)',
            }
          : {
              borderRadius: 'calc(var(--radius) * 0.35)',
              background: useBrand
                ? `color-mix(in srgb, ${brand} 20%, transparent)`
                : 'rgba(var(--accent-rgb),.18)',
              color,
            }),
      }}
    >
      {children}
    </span>
  )
}

/** Бейдж SoundCloud (бренд-оранжевый или акцент по настройке). */
export const ScBadge = ({ size = 22, cover }: { size?: number; cover?: boolean }) => (
  <SourcePlaque size={size} cover={cover} brand={BRAND.soundcloud}>
    <ScLogo size={Math.round(size * 0.6)} />
  </SourcePlaque>
)

/** Бейдж Яндекс.Музыки (бренд-жёлтый или акцент по настройке). */
export const YmBadge = ({ size = 22, cover }: { size?: number; cover?: boolean }) => (
  <SourcePlaque size={size} cover={cover} brand={BRAND.yandex}>
    <YmLogo size={Math.round(size * 0.58)} />
  </SourcePlaque>
)

/** Бейдж YouTube Music (бренд-красный или акцент по настройке). */
export const YtmBadge = ({ size = 22, cover }: { size?: number; cover?: boolean }) => (
  <SourcePlaque size={size} cover={cover} brand={BRAND.ytmusic}>
    <YtmLogo size={Math.round(size * 0.62)} />
  </SourcePlaque>
)

/** Бейдж Spotify (бренд-зелёный или акцент по настройке). */
export const SpBadge = ({ size = 22, cover }: { size?: number; cover?: boolean }) => (
  <SourcePlaque size={size} cover={cover} brand={BRAND.spotify}>
    <SpLogo size={Math.round(size * 0.62)} />
  </SourcePlaque>
)

/** Акцентный бейдж загруженного вручную трека — иконка жёсткого диска. */
export const LocalBadge = ({ size = 22, cover }: { size?: number; cover?: boolean }) => (
  <SourcePlaque size={size} cover={cover}>
    <HddLogo size={Math.round(size * 0.62)} />
  </SourcePlaque>
)

/** Акцентный бейдж трека из отслеживаемой папки — иконка папки. */
export const FolderBadge = ({ size = 22, cover }: { size?: number; cover?: boolean }) => (
  <SourcePlaque size={size} cover={cover}>
    <FolderLogo size={Math.round(size * 0.62)} />
  </SourcePlaque>
)

/** Трек из отслеживаемой папки (folder_watcher) — `_localPath`/`_folder`. */
const isFolderTrack = (t: Track): boolean =>
  !t._sc && !t._ym && !t._ytm && !t._sp && Boolean(t._localPath || t._folder)
/** Загруженный вручную в библиотеку трек — blob/IDB `url`, без папки/площадки. */
const isLocalTrack = (t: Track): boolean =>
  !t._sc && !t._ym && !t._ytm && !t._sp && !isFolderTrack(t) && Boolean(t.url)

/**
 * Бейдж источника трека. Для треков площадок — лого SoundCloud / Яндекс / YTM /
 * Spotify; для треков из папки — иконка папки; для загруженных вручную — иконка
 * жёсткого диска. Цвет/фон — акцентные.
 */
export const SourceBadge = ({ track, size = 22 }: { track: Track; size?: number }) => {
  if (track._ym) return <YmBadge size={size} />
  if (track._ytm) return <YtmBadge size={size} />
  if (track._sp) return <SpBadge size={size} />
  if (track._sc) return <ScBadge size={size} />
  if (isFolderTrack(track)) return <FolderBadge size={size} />
  if (isLocalTrack(track)) return <LocalBadge size={size} />
  return null
}

/**
 * Бейдж источника поверх обложки (нижний-правый угол). Залитый вариант для
 * читаемости на картинке; обёртка `.cov-badge` позиционирует его абсолютно и
 * прячет при наведении на обложку (см. CSS `.trcov:hover/.sp-tc-cover:hover`).
 * Размещается внутри контейнера обложки (`position:relative`).
 */
export const CoverSourceBadge = ({ track, size = 16 }: { track: Track; size?: number }) => {
  const badge = track._ym ? (
    <YmBadge size={size} cover />
  ) : track._ytm ? (
    <YtmBadge size={size} cover />
  ) : track._sp ? (
    <SpBadge size={size} cover />
  ) : track._sc ? (
    <ScBadge size={size} cover />
  ) : isFolderTrack(track) ? (
    <FolderBadge size={size} cover />
  ) : isLocalTrack(track) ? (
    <LocalBadge size={size} cover />
  ) : null
  if (!badge) return null
  return <span className="cov-badge">{badge}</span>
}

/**
 * Как `CoverSourceBadge`, но по строковому источнику (`'soundcloud' | 'yandex'`)
 * — для плейлист-карточек, где нет `Track` с флагами `_sc/_ym`.
 */
export const CoverProviderBadge = ({ provider, size = 16 }: { provider?: string | null; size?: number }) => {
  const badge =
    provider === 'yandex' ? (
      <YmBadge size={size} cover />
    ) : provider === 'ytmusic' ? (
      <YtmBadge size={size} cover />
    ) : provider === 'spotify' ? (
      <SpBadge size={size} cover />
    ) : provider === 'soundcloud' ? (
      <ScBadge size={size} cover />
    ) : null
  if (!badge) return null
  return <span className="cov-badge">{badge}</span>
}
