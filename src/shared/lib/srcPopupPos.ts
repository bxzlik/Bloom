/**
 * Раскладка попапа-столбика выбора площадки (плеер + поиск).
 *
 * Правило: ВЫБРАННАЯ площадка встаёт ровно на кнопку-анкер — попап открывается
 * «из иконки», активный пункт перекрывает бейдж, остальные разворачиваются от
 * него. Активный пункт помечен в разметке атрибутом `aria-current`, отделён
 * линией и стоит последним; если места вверх не хватает (кнопка у верхнего края
 * — так у поиска), раскладка зеркалится: активный становится ПЕРВЫМ, а список
 * растёт вниз. Об этом и говорит возвращаемый `flip` — вызывающий компонент
 * рисует пункты в обратном порядке.
 *
 * Считаем по фактическому DOM: смещение активного пункта внутри попапа меряется
 * рантаймом, а не выводится из констант padding/размера кнопки, иначе любая
 * правка CSS столбика молча ломала бы привязку.
 */
export const placeSrcPopup = (
  panel: HTMLElement,
  anchor: DOMRect,
  /** Текущий порядок пунктов в DOM (нужен, чтобы верно прочитать замер). */
  flip: boolean,
  gap = 8,
): { left: number; top: number; flip: boolean } => {
  const w = panel.offsetWidth
  const h = panel.offsetHeight
  const pr = panel.getBoundingClientRect()
  const cur = panel.querySelector('[aria-current]') as HTMLElement | null
  // Центр активного пункта относительно верха попапа в ТЕКУЩЕЙ раскладке.
  const d = cur ? cur.getBoundingClientRect().top - pr.top + cur.offsetHeight / 2 : h / 2
  // Раскладка симметрична, поэтому вариант-зеркало = h - d.
  const dyBottom = flip ? h - d : d
  const dyTop = h - dyBottom

  const cy = anchor.top + anchor.height / 2
  const up = cy - dyBottom
  const nextFlip = up < gap
  const top = nextFlip
    ? Math.max(gap, Math.min(cy - dyTop, window.innerHeight - h - gap))
    : up

  let left = anchor.left + anchor.width / 2 - w / 2
  left = Math.max(gap, Math.min(left, window.innerWidth - w - gap))

  return { left, top, flip: nextFlip }
}
