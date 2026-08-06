import type { Track } from '../model/types'
import { useBadgePrefs } from '@shared/lib/badgePrefs'

/** Брендовые цвета площадок (для бейджей/иконок в режиме «свои цвета»). */
const BRAND = {
  soundcloud: '#ff5500',
  yandex: '#fed42b',
  ytmusic: '#ff0033',
} as const

/** Брендовый цвет площадки по id провайдера (или undefined — local/all/wave). */
export const providerBrandColor = (id: string): string | undefined =>
  (BRAND as Record<string, string>)[id]

/**
 * Лого SoundCloud — фирменная волна + облако (ассет `shared/assets/soundcloud.svg`,
 * viewBox 291×291 — рисунок во всю ширину и отцентрован по вертикали). Красится
 * `currentColor`, чтобы наследовать цвет акцента в бейджах/иконках.
 */
export const ScLogo = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 291.319 291.319"
    fill="currentColor"
    style={{ display: 'block' }}
  >
    <path d="M72.83,218.485h18.207V103.832c-6.828,1.93-12.982,5.435-18.207,10.041C72.83,113.874,72.83,218.485,72.83,218.485z M36.415,140.921v77.436l1.174,0.127h17.033v-77.682H37.589C37.589,140.803,36.415,140.921,36.415,140.921z M0,179.63c0,14.102,7.338,26.328,18.207,33.147V146.52C7.338,153.329,0,165.556,0,179.63z M109.245,218.485h18.207v-109.6c-5.444-3.396-11.607-5.635-18.207-6.5V218.485z M253.73,140.803h-10.242c0.519-3.168,0.847-6.382,0.847-9.705c0-32.182-25.245-58.264-56.388-58.264c-16.896,0-31.954,7.775-42.287,19.955v125.695h108.07c20.747,0,37.589-17.388,37.589-38.855C291.319,158.182,274.477,140.803,253.73,140.803z" />
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
 * Лого YouTube Music — фирменная прямоугольная «play-кнопка» (ассет
 * `shared/assets/YouTube.svg`, viewBox 313×216 — широкий, не квадрат).
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
              boxShadow: 'inset 0 0 0 1px rgba(var(--ovl-rgb),.14)',
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

const isPlatformTrack = (t: Track): boolean => Boolean(t._sc || t._ym || t._ytm)

/**
 * Трек из отслеживаемой папки. Признак — именно `_folder`: `_localPath` есть и у
 * одиночных файлов, добавленных плюсиком, а они не «папочные».
 */
const isFolderTrack = (t: Track): boolean => !isPlatformTrack(t) && Boolean(t._folder)

/**
 * Одиночный файл с диска: добавленный плюсиком/перетаскиванием (`_localPath`)
 * либо легаси-трек, чьи байты лежат в IndexedDB (`url`).
 */
const isLocalTrack = (t: Track): boolean =>
  !isPlatformTrack(t) && !isFolderTrack(t) && Boolean(t._localPath || t.url)

/**
 * Бейдж источника трека. Для треков площадок — лого SoundCloud / Яндекс / YTM;
 * для треков из папки — иконка папки; для одиночных файлов — иконка
 * жёсткого диска. Цвет/фон — акцентные.
 */
export const SourceBadge = ({ track, size = 22 }: { track: Track; size?: number }) => {
  if (track._ym) return <YmBadge size={size} />
  if (track._ytm) return <YtmBadge size={size} />
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
    ) : provider === 'soundcloud' ? (
      <ScBadge size={size} cover />
    ) : null
  if (!badge) return null
  return <span className="cov-badge">{badge}</span>
}
