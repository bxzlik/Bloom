import { useEffect } from 'react'

/**
 * Hover-marquee для строк треков — по мотивам старого IIFE.
 *
 * Глобальные capture-листенеры на `document`: при наведении на `.tri` прокручивает
 * название и артиста (`.tra`), если текст не влезает в строку. CSS уже в
 * (`@keyframes trscroll`, `.tri{overflow:hidden}`, `.tri:hover .tra{overflow:visible}`,
 * `will-change:transform`).
 *
 * **Название (`.trn`) отличается от:** в bloom `.trn` = `flex[<span clip> + <SourceBadge>]`,
 * где `<span clip>` обрезает текст эллипсисом, а рядом стоит бейдж площадки. Если катить
 * весь `.trn`, бейдж едет вместе с названием и текст на
 * него наезжает. Поэтому название катим по схеме «фиксированный clip + внутренний бегунок»:
 *   - `<span clip>` (overflow:hidden, ellipsis) стоит на месте, бейдж не двигается;
 *   - внутри него `<span>` с текстом в покое `display:inline` (эллипсис работает),
 *     на время прокрутки делаем его `inline-block` + анимация `trscroll` (transform
 *     не применяется к inline, поэтому переключаем display только на ховере).
 * `.tra` (без бейджа) катим напрямую,.
 *
 * Монтируется один раз в App.
 */
export function useTrackRowMarquee() {
  useEffect(() => {
    // Название: бегунок — внутренний span, clip — внешний span (.trn первый ребёнок).
    const startTitle = (trn: HTMLElement) => {
      const clip = trn.firstElementChild
      const inner = clip?.firstElementChild
      if (!(clip instanceof HTMLElement) || !(inner instanceof HTMLElement)) return
      const overflow = clip.scrollWidth - clip.clientWidth
      if (overflow > 2) {
        inner.style.display = 'inline-block'
        inner.style.willChange = 'transform'
        inner.style.setProperty('--tr-off', `-${overflow}px`)
        inner.style.animation = 'trscroll 5s linear infinite'
      }
    }
    const stopTitle = (trn: HTMLElement) => {
      const clip = trn.firstElementChild
      const inner = clip?.firstElementChild
      if (!(inner instanceof HTMLElement)) return
      inner.style.animation = ''
      inner.style.transform = 'translateX(0)'
      inner.style.display = '' // → inline (дефолт span), эллипсис снова работает
      inner.style.willChange = ''
      inner.style.removeProperty('--tr-off')
    }

    // Артист (.tra): без бейджа — катим элемент целиком, clip даёт .tri ().
    const start = (el: HTMLElement) => {
      const overflow = el.scrollWidth - el.clientWidth
      if (overflow > 2) {
        el.style.setProperty('--tr-off', `-${overflow}px`)
        el.style.animation = 'trscroll 5s linear infinite'
      }
    }
    const stop = (el: HTMLElement) => {
      el.style.animation = ''
      el.style.transform = 'translateX(0)'
      el.style.removeProperty('--tr-off')
    }

    const onEnter = (e: Event) => {
      if (!(e.target instanceof Element)) return
      const tri = e.target.closest('.tri')
      if (!tri) return
      const trn = tri.querySelector<HTMLElement>('.trn')
      const tra = tri.querySelector<HTMLElement>('.tra')
      if (trn) startTitle(trn)
      if (tra) start(tra)
    }
    const onLeave = (e: Event) => {
      if (!(e.target instanceof Element)) return
      const tri = e.target.closest('.tri')
      if (!tri) return
      const trn = tri.querySelector<HTMLElement>('.trn')
      const tra = tri.querySelector<HTMLElement>('.tra')
      if (trn) stopTitle(trn)
      if (tra) stop(tra)
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
