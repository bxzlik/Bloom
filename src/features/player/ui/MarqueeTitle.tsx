import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'

/**
 * Marquee-заголовок `_marqueeUpdate`.
 *
 * Поведение:
 *   1. Рендерится один текст внутри `wrap.ps-title-wrap` (overflow:hidden)
 *   2. После layout мерим scrollWidth скрытого «measurer»-элемента и clientWidth wrap'а
 *   3. Если text шире wrap+4px — включаем scrolling-режим:
 *      - JSX рендерит `text + gap-spacer + text` (для бесшовного loop'а)
 *      - CSS var `--ps-off` = `-(singleW + gap)px`
 *      - `animation-duration` = `max(4, step/55)s`
 *      - класс `ps-scrolling` на wrap → CSS играет keyframes `ps-marquee`
 *
 * Измерение через скрытый дубликат (всегда single text) гарантирует точный
 * `singleW` независимо от того, отрендерили мы уже duplicate или нет — нет
 * двойной перемерки и risk infinite loop'а в useEffect.
 *
 * Для других контейнеров (mp-, fp-, bp-) надо просто поменять `wrapClass` и
 * CSS var name — animation подхватит через соответствующий `@keyframes mp-marquee`.
 */
export interface MarqueeTitleProps {
  text: string
  /** CSS-класс на wrap (например `ps-title-wrap`). Сюда же добавляется `<scrollingClass>` когда активна. */
  wrapClass: string
  /** Класс на текст-элемент (например `ps-title`). */
  textClass: string
  /** Класс активации скролла (например `ps-scrolling`). */
  scrollingClass: string
  /** CSS custom property для offset (например `--ps-off`). */
  offsetVar: string
  /** Px-зазор между копиями текста при scroll'е. По умолчанию 64. */
  gap?: number
  /** Скорость прокрутки в px/s (для расчёта duration). По умолчанию 55. */
  speed?: number
  onClick?: (e: ReactMouseEvent<HTMLDivElement>) => void
  style?: CSSProperties
}

export const MarqueeTitle = ({
  text,
  wrapClass,
  textClass,
  scrollingClass,
  offsetVar,
  gap = 64,
  speed = 55,
  onClick,
  style,
}: MarqueeTitleProps) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [scrolling, setScrolling] = useState(false)
  const [duration, setDuration] = useState<string | undefined>()
  const [offset, setOffset] = useState<string | undefined>()

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const measure = measureRef.current
    if (!wrap || !measure) return
    const singleW = measure.scrollWidth
    const wrapW = wrap.clientWidth
    if (singleW > wrapW + 4) {
      const step = singleW + gap
      const dur = Math.max(4, Math.round(step / speed))
      setOffset(`-${step}px`)
      setDuration(`${dur}s`)
      setScrolling(true)
    } else {
      setScrolling(false)
      setOffset(undefined)
      setDuration(undefined)
    }
  }, [text, gap, speed])

  // Resize: пересчитать через тот же эффект (триггерим setState).
  useLayoutEffect(() => {
    const onResize = () => {
      const wrap = wrapRef.current
      const measure = measureRef.current
      if (!wrap || !measure) return
      const singleW = measure.scrollWidth
      const wrapW = wrap.clientWidth
      if (singleW > wrapW + 4) {
        const step = singleW + gap
        const dur = Math.max(4, Math.round(step / speed))
        setOffset(`-${step}px`)
        setDuration(`${dur}s`)
        setScrolling(true)
      } else {
        setScrolling(false)
        setOffset(undefined)
        setDuration(undefined)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [gap, speed])

  // CSS custom property через каст: TS-типизация CSSProperties не знает про
  // `--ps-off` и т.п., поэтому каст в Record<string, string | undefined> локально.
  const wrapStyle = {
    ...style,
    position: 'relative',
    [offsetVar]: offset,
  } as CSSProperties

  return (
    <div
      ref={wrapRef}
      className={scrolling ? `${wrapClass} ${scrollingClass}` : wrapClass}
      style={wrapStyle}
      onClick={onClick}
    >
      <div className={textClass} style={{ animationDuration: duration }}>
        {text}
        {scrolling && (
          <>
            <span
              aria-hidden="true"
              style={{ display: 'inline-block', minWidth: gap }}
            />
            {text}
          </>
        )}
      </div>
      {/* Скрытый измеритель — всегда single text, гарантирует корректный singleW
          независимо от scrolling-state визибл-элемента. */}
      <div
        ref={measureRef}
        className={textClass}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          visibility: 'hidden',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {text}
      </div>
    </div>
  )
}
