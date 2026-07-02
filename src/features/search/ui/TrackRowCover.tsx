import { useEffect, useState, type ReactNode } from 'react'
import type { Track } from '@entities/track'
import { CoverSourceBadge } from '@entities/track'
import { useQueueStore, PlayStateOverlay } from '@features/player'

/**
 * Обложка строки трека (.trcov) для результатов поиска и детальных страниц.
 * Помимо картинки + бейджа источника показывает те же оверлеи, что и библиотека
 * ([LibTracklist] TrackRow): спиннер загрузки и эквалайзер играющего трека
 * (через [PlayStateOverlay]). Бейдж прячем, пока виден оверлей.
 */
export const TrackRowCover = ({ track, placeholder }: { track: Track; placeholder: ReactNode }) => {
  // Защита от onerror-цикла (см. project_idle_cpu_backdrop): один раз падаем на
  // плейсхолдер, без ре-триггера через src=''.
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [track.cover])
  const active = useQueueStore((s) => s.curId === track.id || s.loadingId === track.id)
  return (
    <div className="trcov">
      {track.cover && !failed ? (
        <img src={track.cover} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        placeholder
      )}
      <PlayStateOverlay trackId={track.id} />
      {!active && <CoverSourceBadge track={track} />}
    </div>
  )
}
