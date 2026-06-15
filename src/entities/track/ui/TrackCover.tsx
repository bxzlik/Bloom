import { useState, type ImgHTMLAttributes } from 'react'
import { cn } from '@shared/lib/cn'

export interface TrackCoverProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null
  size?: number | string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}

const roundedMap = {
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-xl',
  full: 'rounded-full',
} as const

/**
 * Обложка трека с фолбэком (без обложки → плашка с инициалом артиста, заполняется
 * через onError, чтобы не упасть в бесконечный onerror-цикл, см. project_idle_cpu_backdrop).
 */
export const TrackCover = ({
  src,
  size = 40,
  rounded = 'md',
  className,
  alt = '',
  ...rest
}: TrackCoverProps) => {
  const [failed, setFailed] = useState(false)

  const dim = typeof size === 'number' ? `${size}px` : size

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className={cn(
          'shrink-0 inline-flex items-center justify-center',
          'bg-(--color-surface) text-(--color-text-muted) text-xs',
          roundedMap[rounded],
          className,
        )}
        style={{ width: dim, height: dim }}
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      onError={() => setFailed(true)}
      className={cn('shrink-0 object-cover bg-(--color-surface)', roundedMap[rounded], className)}
      style={typeof size === 'string' ? { width: dim, height: dim } : undefined}
      {...rest}
    />
  )
}
