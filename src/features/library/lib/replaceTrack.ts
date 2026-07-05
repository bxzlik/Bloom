import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { useLibStore, usePlaylistStore, useFavStore } from '../model'
import { idbSaveMeta, idbDeleteTrack } from './idb'

/**
 * Персистентно заменить трек в библиотеке версией с другой площадки. id трека
 * меняется, поэтому ремапим ВСЕ ссылки на него:
 * - `useLibStore.tracks` — замена на той же позиции + сохранённый tracksOrder;
 * - плейлисты (`remapTrack`) и лайки (`remap`, favAt переносится);
 * - IDB — кладём meta нового, удаляем запись старого;
 * - реестр треков — регистрируем новый как постоянный.
 *
 * Историю/статистику/очередь не трогаем: висячий старый id там безвреден
 * (пропускается при resolve), как и в `cascadePurgeTrackRefs`. Очередь при
 * необходимости ремапит вызывающая сторона (`switchTrackPlatform`).
 */
export const replaceLibTrack = (oldId: string, next: Track): void => {
  if (oldId === next.id) return
  useLibStore.getState().replaceTrack(oldId, next)
  usePlaylistStore.getState().remapTrack(oldId, next.id)
  useFavStore.getState().remap(oldId, next.id)
  trackRegistry.put(next)
  trackRegistry.promote(next.id)
  void idbSaveMeta(next).catch((e) => console.warn('idbSaveMeta failed', e))
  void idbDeleteTrack(oldId).catch((e) => console.warn('idbDeleteTrack failed', e))
}
