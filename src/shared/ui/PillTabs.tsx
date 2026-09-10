import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { cn } from '@shared/lib/cn'

/**
 * Общий ряд вкладок «как в настройках»: без подложки-коробки и заливки активной
 * кнопки — под выбранной вкладкой едет пилюля-индикатор («чернила»).
 *
 * Сам индикатор — абсолютный элемент, позицию которого меряем по активной
 * кнопке (атрибут `data-ink`) и гоняем через transform+width, поэтому смена
 * вкладки плавно перевозит пилюлю, а не перекрашивает кнопки.
 *
 * Отсюда же берут `useInk`/`inkVars` ряды настроек (SettingsNav, SectionTabs) —
 * у них свои классы (.sm-ptab / .s-ptab), но поведение общее.
 */

/**
 * Позиция «чернил» ряда вкладок — меряется по кнопке с атрибутом `data-ink`.
 * Пересчитываем и при смене активной вкладки, и когда ряд (или любая его
 * кнопка) меняет размер: язык, шрифт и ширина окна двигают метрики, а индикатор
 * обязан приезжать ровно под кнопку.
 *
 * `ready` гасит переход на самой первой установке позиции. Стартуем мы с
 * x=0/w=0, и без этого флага пилюля «выезжает» слева при каждом появлении ряда:
 * measure() читает offsetLeft (это форсит пересчёт стилей с нулём), а следующий
 * рендер даёт настоящие координаты — браузер честно анимирует 0 → позиция.
 * Нулевую ширину (ряд скрыт/ещё не разложен) вообще не запоминаем, иначе при
 * показе панели фильтров пилюля поедет из левого края повторно.
 */
export function useInk(ref: RefObject<HTMLDivElement | null>, dep: unknown) {
  const [ink, setInk] = useState({ x: 0, w: 0, ready: false })
  useLayoutEffect(() => {
    const row = ref.current
    if (!row) return
    let raf = 0
    const measure = () => {
      const el = row.querySelector<HTMLElement>('[data-ink]')
      if (!el) return
      const x = el.offsetLeft
      const w = el.offsetWidth
      if (!w) return
      setInk((p) => (p.x === x && p.w === w ? p : { x, w, ready: p.ready }))
      // Переходы включаем следующим кадром — уже после того, как пилюля
      // отрисовалась на месте.
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0
          setInk((p) => (p.ready ? p : { ...p, ready: true }))
        })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    for (const c of Array.from(row.children)) ro.observe(c)
    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref, dep])
  return ink
}

/** CSS-переменные индикатора для inline-style. */
export const inkVars = (i: { x: number; w: number; ready?: boolean }) =>
  ({
    '--ink-x': `${i.x}px`,
    '--ink-w': `${i.w}px`,
    ...(i.ready === false ? { transition: 'none' } : null),
  }) as CSSProperties

export interface PillTabItem<T extends string> {
  id: T
  label: string
  icon?: ReactNode
}

export const PillTabs = <T extends string>({
  tabs,
  active,
  onSelect,
  className,
  id,
}: {
  tabs: PillTabItem<T>[]
  active: T
  onSelect: (id: T) => void
  /** Доп. класс контейнера — раскладка ряда (центрирование, отступы) снаружи. */
  className?: string
  id?: string
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const ink = useInk(ref, active)

  return (
    <div className={cn('pill-tabs', className)} id={id} ref={ref} role="tablist">
      {/* Пилюля лежит ПЕРВОЙ, чтобы кнопки рисовались поверх неё. */}
      <span className="pill-tab-ink" style={inkVars(ink)} />
      {tabs.map((tb) => (
        <button
          key={tb.id}
          type="button"
          role="tab"
          aria-selected={active === tb.id}
          data-ink={active === tb.id ? '' : undefined}
          className={cn('pill-tab', active === tb.id && 'active')}
          onClick={() => onSelect(tb.id)}
        >
          {tb.icon && <span className="pill-tab-ico">{tb.icon}</span>}
          <span className="pill-tab-lbl">{tb.label}</span>
        </button>
      ))}
    </div>
  )
}
