import type { MouseEvent, ReactNode } from 'react'
import { cn } from '@shared/lib/cn'
import type { Track } from '../model/types'
import { TrackCover } from './TrackCover'

export interface TrackRowProps {
  track: Track
  index?: number
  active?: boolean
  onClick?: (track: Track, e: MouseEvent<HTMLDivElement>) => void
  onDoubleClick?: (track: Track, e: MouseEvent<HTMLDivElement>) => void
  /** Контролы справа (лайк, меню и т.п.) — рендерится из feature. */
  actions?: ReactNode
  className?: string
}

/**
 * Тонкая строка трека для списков (библиотека, плейлист, результаты поиска).
 * Базовый UI — без бизнес-логики. Лайки, меню, drag-handle передавайте через `actions`.
 */
export const TrackRow = ({
  track,
  index,
  active,
  onClick,
  onDoubleClick,
  actions,
  className,
}: TrackRowProps) => {
  return (
    <div
      onClick={(e) => onClick?.(track, e)}
      onDoubleClick={(e) => onDoubleClick?.(track, e)}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-2 py-1.5',
        'hover:bg-(--color-surface) cursor-pointer select-none',
        'transition-colors duration-100',
        active && 'bg-(--color-surface) text-(--color-accent)',
        className,
      )}
    >
      {index !== undefined && (
        <span className="w-6 text-right text-xs tabular-nums text-(--color-text-muted)">
          {index}
        </span>
      )}
      <TrackCover src={track.cover} size={40} rounded="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{track.name}</div>
        <div className="truncate text-xs text-(--color-text-muted)">{track.artist}</div>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-(--color-text-muted)">
        {track.dur}
      </span>
      {actions && (
        <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  )
}
