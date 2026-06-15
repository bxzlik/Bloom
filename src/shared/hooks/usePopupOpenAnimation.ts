import { useLayoutEffect, type RefObject } from 'react'

/**
 * Open-анимация для popup/dropdown через Web Animations API.
 *
 * Используется вместо CSS-анимации `ctxIn`
 * (`cubic-bezier(.34,1.25,.64,1)` + `translateY(-5px)→0`), которая делает
 * элемент «дёрганным»: overshoot easing проходит через scale > 1, а
 * вертикальный сдвиг создаёт эффект «всплывающих» иконок внутри.
 *
 * WAAPI запускается императивно в `useLayoutEffect`, гарантированно стартует
 * с from-state в том же layout-pass, что и установка позиции, без
 * промежуточных кадров финального состояния.
 *
 * Перед запуском сбрасываем `element.style.animation = 'none'` — это
 * блокирует параллельный запуск CSS-keyframe от класса `.open`
 * (компонент может оставлять этот класс для CSS `display:block` правила).
 *
 * @param ref       ref на корневой элемент popup'а
 * @param trigger   значение, по изменению которого animation запускается заново
 *                  (обычно `pos` объект или `open` boolean — должна меняться
 *                  ссылка/значение при каждом открытии)
 */
export const usePopupOpenAnimation = (
  ref: RefObject<HTMLElement | null>,
  trigger: unknown,
): void => {
  useLayoutEffect(() => {
    if (!trigger || !ref.current) return
    const el = ref.current
    // Гасим возможную CSS-анимацию от `.open` класса.
    el.style.animation = 'none'
    const anim = el.animate(
      [
        { opacity: 0, transform: 'scale(0.94)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      {
        duration: 160,
        easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
        fill: 'both',
      },
    )
    return () => {
      anim.cancel()
    }
  }, [trigger, ref])
}
