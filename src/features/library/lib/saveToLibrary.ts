import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { useLibStore } from '../model/store'
import { idbSaveMeta } from './idb'

/**
 * Сохранить трек в библиотеку навсегда. Для треков площадок (SoundCloud/Yandex):
 * снимает temp-флаг, кладёт в `useLibStore` + персистит meta в IDB (без Blob —
 * стрим резолвится source-resolver'ом).
 *
 * Идемпотентно: если трек уже в библиотеке — ничего не делает.
 * Возвращает true, если трек был добавлен (false — уже был).
 */
export const saveTrackToLibrary = (track: Track): boolean => {
  const { tracks, addTracks } = useLibStore.getState()
  if (tracks.some((t) => t.id === track.id)) return false

  const permanent: Track = {
    ...track,
    _scTemp: false,
    _ymTemp: false,
    addedAt: track.addedAt ?? Date.now(),
    url: null, // blob/stream URL не персистим
  }

  // Новый трек — наверх «Все треки». Поддержание
  // сохранённого порядка (чтобы applyTracksOrder не увёл новый id вниз) живёт
  // централизованно в useLibStore.addTracks({prepend}).
  addTracks([permanent], { prepend: true })

  trackRegistry.promote(track.id) // на случай, если ещё используется из реестра
  void idbSaveMeta(permanent).catch((e) => console.warn('idbSaveMeta failed', e))
  return true
}
