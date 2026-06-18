import type { MouseEvent } from 'react'
import { cn } from '@shared/lib/cn'
import { useT } from '@shared/i18n'
import { TrackCover } from '@entities/track'
import type { Artist } from '../model/types'

export interface ArtistCardProps {
  artist: Artist
  onClick?: (artist: Artist, e: MouseEvent<HTMLDivElement>) => void
  size?: number
  className?: string
}

/**
 * Карточка артиста — отличается от Track/Playlist круглой аватаркой и центрированием.
 */
export const ArtistCard = ({
  artist,
  onClick,
  size = 140,
  className,
}: ArtistCardProps) => {
  const t = useT()
  return (
  <div
    onClick={(e) => onClick?.(artist, e)}
    className={cn(
      'group flex flex-col items-center gap-2 select-none cursor-pointer',
      'rounded-xl p-2 hover:bg-(--color-surface) transition-colors duration-100',
      className,
    )}
    style={{ width: size + 16 }}
  >
    <TrackCover src={artist.avatar} size={size} rounded="full" />
    <div className="min-w-0 w-full text-center">
      <div className="truncate text-sm font-medium">
        {artist.name}
        {artist.verified && (
          <span
            aria-label={t('artist.verified')}
            className="ml-1 inline-block text-(--color-accent)"
          >
            ✓
          </span>
        )}
      </div>
    </div>
  </div>
  )
}
