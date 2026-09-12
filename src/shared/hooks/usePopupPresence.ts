import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { usePopupOpenAnimation } from './usePopupOpenAnimation'

/** Длительность exit-анимации, ms — столько попап ещё живёт в DOM после закрытия. */
export const POPUP_EXIT_MS = 130

/**
 * Появление + закрытие попапа. Надстройка над `usePopupOpenAnimation`, которая
 * умеет ещё и уходить: одна open-анимация не может сыграть закрытие, потому что
 * к этому моменту компонент уже снял узел из DOM.
 *
 * Компонент рендерит попап по `mounted`, а не по `open`: после `open → false`
 * узел остаётся ещё на POPUP_EXIT_MS, пока играет зеркальная анимация (scale
 * 1→.96 + фейд), и только потом `mounted` падает. Клики на это время гасятся
 * (`pointer-events:none` ставит сам хук). Повторное открытие посреди закрытия
 * отменяет exit и запускает появление заново.
 *
 * Точка роста/схлопывания — `transform-origin` самого попапа (CSS или style).
 *
 * @param ref      ref на корневой элемент попапа
 * @param open     открыт ли попап по логике компонента
 * @param trigger  перезапуск появления при смене значения, пока открыт (напр.
 *                 объект `pos` — новый при каждом открытии). По умолчанию `open`.
 */
export const usePopupPresence = (
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  trigger: unknown = open,
): { mounted: boolean; closing: boolean } => {
  const [mounted, setMounted] = useState(open)
  // Монтируем в том же рендере, что и открытие, — иначе enter-хук не застанет узел.
  if (open && !mounted) setMounted(true)
  const closing = mounted && !open

  // Во время закрытия триггер гасим, иначе хук перезапустит появление.
  usePopupOpenAnimation(ref, open ? trigger : null)

  useLayoutEffect(() => {
    if (!closing) return
    const el = ref.current
    if (!el) {
      setMounted(false)
      return
    }
    el.style.animation = 'none' // как в usePopupOpenAnimation — гасим CSS-keyframe
    el.style.pointerEvents = 'none'
    const anim = el.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.96)' },
      ],
      { duration: POPUP_EXIT_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' },
    )
    anim.onfinish = () => setMounted(false)
    return () => {
      anim.cancel()
      el.style.pointerEvents = ''
    }
  }, [closing, ref])

  return { mounted, closing }
}

/**
 * Последнее непустое значение, пока `keep` (обычно `mounted` из
 * usePopupPresence). Для попапов, где «открыт» = «есть данные» от родителя
 * (pos/track/пункты): родитель обнуляет их в момент закрытия, а уходящему
 * попапу ещё POPUP_EXIT_MS надо чем-то рисоваться. Без `keep` отдаёт как есть.
 */
export const useStickyWhile = <T>(value: T, keep: boolean): T => {
  const ref = useRef(value)
  if (value != null || !keep) ref.current = value
  return ref.current
}
