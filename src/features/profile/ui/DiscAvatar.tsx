import { useId, useMemo } from 'react'
import { makeDiscSvg } from '../lib/discSvg'

/**
 * Винил-диск как дефолтный аватар. Рендерит SVG-строку из `makeDiscSvg`
 * через dangerouslySetInnerHTML (SVG статичный, без пользовательского ввода).
 * Уникальный `domId` берём из React useId, чтобы id градиентов не пересекались.
 */
export const DiscAvatar = ({
  idx,
  color,
  className,
  style,
}: {
  idx: number
  color: string | null
  className?: string
  style?: React.CSSProperties
}) => {
  const rawId = useId()
  const domId = useMemo(() => 'dav' + rawId.replace(/[^a-zA-Z0-9]/g, ''), [rawId])
  const html = useMemo(() => makeDiscSvg(idx, color, domId), [idx, color, domId])
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
}
