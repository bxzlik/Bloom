import { Icon, type IconProps } from '../Icon'

// Иконки Bloom (/tray-popup.html, miniplayer.html).
// Стили (fill/stroke/stroke-width) намеренно разные — повторяем.

// ── Filled ────────────────────────────────────────────────────────────

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z"
    />
  </Icon>
)

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="4" width="4" height="16" fill="currentColor" />
    <rect x="14" y="4" width="4" height="16" fill="currentColor" />
  </Icon>
)

export const PrevIcon = (p: IconProps) => (
  <Icon {...p}>
    <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
    <rect x="4" y="5" width="2" height="14" fill="currentColor" />
  </Icon>
)

export const NextIcon = (p: IconProps) => (
  <Icon {...p}>
    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
    <rect x="18" y="5" width="2" height="14" fill="currentColor" />
  </Icon>
)

// ── Stroke-only ───────────────────────────────────────────────────────

const strokeBase = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Домик — открыть главное окно. */
export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path {...strokeBase} strokeWidth={2} d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
  </Icon>
)

/** Выход — log-out стрелка. */
export const ExitIcon = (p: IconProps) => (
  <Icon {...p}>
    <path {...strokeBase} strokeWidth={2} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline {...strokeBase} strokeWidth={2} points="16 17 21 12 16 7" />
    <line {...strokeBase} strokeWidth={2} x1="21" y1="12" x2="9" y2="12" />
  </Icon>
)

/** Музыкальная нота — placeholder обложки. */
export const NoteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path {...strokeBase} strokeWidth={1.8} d="M9 18V5l12-2v13" />
    <circle {...strokeBase} strokeWidth={1.8} cx="6" cy="18" r="3" />
    <circle {...strokeBase} strokeWidth={1.8} cx="18" cy="16" r="3" />
  </Icon>
)

/** Сердце. fav=true делает заливку (используется отдельный prop в компоненте). */
export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p}>
    <path
      d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

/** Repeat (стрелки замкнутые). Активность — через цвет родителя. */
export const RepeatIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline {...strokeBase} strokeWidth={1.8} points="17 1 21 5 17 9" />
    <path {...strokeBase} strokeWidth={1.8} d="M3 11V9a4 4 0 014-4h14" />
    <polyline {...strokeBase} strokeWidth={1.8} points="7 23 3 19 7 15" />
    <path {...strokeBase} strokeWidth={1.8} d="M21 13v2a4 4 0 01-4 4H3" />
  </Icon>
)

/** Shuffle (перекрёстные стрелки). */
export const ShuffleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path {...strokeBase} strokeWidth={1.8} d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
    <path {...strokeBase} strokeWidth={1.8} d="m18 2 4 4-4 4" />
    <path {...strokeBase} strokeWidth={1.8} d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2" />
    <path {...strokeBase} strokeWidth={1.8} d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8" />
    <path {...strokeBase} strokeWidth={1.8} d="m18 14 4 4-4 4" />
  </Icon>
)

/** Плюс (add). Толстый штрих 2.4. */
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <line {...strokeBase} strokeWidth={2.4} x1="12" y1="5" x2="12" y2="19" />
    <line {...strokeBase} strokeWidth={2.4} x1="5" y1="12" x2="19" y2="12" />
  </Icon>
)

/** Громкость. `muted` скрывает волны. */
export const VolumeIcon = ({ muted, ...p }: IconProps & { muted?: boolean }) => (
  <Icon {...p}>
    <polygon
      fill="currentColor"
      points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"
    />
    {!muted && (
      <path
        {...strokeBase}
        strokeWidth={1.8}
        d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"
      />
    )}
  </Icon>
)

/** Скачать. */
export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path {...strokeBase} strokeWidth={2.4} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline {...strokeBase} strokeWidth={2.4} points="7 10 12 15 17 10" />
    <line {...strokeBase} strokeWidth={2.4} x1="12" y1="15" x2="12" y2="3" />
  </Icon>
)

/** Поиск — оставлен для других страниц. */
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle {...strokeBase} strokeWidth={2} cx="11" cy="11" r="7" />
    <line {...strokeBase} strokeWidth={2} x1="21" y1="21" x2="16.65" y2="16.65" />
  </Icon>
)

/** Мини-плеер (квадрат-в-квадрате). */
export const MiniplayerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M3 5h18v14H3V5zm2 2v10h10V7H5zm12 4h4v4h-4v-4z"
    />
  </Icon>
)

/** Закрыть (×). */
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.71 2.88 18.3 9.17 12 2.88 5.71 4.3 4.29l6.29 6.3 6.3-6.3z"
    />
  </Icon>
)
