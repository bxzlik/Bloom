import { useEffect } from 'react'

/**
 * Hover-marquee для карточек-плиток (главная, витрина, поиск, сетка библиотеки).
 *
 * Отличие от трек-рядов (`useTrackRowMarquee`): там ховерится сама строка, здесь —
 * вся карточка (обложка + подписи), поэтому текст едет при наведении куда угодно
 * по плитке, а не только на сам текст.
 *
 * Схема прокрутки та же, что у `HoverMarquee`, — «фиксированный clip + внутренний
 * бегунок»:
 *   - `.mq` (clip) стоит на месте: `overflow:hidden` + `ellipsis`;
 *   - `.mq-in` в покое `display:inline` — иначе не работает ellipsis; на ховере
 *     переключаем в `inline-block` (transform не применяется к inline) и катим
 *     `@keyframes trscroll` (animations.css).
 *
 * Разметку даёт `<CardMarquee>`; карточка-хост помечается классом `.mqh`.
 * Один делегированный обработчик на всё окно — карточек в сетках сотни.
 *
 * Ручки: MQ_DURATION — длительность цикла; MQ_MIN_OVERFLOW — порог, ниже которого
 * прокрутка не нужна (сабпиксельные хвосты).
 *
 * Монтируется один раз в App.
 */
const MQ_DURATION = 5 // s, как у трек-рядов
const MQ_MIN_OVERFLOW = 2 // px

const start = (host: Element) => {
  host.querySelectorAll<HTMLElement>('.mq').forEach((clip) => {
    const inner = clip.firstElementChild
    if (!(inner instanceof HTMLElement)) return
    const overflow = clip.scrollWidth - clip.clientWidth
    if (overflow <= MQ_MIN_OVERFLOW) return
    // Центрированные подписи (.hpc-name, .sp-ac-name) на время прокрутки едут от
    // левого края — иначе текст стартует «из-под» левой границы клипа.
    clip.style.textAlign = 'left'
    inner.style.display = 'inline-block'
    inner.style.willChange = 'transform'
    inner.style.setProperty('--tr-off', `-${overflow}px`)
    inner.style.animation = `trscroll ${MQ_DURATION}s linear infinite`
  })
}

const stop = (host: Element) => {
  host.querySelectorAll<HTMLElement>('.mq').forEach((clip) => {
    const inner = clip.firstElementChild
    if (!(inner instanceof HTMLElement)) return
    clip.style.textAlign = ''
    inner.style.animation = ''
    inner.style.transform = 'translateX(0)'
    inner.style.display = '' // → inline (дефолт span), эллипсис снова работает
    inner.style.willChange = ''
    inner.style.removeProperty('--tr-off')
  })
}

export function useCardMarquee() {
  useEffect(() => {
    // mouseenter/mouseleave долетают в capture от КАЖДОГО потомка карточки, а не
    // только от неё самой. Без флага `data-mq` переход курсора с обложки на
    // подпись перезапускал бы прокрутку с нуля; без проверки relatedTarget —
    // обрывал бы её. Поэтому старт/стоп ровно один на карточку.
    const onEnter = (e: Event) => {
      if (!(e.target instanceof Element)) return
      const host = e.target.closest('.mqh')
      if (!host || host.hasAttribute('data-mq')) return
      host.setAttribute('data-mq', '1')
      start(host)
    }
    const onLeave = (e: Event) => {
      if (!(e.target instanceof Element)) return
      const host = e.target.closest('.mqh')
      if (!host) return
      const to = (e as MouseEvent).relatedTarget
      if (to instanceof Node && host.contains(to)) return // ушли внутрь той же карточки
      host.removeAttribute('data-mq')
      stop(host)
    }

    // capture-фаза: mouseenter/mouseleave не всплывают, но в capture долетают.
    document.addEventListener('mouseenter', onEnter, true)
    document.addEventListener('mouseleave', onLeave, true)
    return () => {
      document.removeEventListener('mouseenter', onEnter, true)
      document.removeEventListener('mouseleave', onLeave, true)
    }
  }, [])
}
