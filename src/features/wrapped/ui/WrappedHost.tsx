import { useEffect } from 'react'
import { useLocale } from '@shared/i18n'
import { notify } from '@shared/ui'
import { useWrappedDataStore, useWrappedEntries } from '../model/wrappedDataStore'
import { useWrappedUiStore } from '../model/wrappedUiStore'
import type { WrappedData } from '../lib/aggregate'
import {
  isPeriodNotified,
  markPeriodNotified,
  markPeriodSeen,
  periodDatesLabel,
  periodRange,
  scheduledPeriods,
  type PeriodKind,
} from '../lib/periods'
import { fmtListenTime, plural } from '../lib/fmt'
import { WrappedModal } from './WrappedModal'

/**
 * Невидимый хост «Итогов»: держит модалку и шлёт напоминания.
 *
 * Раньше и то и другое жило в баннере профиля — но баннер теперь только
 * годовой и появляется лишь в декабре, а открыть итоги можно из трёх мест
 * (подменённая карточка статистики, кнопка в панели статистики, плашка года).
 * Модалка обязана существовать независимо от них, поэтому хост монтируется на
 * странице профиля один раз и висит всегда.
 */

const TITLE_KEY = { month: 'wrapped.month', year: 'wrapped.year' } as const

export const WrappedHost = () => {
  const loc = useLocale()
  const { month, year } = useWrappedEntries()

  const open = useWrappedUiStore((s) => s.open)
  const initial = useWrappedUiStore((s) => s.initial)
  const setOpen = useWrappedUiStore((s) => s.setOpen)
  const bumpSeen = useWrappedDataStore((s) => s.bumpSeen)

  // Напоминание — в свой день, один раз на период и только если есть данные.
  // Метку ставим ДО notify: в StrictMode эффект прогоняется дважды.
  useEffect(() => {
    const have: Partial<Record<PeriodKind, WrappedData>> = { month: month ?? undefined, year: year ?? undefined }
    for (const k of scheduledPeriods()) {
      const d = have[k]
      const r = periodRange(k)
      if (!d || isPeriodNotified(r)) continue
      markPeriodNotified(r)
      notify({
        kind: 'info',
        titleKey: TITLE_KEY[k],
        body: `${periodDatesLabel(r, loc)} · ${plural(loc, d.plays, 'plays')} · ${fmtListenTime(loc, d.sec)}`,
        action: () => setOpen(true, k),
        actionLabelKey: 'wrapped.watch',
      })
    }
    // loc намеренно вне зависимостей: уже отправленное уведомление всё равно не
    // перерисовать, а перезапускать проверку из-за смены языка незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year])

  if (!open) return null

  // Период всегда известен заранее — его называет сам вход. Фолбэк на месяц
  // нужен разве что для уведомления, пришедшего когда данных уже нет.
  const kind: PeriodKind = initial ?? 'month'
  const d = kind === 'year' ? year : month
  if (!d) return null

  return (
    <WrappedModal
      period={kind}
      d={d}
      onClose={() => setOpen(false)}
      onSeen={(k) => {
        markPeriodSeen(periodRange(k))
        bumpSeen()
      }}
    />
  )
}
