import type { MouseEvent, ReactNode } from 'react'
import { cn } from '@shared/lib/cn'
import { TrackCover } from '@entities/track'
import type { Playlist } from '../model/types'

export interface PlaylistCardProps {
  playlist: Playlist
  onClick?: (playlist: Playlist, e: MouseEvent<HTMLDivElement>) => void
  overlay?: ReactNode
  size?: number
  className?: string
}

export const PlaylistCard = ({
  playlist,
  onClick,
  overlay,
  size = 160,
  className,
}: PlaylistCardProps) => (
  <div
    onClick={(e) => onClick?.(playlist, e)}
    className={cn(
      'group flex flex-col gap-2 select-none cursor-pointer',
      'rounded-xl p-2 hover:bg-(--color-surface) transition-colors duration-100',
      className,
    )}
    style={{ width: size + 16 }}
  >
    <div className="relative">
      <TrackCover src={playlist.cover} size={size} rounded="lg" />
      {overlay && (
        <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {overlay}
        </div>
      )}
    </div>
    <div className="min-w-0">
      <div className="truncate text-sm font-medium">{playlist.title}</div>
      <div className="truncate text-xs text-(--color-text-muted)">
        {playlist.ownerName ??
          (playlist.trackCount !== undefined ? `${playlist.trackCount} треков` : '')}
      </div>
    </div>
  </div>
)
