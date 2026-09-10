import type { CSSProperties } from 'react'
import { useT } from '@shared/i18n'
import { stampDate } from '../lib/formatCount'

export interface DateMetaProps {
  /** Метка слева: «Создан» / «Добавлен». */
  label: string
  /** Время события (ms). Пусто/0 — строки не будет. */
  ts?: number | null
  /** Разделитель-точка перед меткой — когда дата встраивается в чужую подпись. */
  dot?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * Дата события рядом с названием: «Создан 2 сент. 2026 г.».
 *
 * Метка приглушена, сама дата — обычным цветом: глаз должен цепляться за дату,
 * а не за слово перед ней (так же сделано в шторках на телефоне).
 *
 * Времени нет — плейлист заводят и трек добавляют один раз, час тут ничего не
 * значит; а без метки времени (`ts` пуст) строка не рисуется вовсе: прочерк на
 * её месте не сказал бы ничего.
 */
export const DateMeta = ({ label, ts, dot, className, style }: DateMetaProps) => {
  if (!ts || ts <= 0) return null
  return (
    <span className={`meta-date${className ? ` ${className}` : ''}`} style={style}>
      {dot && <span className="meta-date-dot">·</span>}
      <span className="meta-date-lbl">{label}</span>
      {stampDate(ts)}
    </span>
  )
}

/** «Создан …» — обёртка над [DateMeta] с готовой меткой (реактивна к языку). */
export const CreatedMeta = (props: Omit<DateMetaProps, 'label'>) => {
  const t = useT()
  return <DateMeta {...props} label={t('common.createdOn')} />
}

/** «Добавлен …» — то же для времени попадания трека в библиотеку. */
export const AddedMeta = (props: Omit<DateMetaProps, 'label'>) => {
  const t = useT()
  return <DateMeta {...props} label={t('common.addedOn')} />
}
