/**
 * Запуск enter-анимации модалки/оверлея с CSS-классом `.open`.
 *
 * Модалка монтируется свежей в портал, поэтому её from-state
 * (`transform:scale(.91) translateY(24px)`, `opacity:0`) ещё ни разу не был
 * посчитан браузером. Если просто добавить `.open` в том же кадре, CSS-переход
 * стартует не от from-state, а от промежуточного значения — модалка «дёргается»
 * и как будто «встаёт на своё место».
 *
 * Фикс (`void m.offsetWidth` перед `classList.add('open')`):
 * ждём кадр, чтобы свежесмонтированный контент успел разложиться, форсим reflow
 * (`offsetHeight`) — это фиксирует from-state как базу перехода в текущем
 * layout-pass, — и только потом включаем класс. Тот же подход, что и
 * `usePopupOpenAnimation` для контекстных/попап-меню, но без замены CSS-анимации.
 *
 * @param setOpen  сеттер флага `.open`-класса (`setOpening`/`setOpenClass`)
 * @returns        функция отмены (для cleanup в `useEffect`)
 */
export function runEnterAnimation(setOpen: (v: boolean) => void): () => void {
  let id2 = 0
  const id1 = requestAnimationFrame(() => {
    id2 = requestAnimationFrame(() => {
      // Форсим reflow: from-state становится базой CSS-перехода.
      void document.documentElement.offsetHeight
      setOpen(true)
    })
  })
  return () => {
    cancelAnimationFrame(id1)
    if (id2) cancelAnimationFrame(id2)
  }
}
