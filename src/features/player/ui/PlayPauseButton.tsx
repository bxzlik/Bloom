import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { usePlayerStore } from '../model/store'
import { useQueueStore } from '../model/queueStore'
import { togglePlay, restartQueue } from '../api/play'

/**
 * Главная кнопка транспорта (`.cc-play`). Кроме play/pause у неё есть ещё два
 * состояния, поэтому она вынесена в общий компонент — PagePlayer, нижний бар
 * (#miniPlayer) и BigPicture должны вести себя одинаково:
 *
 * - **загрузка** (`queueStore.loadingId`) — стрим трека резолвится/буферизуется:
 *   вместо глифа крутится спиннер `.cc-play-spin`, клики игнорируются;
 * - **очередь доиграла** (`queueStore.queueEnded`) — последний трек кончился при
 *   выключенном повторе: показываем «начать заново», клик перезапускает очередь
 *   с первого трека.
 *
 * `size` — размер глифа; в main-окне его всё равно перебивает
 * `body.play-flat .cc-play svg` (26px), но у #miniPlayer/BigPicture свои правила.
 */
export const PlayPauseButton = ({ size, id }: { size: number; id?: string }) => {
  const t = useT()
  const playing = usePlayerStore((s) => s.playing)
  // Спиннер показываем на ЛЮБУЮ загрузку, а не только `loadingId === curId`:
  // у сетевых треков показ переключается лишь после успешного резолва, и до
  // этого момента curId — ещё предыдущий трек.
  const loading = useQueueStore((s) => s.loadingId !== null)
  const ended = useQueueStore((s) => s.queueEnded)

  if (loading) {
    return (
      <button className="cc-play is-loading" id={id} disabled aria-busy aria-label={t('player.aria.loading')}>
        <span className="cc-play-spin" />
      </button>
    )
  }

  if (ended) {
    return (
      <button className="cc-play" id={id} onClick={restartQueue} aria-label={t('player.aria.restart')}>
        <Ico name="restart" width={size} height={size} />
      </button>
    )
  }

  return (
    <button
      // is-play — только для треугольника: он смещён вправо в своём viewBox
      // (контур 3…23.2 при центре бокса 12), CSS двигает его обратно.
      className={`cc-play${playing ? '' : ' is-play'}`}
      id={id}
      onClick={togglePlay}
      aria-label={playing ? t('player.aria.pause') : t('player.aria.play')}
    >
      <Ico name={playing ? 'pause' : 'play'} width={size} height={size} />
    </button>
  )
}
