import type { ReactNode, RefObject } from 'react'
import { useWindowedList } from '@shared/lib/useWindowedList'

/**
 * Оконно-виртуализированный вертикальный список БЕЗ drag-reorder (для sortable-
 * списков useWindowedList подключается вручную рядом с useSortable — см.
 * LibTracklist/QueueBlock). Рендерит только видимый срез строк + спейсеры;
 * строки остаются в нормальном потоке документа.
 *
 * renderItem обязан прицепить `data-widx={widx}` на корневой элемент строки —
 * по нему замеряется реальный «шаг» строки (высота+margin).
 */
export const WindowedRows = <T,>({
  items,
  renderItem,
  scrollRef,
  estimate,
  className,
}: {
  items: T[]
  /** index — абсолютный индекс элемента; его же ставить в data-widx. */
  renderItem: (item: T, index: number) => ReactNode
  /** Внешний скролл-контейнер; не задан → скроллится сам контейнер списка. */
  scrollRef?: RefObject<HTMLElement | null>
  /** Оценка «шага» строки до первого замера, px. */
  estimate: number
  className?: string
}) => {
  const win = useWindowedList({ count: items.length, scrollRef, estimate })
  return (
    <div ref={win.containerRef} className={className}>
      <div data-w-spacer style={{ height: win.padTop }} />
      {items.slice(win.start, win.end).map((item, i) => renderItem(item, win.start + i))}
      <div data-w-spacer style={{ height: win.padBottom }} />
    </div>
  )
}
