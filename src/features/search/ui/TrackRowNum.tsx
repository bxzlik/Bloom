import { Ico } from '@shared/ui/icons/solar'
import { useQueueStore } from '@features/player'

/**
 * Ячейка номера трека (.trnum) вместо обложки — для альбомов, где обложка у всех
 * треков одна и та же. Показывает порядковый номер, при наведении на строку —
 * иконку play, у играющего трека — эквалайзер, у резолвящегося — спиннер
 * (те же состояния, что [PlayStateOverlay] даёт поверх обложки).
 */
export const TrackRowNum = ({ num, trackId }: { num: number; trackId: string }) => {
  const isCurrent = useQueueStore((s) => s.curId === trackId)
  const isLoading = useQueueStore((s) => s.loadingId === trackId)
  return (
    <div className="trnum">
      {isLoading ? (
        <div className="sc-spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0 }} />
      ) : isCurrent ? (
        <div className="bars">
          <span /><span /><span />
        </div>
      ) : (
        <>
          <span className="trnum-i">{num}</span>
          <span className="trnum-p">
            <Ico name="play" width={15} height={15} />
          </span>
        </>
      )}
    </div>
  )
}
