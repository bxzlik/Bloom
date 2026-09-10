import { useT } from '@shared/i18n'
import type { Track } from '../model/types'

/**
 * Динамика позиции в чарте: «▲2» / «▼3» / «new» / «—».
 *
 * Данные приходят только у треков из `getCharts()` (`chartShift` / `chartNew`,
 * см. entities/track/model/types). Компонент рисуется и на карточке витрины
 * (`variant="chip"` — тёмная пилюля поверх обложки), и в строке страницы чарта
 * (`variant="bare"` — под номером позиции, как у Яндекса).
 */
export const ChartTrend = ({ track, variant = 'bare' }: { track: Track; variant?: 'chip' | 'bare' }) => {
  const t = useT()
  if (!track.chartPos) return null
  const shift = track.chartShift ?? 0
  const kind = track.chartNew ? 'new' : shift > 0 ? 'up' : shift < 0 ? 'down' : 'same'
  const label =
    kind === 'new'
      ? t('chart.new')
      : kind === 'up'
        ? t('chart.up', { n: shift })
        : kind === 'down'
          ? t('chart.down', { n: -shift })
          : t('chart.same')
  return (
    <span className={`ctrend ctrend-${kind}${variant === 'chip' ? ' is-chip' : ''}`} aria-label={label}>
      {kind === 'new' ? (
        t('chart.newShort')
      ) : kind === 'same' ? (
        '—'
      ) : (
        <>
          <span className="ctrend-ar">{kind === 'up' ? '▲' : '▼'}</span>
          {Math.abs(shift)}
        </>
      )}
    </span>
  )
}
