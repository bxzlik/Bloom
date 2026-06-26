import { useQueueStore } from '@features/player/model/queueStore'
import { useLibStore } from '@features/library/model/store'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import waveApi from '@/wave'
import { useDislikesStore } from '../model/dislikesStore'

/**
 * Кнопка дизлайка текущего трека (#dislikeBtn).:
 * toggle dislike/undislike через Wave.feedback, красная подсветка когда дизлайкнут
 * (#dislikeBtn.lyr-active). Дизлайк работает и без активной волны — это глобальная
 * пометка, по которой волна больше не предложит трек.
 */
export const DislikeButton = () => {
  const t = useT()
  const curId = useQueueStore((s) => s.curId)
  const scDisliked = useDislikesStore((s) => (curId ? s.entries.some((e) => e.id === curId) : false))
  const libDisliked = useLibStore((s) =>
    curId ? !!s.tracks.find((t) => t.id === curId)?.disliked : false,
  )
  const disliked = scDisliked || libDisliked

  const onClick = () => {
    if (!curId) {
      toast(t('wave.toast.noTrack'))
      return
    }
    waveApi.feedback({ action: disliked ? 'undislike' : 'dislike', trackId: curId })
    toast(disliked ? t('wave.toast.removed') : t('wave.toast.added'))
  }

  return (
    <button
      className={`lyrics-btn${disliked ? ' lyr-active' : ''}`}
      id="dislikeBtn"
      onClick={onClick}
      aria-label={disliked ? t('wave.unlike') : t('wave.dislike')}
    >
      <Ico name="dislike" width={16} height={16} />
    </button>
  )
}
