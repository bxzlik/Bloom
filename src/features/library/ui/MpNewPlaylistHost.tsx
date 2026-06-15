import { useNewPlModalStore } from '../model/newPlModalStore'
import { usePlaylistStore } from '../model/playlistStore'
import { NewPlaylistModal } from './NewPlaylistModal'

/**
 * Хост модалки «Новый плейлист» для кросс-оконного сценария: miniplayer/tray
 * «+» → «Новый плейлист» открывает её в главном окне (через useNewPlModalStore),
 * и после создания добавляет запомненный трек. Рендерится один раз в App.
 */
export const MpNewPlaylistHost = () => {
  const open = useNewPlModalStore((s) => s.open)
  const pendingTrackId = useNewPlModalStore((s) => s.pendingTrackId)
  const close = useNewPlModalStore((s) => s.close)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)

  return (
    <NewPlaylistModal
      open={open}
      onClose={close}
      onCreated={(id) => {
        if (pendingTrackId) addTrackToPl(id, pendingTrackId)
      }}
    />
  )
}
