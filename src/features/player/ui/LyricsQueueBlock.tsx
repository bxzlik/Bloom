import { LyricsView } from '@features/lyrics'

/**
 * Блок «Текст вместо очереди» (#lyricsQueueBlock) — занимает место
 * очереди на странице плеера, когда включена настройка «Текст вместо очереди»
 * (`lyricsInQueue`) и панель текста открыта. Тело — общий `LyricsView`
 * в контейнере `.lq-content`.
 *
 * @param active  рендерить эффекты (скролл/караоке) — панель видима.
 */
export const LyricsQueueBlock = ({ active }: { active: boolean }) => {
  return (
    <div
      id="lyricsQueueBlock"
      style={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        minHeight: 0,
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(255,255,255,var(--wb))',
        background: 'rgba(255,255,255,.02)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <LyricsView
        className="lq-content"
        id="lqContent"
        active={active}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px', scrollBehavior: 'smooth' }}
      />
    </div>
  )
}
