import { useLyricsStore } from '../model/lyricsStore'

/**
 * Кнопка показа/скрытия панели текста (#lyricsToggleBtn).
 *: иконка «список строк», .lyr-active когда панель открыта.
 */
export const LyricsToggleButton = () => {
  const open = useLyricsStore((s) => s.open)
  const toggle = useLyricsStore((s) => s.toggleOpen)
  return (
    <button
      className={`lyrics-btn${open ? ' lyr-active' : ''}`}
      id="lyricsToggleBtn"
      onClick={toggle}
      aria-label="Текст песни"
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="15" y2="12" />
        <line x1="3" y1="18" x2="11" y2="18" />
      </svg>
    </button>
  )
}
