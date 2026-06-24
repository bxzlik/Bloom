import { useEffect } from 'react'
import { useNavStore } from '@app/navigationStore'
import { useNewPlModalStore } from '../model/newPlModalStore'
import { createPlaylistInline } from '../lib/createPlaylistInline'

/**
 * Кросс-оконное создание плейлиста: miniplayer/tray «+» → «Новый плейлист»
 * (Rust `mp_open_new_pl` → событие `bloom-mp-new-pl` → `useMainPlayerBridge`
 * зовёт `openModal(curId)`). Здесь, в главном окне, мгновенно создаём плейлист
 * с запомненным треком, уходим в библиотеку и открываем его в inline-редакте.
 * Рендерится один раз в App; собственного UI не имеет.
 */
export const MpNewPlaylistHost = () => {
  const open = useNewPlModalStore((s) => s.open)
  const pendingTrackId = useNewPlModalStore((s) => s.pendingTrackId)
  const close = useNewPlModalStore((s) => s.close)

  useEffect(() => {
    if (!open) return
    useNavStore.getState().goNav('lib')
    createPlaylistInline(pendingTrackId ? { trackId: pendingTrackId } : undefined)
    close()
  }, [open, pendingTrackId, close])

  return null
}
