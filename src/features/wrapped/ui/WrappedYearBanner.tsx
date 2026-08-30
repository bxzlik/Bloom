import { useLocale, useT } from '@shared/i18n'
import { useWrappedEntries } from '../model/wrappedDataStore'
import { useWrappedUiStore } from '../model/wrappedUiStore'
import { fmtListenTime, plural } from '../lib/fmt'

/**
 * Плашка «Итоги года» в профиле — единственный вход в годовые итоги, и живёт он
 * ТОЛЬКО в декабрьском окне (см. periods.ts): в остальное время года плашки на
 * странице просто нет. Итоги месяца сюда не попадают — у них свой вход, подмена
 * карточки статистики.
 *
 * Оформлена как соседние карточки профиля: прозрачная, с одной волосяной
 * рамкой — своей заливки нет. Единственное украшение — тонкая дуга во всю
 * ширину, по которой бежит блик; она нарисована дважды (тусклая основа и яркий
 * дубль под подвижной маской), см. wrapped.css: --wry-h, --wry-line-op,
 * --wry-shine-ms, --wry-flow-ms.
 */

/**
 * Волна на два периода. viewBox вдвое шире видимой области (2400 при видимых
 * 1200), а второй период — точная копия первого: CSS двигает путь ровно на один
 * период, поэтому цикл незаметен (см. wryFlow в wrapped.css).
 *
 * Контрольные точки соседних половин симметричны относительно узлов
 * (…,29 ↔ …,71 вокруг y=50) — только так стыки кубик остаются гладкими и по
 * линии не едет угол.
 */
const WAVE =
  'M0,50 C 200,29 400,29 600,50 C 800,71 1000,71 1200,50 ' +
  'C 1400,29 1600,29 1800,50 C 2000,71 2200,71 2400,50'

const Wave = () => (
  <svg viewBox="0 0 2400 100" preserveAspectRatio="none" aria-hidden="true">
    <path d={WAVE} />
  </svg>
)

export const WrappedYearBanner = () => {
  const t = useT()
  const loc = useLocale()
  const { year, yearUnseen } = useWrappedEntries()
  const setOpen = useWrappedUiStore((s) => s.setOpen)

  if (!year) return null

  const covers = year.topTracks.map((tr) => tr.cover).filter((c): c is string => !!c).slice(0, 4)

  return (
    <button className="wry" onClick={() => setOpen(true, 'year')}>
      <span className="wry-line" aria-hidden="true">
        <Wave />
        <span className="wry-shine">
          <Wave />
        </span>
      </span>

      <span className="wry-in">
        <span className="wry-txt">
          <span className="wry-head">
            <span className="wry-title">{t('wrapped.year')}</span>
            {yearUnseen && <span className="wry-new">{t('wrapped.new')}</span>}
          </span>
          <span className="wry-sub">
            {plural(loc, year.plays, 'plays')} · {fmtListenTime(loc, year.sec)}
          </span>
        </span>

        {covers.length > 0 && (
          <span className="wry-covers" aria-hidden="true">
            {covers.map((src, i) => (
              <img src={src} alt="" key={i} loading="lazy" decoding="async" />
            ))}
          </span>
        )}

        <span className="wry-cta">{t('wrapped.watch')}</span>
      </span>
    </button>
  )
}
