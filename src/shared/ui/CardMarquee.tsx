import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@shared/lib/cn'

/**
 * Однострочная подпись карточки, которую катит `useCardMarquee` при наведении на
 * карточку (родитель с классом `.mqh`), если текст не влез.
 *
 * Внутренний `<span class="mq-in">` — бегунок: в покое `inline` (работает
 * ellipsis), на ховере хук делает его `inline-block` и запускает `trscroll`.
 * `className` — «одежда» слота (.hc-name, .sp-tc-name и т.п.), геометрию клипа
 * задаёт `.mq` (base.css).
 */
export interface CardMarqueeProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export const CardMarquee = ({ children, className, style }: CardMarqueeProps) => (
  <div className={cn('mq', className)} style={style}>
    <span className="mq-in">{children}</span>
  </div>
)
