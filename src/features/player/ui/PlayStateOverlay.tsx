import { useQueueStore } from '../model/queueStore'

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
}: {
  trackId: string
  size?: 'row' | 'card'
}) => {
  const isCurrent = useQueueStore((s) => s.curId === trackId)
  const isLoading = useQueueStore((s) => s.loadingId === trackId)
  const card = size === 'card'
  if (isLoading) {
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
        {/* Эквалайзер: на карточках масштабируем контейнер (спаны с фикс. px). */}
        <div className="bars" style={card ? { transform: 'scale(1.9)' } : undefined}>
          <span /><span /><span />
        </div>
      </div>
    )
  }
  return null
}
