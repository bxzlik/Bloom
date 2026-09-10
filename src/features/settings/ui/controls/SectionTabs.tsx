import { useRef, type ReactNode } from 'react'
import { useInk, inkVars } from '@shared/ui/PillTabs'

/**
 * «Чернила» ряда вкладок живут в общем `@shared/ui/PillTabs` — тем же
 * поведением пользуются ряды поиска и страницы артиста. Здесь только реэкспорт,
 * чтобы не менять импорты внутри настроек.
 */
export { useInk, inkVars }

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: ReactNode
}

/**
 * Полоса вкладок внутри раздела настроек (`.s-ptabs`) — «Интерфейс/Боковые
 * панели», «Главная/Библиотека/Поиск» и т.п. Вид и поведение те же, что у ряда
 * секций в шапке панели: пилюля-индикатор переезжает под выбранную вкладку.
 */
export const SectionTabs = <T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabItem<T>[]
  active: T
  onSelect: (id: T) => void
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const ink = useInk(ref, active)

  return (
    <div className="s-ptabs" ref={ref}>
      {/* Пилюля лежит ПЕРВОЙ, чтобы кнопки рисовались поверх неё. */}
      <span className="s-ptab-ink" style={inkVars(ink)} />
      {tabs.map((tb) => (
        <button
          key={tb.id}
          type="button"
          data-ink={active === tb.id ? '' : undefined}
          className={`s-ptab${active === tb.id ? ' active' : ''}`}
          onClick={() => onSelect(tb.id)}
        >
          {tb.icon && <span className="s-ptab-ico">{tb.icon}</span>}
          <span className="s-ptab-lbl">{tb.label}</span>
        </button>
      ))}
    </div>
  )
}
