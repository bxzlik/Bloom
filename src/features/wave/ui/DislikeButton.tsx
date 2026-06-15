import { useQueueStore } from '@features/player/model/queueStore'
import { useLibStore } from '@features/library/model/store'
import { toast } from '@shared/ui'
import waveApi from '@/wave'
import { useDislikesStore } from '../model/dislikesStore'

/**
 * Кнопка дизлайка текущего трека (#dislikeBtn).:
 * toggle dislike/undislike через Wave.feedback, красная подсветка когда дизлайкнут
 * (#dislikeBtn.lyr-active). Дизлайк работает и без активной волны — это глобальная
 * пометка, по которой волна больше не предложит трек.
 */
export const DislikeButton = () => {
  const curId = useQueueStore((s) => s.curId)
  const scDisliked = useDislikesStore((s) => (curId ? s.entries.some((e) => e.id === curId) : false))
  const libDisliked = useLibStore((s) =>
    curId ? !!s.tracks.find((t) => t.id === curId)?.disliked : false,
  )
  const disliked = scDisliked || libDisliked

  const onClick = () => {
    if (!curId) {
      toast('Нет текущего трека')
      return
    }
    waveApi.feedback({ action: disliked ? 'undislike' : 'dislike', trackId: curId })
    toast(disliked ? 'Дизлайк снят' : 'Дизлайк — больше не предложу в волне')
  }

  return (
    <button
      className={`lyrics-btn${disliked ? ' lyr-active' : ''}`}
      id="dislikeBtn"
      onClick={onClick}
      aria-label={disliked ? 'Снять дизлайк' : 'Дизлайк'}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
        <path d="M22 2h-4v13" />
      </svg>
    </button>
  )
}
