import type { MouseEvent, ReactNode } from 'react'
import { cn } from '@shared/lib/cn'
import type { Track } from '../model/types'
import { TrackCover } from './TrackCover'

export interface TrackCardProps {
  track: Track
  onClick?: (track: Track, e: MouseEvent<HTMLDivElement>) => void
  /** Кнопка play оверлеем поверх обложки (передаётся из feature). */
  overlay?: ReactNode
  size?: number
  className?: string
}

/**
 * Карточка трека для сеток (главная страница, рекомендации, результаты поиска).
 * Обложка крупная, под ней — title + artist.
 */
export const TrackCard = ({
  track,
  onClick,
  overlay,
  size = 160,
  className,
}: TrackCardProps) => {
  return (
    <div
      onClick={(e) => onClick?.(track, e)}
      className={cn(
        'group flex flex-col gap-2 select-none cursor-pointer',
        'rounded-xl p-2 hover:bg-(--color-surface) transition-colors duration-100',
        className,
      )}
      style={{ width: size + 16 /* card padding 2*8 */ }}
    >
      <div className="relative">
        <TrackCover src={track.cover} size={size} rounded="lg" />
        {overlay && (
          <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
            {overlay}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{track.name}</div>
        <div className="truncate text-xs text-(--color-text-muted)">{track.artist}</div>
      </div>
    </div>
  )
}
