import { useLyricsStore } from '../model/lyricsStore'
import { LyricsView } from './LyricsView'

/**
 * Панель текста — overlay поверх обложки (#lyricsPanel).
 * `LyricsController`. Рендерится всегда (видимость — через классы
 * lyr-visible/lyr-hidden), чтобы CSS-transition opacity/scale отрабатывал.
 * Рендер строк/караоке вынесен в общий `LyricsView`.
 */
export const LyricsPanel = () => {
  const open = useLyricsStore((s) => s.open)
  const source = useLyricsStore((s) => s.source)
  return (
    <div id="lyricsPanel" className={`lyrics-panel ${open ? 'lyr-visible' : 'lyr-hidden'}`}>
      <span className="lyrics-source-badge" id="lyricsSourceBadge">
        {source}
      </span>
      <LyricsView className="lyrics-content" id="lyricsContent" active={open} />
    </div>
  )
}
