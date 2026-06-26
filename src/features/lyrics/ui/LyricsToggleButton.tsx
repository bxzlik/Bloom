import { useLyricsStore } from '../model/lyricsStore'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Кнопка показа/скрытия панели текста (#lyricsToggleBtn).
 *: иконка «список строк», .lyr-active когда панель открыта.
 */
export const LyricsToggleButton = () => {
  const t = useT()
  const open = useLyricsStore((s) => s.open)
  const toggle = useLyricsStore((s) => s.toggleOpen)
  return (
    <button
      className={`lyrics-btn${open ? ' lyr-active' : ''}`}
      id="lyricsToggleBtn"
      onClick={toggle}
      aria-label={t('player.lyrics')}
    >
      <Ico name="lyrics" width={16} height={16} />
    </button>
  )
}
