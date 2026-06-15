import type { ReactNode, SVGProps } from 'react'
import { cn } from '@shared/lib/cn'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number | string
  /** Если задана — SVG получает role="img" + aria-label. Иначе aria-hidden. */
  label?: string
  children?: ReactNode
}

/**
 * Базовый SVG-контейнер. Размер задаётся через `size` (по умолчанию 1em).
 * Цвет — через `currentColor`. Конкретные иконки сами задают fill/stroke
 * на детях — это позволяет смешивать filled и stroke-only в одном наборе.
 */
export const Icon = ({
  size = '1em',
  label,
  className,
  children,
  ...rest
}: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    focusable="false"
    className={cn('inline-block shrink-0', className)}
    {...rest}
  >
    {children}
  </svg>
)
