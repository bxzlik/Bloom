import { useEffect } from 'react'
import { invoke } from '@shared/tauri'
import { useTauriEvent } from '@shared/hooks'
import { usePlayerStore } from '../model/store'
import { useQueueStore } from '../model/queueStore'
import { bootstrapSpeed } from '../model/speedStore'
import { saveVolumePrefs } from '../model/volumePrefs'
import { audioEngine } from './audioEngine'
import { saveResume, consumePendingResumeSeek } from './resume'
import {
  togglePlay,
  nextTr,
  prevTr,
  creditPlay,
  seek as seekApi,
  setVol,
  toggleShuffleMain,
  cycleRepeatMain,
  toggleCurFav,
  mpAddCurrentToLib,
  mpAddCurrentToPl,
  mpOpenNewPlForCurrent,
  _pushNowPlaying,
  _pushNowPlayingThrottled,
} from '../api/play'

/**
 * Регистрирует MediaSession action handlers (один раз). Метаданные ставим
 * отдельно при смене трека (см. subscribe ниже).
 *
 * Обрабатываются медиа-клавиши (Play/Pause/Prev/Next) + Windows volume HUD
 * + сторонние интеграции (Spicetify-like).
 */
const wireMediaSessionActions = (): void => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  navigator.mediaSession.setActionHandler('play', () => {
    void audioEngine.play()
  })
  navigator.mediaSession.setActionHandler('pause', () => {
    audioEngine.pause()
  })
  navigator.mediaSession.setActionHandler('previoustrack', () => prevTr())
  navigator.mediaSession.setActionHandler('nexttrack', () => nextTr())
  navigator.mediaSession.setActionHandler('seekto', (d) => {
    if (typeof d.seekTime === 'number') seekApi(d.seekTime)
  })
}

/**
 * Главный мост в main окне. Подписывает audioEngine на usePlayerStore
 * (двусторонний sync: engine → store, engine → next-on-ended), и принимает
 * команды из tray-popup/miniplayer через события Rust.
 *
 * Подключается ОДИН раз в App.tsx.
 */
export const useMainPlayerBridge = () => {
  // ── engine → store (position/playing/duration) ──
  useEffect(() => {
    let lastResumeSaveAt = 0
    let prevPlaying = !audioEngine.paused
    const offUpd = audioEngine.onUpdate(() => {
      const nowPlaying = !audioEngine.paused
      usePlayerStore.setState({
        position: audioEngine.currentTime,
        playing: nowPlaying,
      })
      // Смена play↔pause — шлём СРАЗУ (не throttle): иначе пауза «съедается»
      // throttle'ом после частых position-пушей, и Rust не получает playing=false
      // → Discord-активность при паузе не гаснет. Position-тики — throttled.
      if (nowPlaying !== prevPlaying) {
        prevPlaying = nowPlaying
        _pushNowPlaying()
      } else {
        _pushNowPlayingThrottled()
      }
      // Засчитываем прослушивание при достижении 90% трека. creditPlay сам гарантирует единичный зачёт.
      const cur = useQueueStore.getState().curId
      const dur = audioEngine.duration
      if (cur && dur > 0 && audioEngine.currentTime >= dur * 0.9) creditPlay(cur)
      // Резюм «Продолжить»: throttled ~4s.
      const now = Date.now()
      if (now - lastResumeSaveAt > 4000) {
        lastResumeSaveAt = now
        saveResume('progress')
      }
    })
    const offMeta = audioEngine.onLoadedMeta(() => {
      // Стрим загружен — снимаем спиннер «загрузки» с обложки.
      const q = useQueueStore.getState()
      if (q.loadingId) q.setLoadingId(null)
      const dur = audioEngine.duration
      if (dur > 0) {
        usePlayerStore.setState({ duration: dur })
        _pushNowPlaying()
      }
      // Перемотка на сохранённую позицию при восстановлении «Продолжить».
      const seekPos = consumePendingResumeSeek()
      if (seekPos != null) {
        audioEngine.seekTo(seekPos)
        usePlayerStore.setState({ position: seekPos })
      }
      // Фиксируем «Продолжить» СРАЗУ как стала известна длительность нового трека
      // (saveResume требует duration). Иначе трек попадал в резюме лишь через ~4с
      // (throttle) — закрыл раньше → в карточке оставался старый. ПОСЛЕ возможного
      // restore-seek, чтобы не записать pos=0 поверх восстановленной позиции.
      if (dur > 0) saveResume('progress')
    })
    const offEnded = audioEngine.onEndedSubscribe(() => {
      // Трек доиграл до конца — засчитываем, если ещё не (короткий трек мог не
      // попасть на 90%-тик timeupdate). ended-обработчика.
      const cur = useQueueStore.getState().curId
      if (cur) creditPlay(cur)
      // ended: автоматический переход на следующий (или repeat-one — но
      // repeat-one обрабатывается в nextTr через seek-to-zero).
      const { repeat, queue, qIdx } = useQueueStore.getState()
      if (repeat === 2 && qIdx >= 0 && queue[qIdx]) {
        audioEngine.seekTo(0)
        void audioEngine.play()
      } else {
        nextTr()
      }
    })
    const offErr = audioEngine.onErrorSubscribe(() => {
      // Ошибка загрузки — снимаем спиннер, иначе зависнет.
      const q = useQueueStore.getState()
      if (q.loadingId) q.setLoadingId(null)
    })
    return () => {
      offUpd()
      offMeta()
      offEnded()
      offErr()
    }
  }, [])

  // Снимок «Продолжить» при закрытии окна — гарантирует, что последний трек/позиция
  // записаны, даже если закрыли раньше 4с-throttle ( beforeunload
  // → saveResumePos('snapshot')).
  useEffect(() => {
    const onUnload = () => saveResume('snapshot')
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // body.audio-paused — управляет анимацией эквалайзер-баров (.bars) на обложках:
  // играет → бары анимируются, пауза → замирают.
  useEffect(() => {
    const apply = (playing: boolean) =>
      document.body.classList.toggle('audio-paused', !playing)
    apply(usePlayerStore.getState().playing)
    return usePlayerStore.subscribe((s, p) => {
      if (s.playing !== p.playing) apply(s.playing)
    })
  }, [])

  // ── события из tray-popup / miniplayer ──
  useTauriEvent('bloom-command', (cmd) => {
    switch (cmd) {
      case 'playpause': togglePlay(); break
      case 'prev': prevTr(); break
      case 'next': nextTr(); break
      case 'shuffle': toggleShuffleMain(); break
      case 'repeat': cycleRepeatMain(); break
      case 'fav': toggleCurFav(); break
    }
  })
  // «+» в miniplayer/tray: добавить текущий трек в библиотеку / плейлист / новый.
  useTauriEvent('bloom-mp-add-to-lib', () => mpAddCurrentToLib())
  useTauriEvent('bloom-mp-add-to-pl', (plId) => mpAddCurrentToPl(plId))
  useTauriEvent('bloom-mp-new-pl', () => mpOpenNewPlForCurrent())

  useTauriEvent('bloom-mp-seek', (sec) => seekApi(sec))
  useTauriEvent('bloom-mp-volume', (v) => {
    // Изменение громкости из tray-popup/miniplayer — применяем к движку и
    // персистим, чтобы пережило перезапуск.
    audioEngine.setVolume(v)
    const st = usePlayerStore.getState()
    st.setVolume(v)
    saveVolumePrefs({ volume: v, prevVolume: st._prevVolume })
  })

  // Стартовая громкость в engine = из store (восстановлена из localStorage).
  // Зеркалим её в Rust → tray-popup/miniplayer стартуют с тем же уровнем
  //. Скорость — из speedStore.
  useEffect(() => {
    const vol = usePlayerStore.getState().volume
    audioEngine.setVolume(vol)
    void invoke('miniplayer_cmd', { cmd: 'volume', value: vol }).catch(() => {})
    bootstrapSpeed()
  }, [])

  // ── MediaSession (медиа-клавиши + Windows volume HUD) ──
  useEffect(() => {
    wireMediaSessionActions()
    // При смене трека / play-state — обновляем metadata + playbackState.
    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
      if (
        state.title !== prev.title ||
        state.artist !== prev.artist ||
        state.artwork !== prev.artwork
      ) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: state.title,
          artist: state.artist,
          artwork: state.artwork
            ? [{ src: state.artwork, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        })
      }
      if (state.playing !== prev.playing) {
        navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused'
        // Резюм «Продолжить» — фиксируем на каждую смену play/pause.
        saveResume(state.playing ? 'playing' : 'paused')
      }
    })
    return () => unsub()
  }, [])
}

// Re-export для удобства caller'ов.
export { setVol as setMainVolume }
