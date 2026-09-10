export { WrappedYearBanner } from './ui/WrappedYearBanner'
export { WrappedHost } from './ui/WrappedHost'
export { WrappedModal } from './ui/WrappedModal'
export { useWrappedUiStore } from './model/wrappedUiStore'
export { useWrappedDataStore, useWrappedEntries, type WrappedEntries } from './model/wrappedDataStore'
// Журнал переехал в `src/db/` (слой ниже фич): на нём теперь стоят не только
// «Итоги», но и общая статистика прослушиваний — см. `db/playStats`.
export { logPlay, clearPlayLog, loadPlayLog, playLogSize } from '@/db/playLog'
export { buildWrapped, type WrappedData } from './lib/aggregate'
export {
  scheduledPeriods,
  periodRange,
  periodDatesLabel,
  PERIOD_ORDER,
  type PeriodKind,
} from './lib/periods'
