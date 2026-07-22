import { coverCache } from '@entities/track'
import { usePlaylistStore, useFavStore, useHistoryStore } from '../model'

/**
 * Каскадная чистка ссылок на удалённые треки из персистентных сторов.
 *
 * При удалении трека из библиотеки его id мог остаться в плейлистах, лайках и
 * истории — это «висячие» ссылки: счётчики (favs.size / pl.trs.length) показывали
 * их, а вид (фильтрует по существующим трекам) — нет. Расхождение «0 треков, но
 * в сайдбаре 5». `__bloomFolderTrackRemoved`, где
 * лайк жил на самом треке и удалялся автоматически, а плейлисты/история чистились
 * явно. Очередь — транзитная (висячий id просто пропускается в loadPlay), её не
 * трогаем здесь.
 */
export const cascadePurgeTrackRefs = (ids: string[]): void => {
  if (!ids.length) return
  usePlaylistStore.getState().purgeTracks(ids)
  useFavStore.getState().purge(ids)
  const hist = useHistoryStore.getState()
  for (const id of ids) hist.remove(id)
  // Кеш обложек (id → URL) тоже персистентный — иначе бы копил мусор.
  coverCache.remove(ids)
}
