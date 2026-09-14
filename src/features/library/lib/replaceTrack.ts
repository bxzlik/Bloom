import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { renamePlayLogTrack } from '@/db/playLog'
import { renamePlayStatsTrack } from '@/db/playStats'
import { useLibStore, usePlaylistStore, useFavStore } from '../model'
import { useHistoryStore } from '../model/historyStore'
import { idbSaveMeta, idbDeleteTrack } from './idb'

/**
 * Персистентно заменить трек в библиотеке версией с другой площадки. id трека
 * меняется, поэтому ремапим ВСЕ ссылки на него:
 * - `useLibStore.tracks` — замена на той же позиции + сохранённый tracksOrder;
 * - плейлисты (`remapTrack`) и лайки (`remap`, favAt переносится);
 * - IDB — кладём meta нового, удаляем запись старого;
 * - реестр треков — регистрируем новый как постоянный;
 * - прослушивания — журнал, старую историю и отметки скрытия «Истории».
 *
 * Прослушивания переносим, потому что трек тот же: без этого они делились бы
 * между двумя id — счётчик новой версии с нуля (сиды волны, умная перемешка,
 * «Для вас»), в «Итогах» два трека, а строка «Истории» так и играла бы старую
 * площадку, собранная из снимка журнала. Очередь при необходимости ремапит
 * вызывающая сторона (`switchTrackPlatform`).
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
  // Отметку скрытия — до пересчёта статистики: иначе подписка «Истории» на
  // `playStats` успела бы показать спрятанный трек под новым id.
  useHistoryStore.getState().renameTrack(oldId, next.id)
  renamePlayStatsTrack(oldId, next.id)
  void renamePlayLogTrack(oldId, next.id)
}
