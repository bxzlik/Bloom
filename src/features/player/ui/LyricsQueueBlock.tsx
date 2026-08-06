import { LyricsView } from '@features/lyrics'
import { usePlayerViewStore } from '@features/settings'

/**
 * Блок «Текст вместо очереди» (#lyricsQueueBlock) — занимает место
 * очереди на странице плеера, когда включена настройка «Текст вместо очереди»
 * (`lyricsInQueue`) и панель текста открыта. Тело — общий `LyricsView`
 * в контейнере `.lq-content`.
 *
 * @param active  рендерить эффекты (скролл/заливку) — панель видима.
 */
export const LyricsQueueBlock = ({ active }: { active: boolean }) => {
  // Блок живёт на странице плеера — оформление у него общее с панелью над обложкой.
  const st = usePlayerViewStore((s) => s.lyricsStyle.player)
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
        border: '1px solid var(--ovl-line)',
        background: 'rgba(var(--ovl-rgb),.02)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <LyricsView
        className="lq-content"
        id="lqContent"
        active={active}
        fill={st.fill}
        fx={st.fx}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px', scrollBehavior: 'smooth' }}
      />
    </div>
  )
}
