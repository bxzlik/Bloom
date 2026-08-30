import { useEffect } from 'react'
import { usePlayerStore, useQueueStore } from '@features/player'
import { trackRegistry } from '@entities/track'
import { useLibStore } from '@features/library'
import { useLastfmStore } from '../model/lastfmStore'

/**
 * Мост Last.fm-скробблинга в main окне. Подключается ОДИН раз в App.tsx.
 *
 *   - смена `curId` (queueStore) → `onTrackStart` (resolve трека lib→registry,
 *     вызова в playTr/loadPlay);
 *   - тик `position` (playerStore) → `onProgress` (засчёт по 30с/50%/240с,
 *     слушателя timeupdate).
 *
 * Сами проверки sk/enabled — внутри onTrackStart/onProgress стора; мост лишь
 * прокидывает события плеера, не зная, включён ли скробблинг.
 */
export const useLastfmBridge = () => {
  // Смена трека → onTrackStart.
  useEffect(() => {
    let prevId = useQueueStore.getState().curId
    let prevArmed = useQueueStore.getState().armed
    const unsub = useQueueStore.subscribe((s) => {
      // «Трек пошёл» — это либо смена curId, либо снятие `armed`: восстановленная
      // после перезапуска сессия ставит curId ЗАРАНЕЕ, ничего не играя, и её
      // реальный старт виден только по сброшенному флагу (иначе Last.fm никогда
      // не узнал бы о первом треке после запуска).
      const started = s.curId !== prevId || (prevArmed && !s.armed)
      prevId = s.curId
      prevArmed = s.armed
      if (!started || !s.curId) return
      // Пока сессия только восстановлена — «now playing» слать нечего.
      if (s.armed) return
      const t = trackRegistry.get(s.curId) ?? useLibStore.getState().tracks.find((x) => x.id === s.curId)
      if (!t) return
      useLastfmStore.getState().onTrackStart(t.artist || '', t.name || '', t.album || '')
    })
    return unsub
  }, [])

  // Тик позиции → onProgress.
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((s, prev) => {
      if (s.position === prev.position) return
      // Восстановленная сессия: позиция выставлена из резюма (и двигается только
      // перемоткой) — это не прослушивание, засчитывать его нельзя.
      if (useQueueStore.getState().armed) return
      useLastfmStore.getState().onProgress(s.position, s.duration)
    })
    return unsub
  }, [])
}
