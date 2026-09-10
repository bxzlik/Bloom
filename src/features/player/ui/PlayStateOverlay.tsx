import type { CSSProperties } from 'react'
import { useQueueStore } from '../model/queueStore'

/**
 * Габариты эквалайзера на крупных обложках-карточках (140px).
 * Ширина и зазор берутся из `--bars-*-lg` — их считает [barsSnap] под текущий
 * масштаб экрана, иначе на дробном зуме полосы кажутся разной толщины. Числа в
 * фоллбэках должны совпадать с `BASE.wLg`/`BASE.gapLg` там же.
 */
const CARD_BARS = {
  '--bars-w': 'var(--bars-w-lg, 5px)',
  '--bars-gap': 'var(--bars-gap-lg, 4px)',
  '--bars-h': '29px',
} as CSSProperties

/**
 * Оверлеи состояния трека поверх обложки: спиннер `.trcov-loading`, пока стрим
 * резолвится/буферизуется (`loadingId`), и оверлей-эквалайзер
 * `.tr-playing-overlay` у играющего трека (`curId`). Тот же индикатор, что в
 * строках библиотеки ([LibTracklist] TrackRow). Родитель должен быть
 * `position:relative; overflow:hidden`.
 *
 * `size='card'` — увеличенные спиннер/эквалайзер для крупных обложек-карточек
 * (поиск/главная, ~140px), где дефолтный «строчный» размер (под 45px) мелковат.
 */
export const PlayStateOverlay = ({
  trackId,
  size = 'row',
  showLoading = true,
}: {
  trackId: string
  size?: 'row' | 'card'
  /**
   * Показывать ли плёнку резолва стрима. `false` — если карточка сообщает о
   * загрузке иначе (спиннер в кнопке play, см. ChartCard): тёмный прямоугольник
   * поверх обложки там читается как заплатка.
   */
  showLoading?: boolean
}) => {
  const isCurrent = useQueueStore((s) => s.curId === trackId)
  const isLoading = useQueueStore((s) => s.loadingId === trackId)
  const card = size === 'card'
  if (isLoading && showLoading) {
    return (
      <div className="trcov-loading">
        <div
          className="sc-spinner"
          style={card ? { width: 28, height: 28, borderWidth: 3 } : undefined}
        />
      </div>
    )
  }
  if (isCurrent) {
    return (
      <div
        className="tr-playing-overlay"
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Эквалайзер: на карточках увеличиваем ручками --bars-*, а НЕ
            transform:scale — масштаб мылит торцы полос и свечение. */}
        <div className="bars" style={card ? CARD_BARS : undefined}>
          <span /><span /><span />
        </div>
      </div>
    )
  }
  return null
}
