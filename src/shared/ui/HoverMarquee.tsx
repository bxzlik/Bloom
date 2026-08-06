import { useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

/**
 * Hover-marquee для одиночной строки текста — шапки разделов, пилюли источника.
 *
 * Схема та же, что у трек-рядов (`useTrackRowMarquee`): «фиксированный clip +
 * внутренний бегунок».
 *   - внешний элемент (clip) стоит на месте: `overflow:hidden` + `ellipsis`,
 *     поэтому соседи по флексу (кнопки, счётчик) не двигаются;
 *   - внутренний `<span>` в покое `display:inline` — иначе не работает ellipsis;
 *     на ховере переключаем в `inline-block` (transform не применяется к inline)
 *     и катим теми же `@keyframes trscroll` (animations.css).
 *
 * Своих листенеров на `document` не ставит (в отличие от трек-рядов, где один
 * делегированный обработчик на тысячи строк) — здесь узлов единицы.
 *
 * Важно: `overflow/white-space/text-overflow` задаются инлайном, так что класс
 * может отвечать только за типографику; `style` кладётся после и может их
 * перебить, если нужно.
 */
export interface HoverMarqueeProps {
  text: string
  className?: string
  id?: string
  style?: CSSProperties
  /** Длительность цикла, s. По умолчанию 5 — как в трек-рядах. */
  duration?: number
  onClick?: (e: ReactMouseEvent<HTMLDivElement>) => void
}

export const HoverMarquee = ({
  text,
  className,
  id,
  style,
  duration = 5,
  onClick,
}: HoverMarqueeProps) => {
  const clipRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)

  const start = () => {
    const clip = clipRef.current
    const inner = innerRef.current
    if (!clip || !inner) return
    const overflow = clip.scrollWidth - clip.clientWidth
    if (overflow <= 2) return
    inner.style.display = 'inline-block'
    inner.style.willChange = 'transform'
    inner.style.setProperty('--tr-off', `-${overflow}px`)
    inner.style.animation = `trscroll ${duration}s linear infinite`
  }

  const stop = () => {
    const inner = innerRef.current
    if (!inner) return
    inner.style.animation = ''
    inner.style.transform = 'translateX(0)'
    inner.style.display = '' // → inline (дефолт span), ellipsis снова работает
    inner.style.willChange = ''
    inner.style.removeProperty('--tr-off')
  }

  return (
    <div
      ref={clipRef}
      id={id}
      className={className}
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        minWidth: 0,
        ...style,
      }}
      onMouseEnter={start}
      onMouseLeave={stop}
      onClick={onClick}
    >
      <span ref={innerRef}>{text}</span>
    </div>
  )
}
