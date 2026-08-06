import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'

/** Позиция попапа + точка, от которой он растёт (угол, ближайший к курсору). */
interface Pos {
  left: number
  top: number
  origin: string
}

/** Длительность exit-анимации, ms — держим попап в DOM ровно столько. */
const EXIT_MS = 130

/**
 * Описание с line-clamp + попап на весь текст по клику, когда он не влез.
 *
 * Сам элемент остаётся обрезанным (clamp задаёт класс/`style` вызывающего), а
 * компонент только измеряет переполнение по клику и рисует попап у курсора.
 * Меряем по факту (`scrollHeight/scrollWidth`), а не по длине строки — «не
 * влезает» зависит от ширины окна и числа строк clamp'а, а не от количества
 * символов; если влезло — клик ничего не делает.
 *
 * Попап уходит в портал (`.desc-popup`), потому что предки бывают с
 * `overflow:hidden` / своим stacking context (герой артиста, модалка инфо).
 * Закрывается повторным кликом, кликом снаружи, Esc и скроллом страницы (иначе
 * попап «отклеится» от уехавшего текста). Esc слушаем в capture со
 * `stopPropagation`, чтобы не закрыть заодно модалку-хозяина.
 *
 * Анимации — WAAPI, как у остальных попапов: появление общим
 * `usePopupOpenAnimation` (scale .94→1), закрытие — зеркальное, ради него
 * держим узел в DOM ещё EXIT_MS (`closing`). Растём и схлопываемся от угла у
 * курсора (`origin`), поэтому попап «выходит» из текста, а не из своего центра.
 *
 * Потребители: описание артиста (герой страницы и профиль в поиске), описание
 * трека в модалке «Инфо о треке».
 */
export interface ExpandDescProps {
  text: string
  className?: string
  id?: string
  style?: CSSProperties
}

export const ExpandDesc = ({ text, className, id, style }: ExpandDescProps) => {
  const [pos, setPos] = useState<Pos | null>(null)
  const [closing, setClosing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Появление. Во время закрытия триггер гасим, иначе хук перезапустит enter.
  usePopupOpenAnimation(popupRef, closing ? null : pos)

  // Закрытие: доигрываем анимацию и только потом снимаем узел.
  useEffect(() => {
    if (!closing) return
    const el = popupRef.current
    const drop = () => {
      setPos(null)
      setClosing(false)
    }
    if (!el) {
      drop()
      return
    }
    el.style.animation = 'none' // как в usePopupOpenAnimation — гасим CSS-keyframe
    const anim = el.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.96)' },
      ],
      { duration: EXIT_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' },
    )
    anim.onfinish = drop
    return () => anim.cancel()
  }, [closing])

  useEffect(() => {
    if (!pos || closing) return
    const close = () => setClosing(true)
    // Клик по самому описанию не трогаем — его onClick переключает попап сам
    // (иначе mousedown закрыл бы, а следом click открыл заново).
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node | null
      if (tgt && (popupRef.current?.contains(tgt) || rootRef.current?.contains(tgt))) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
    }
    // Скролл закрывает попап, чтобы он не «отклеился» от уехавшего текста, но
    // сам попап тоже скроллится (max-height + overflow-y) — его собственный
    // scroll ловится тем же capture-слушателем, поэтому исключаем.
    const onScroll = (e: Event) => {
      if (e.target === popupRef.current) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [pos, closing])

  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (pos && !closing) {
      setClosing(true)
      return
    }
    const el = e.currentTarget
    if (el.scrollHeight - el.clientHeight <= 1 && el.scrollWidth - el.clientWidth <= 1) return
    const pw = 320, ph = 220 // = max-width/max-height .desc-popup
    const flipX = e.clientX + 14 + pw > window.innerWidth - 8
    const flipY = e.clientY + 14 + ph > window.innerHeight - 8
    const left = flipX ? e.clientX - pw - 14 : e.clientX + 14
    const top = flipY ? e.clientY - ph - 14 : e.clientY + 14
    // Клик во время закрытия — открываем заново (новый объект pos перезапустит
    // enter-хук), поэтому closing снимаем здесь же.
    setClosing(false)
    setPos({
      left: Math.max(8, left),
      top: Math.max(8, top),
      origin: `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}`,
    })
  }

  return (
    <>
      <div ref={rootRef} id={id} className={className} style={style} onClick={onClick}>
        {text}
      </div>
      {pos &&
        createPortal(
          <div
            ref={popupRef}
            className="desc-popup"
            style={{
              left: pos.left,
              top: pos.top,
              transformOrigin: pos.origin,
              pointerEvents: closing ? 'none' : undefined,
            }}
            dangerouslySetInnerHTML={{ __html: linkify(text) }}
          />,
          document.body,
        )}
    </>
  )
}

/** Парс описания: URL → ссылки, остальное эскейпится. */
const linkify = (text: string): string =>
  text
    .split(/(https?:\/\/[^\s]+)/g)
    .map((p, i) => {
      if (i % 2 === 1)
        return `<a href="${p.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a>`
      return p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    })
    .join('')
