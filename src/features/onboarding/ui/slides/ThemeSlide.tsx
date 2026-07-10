import { THEME_PRESETS, useThemeStore } from '@features/settings'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Слайд «Тема»: сетка встроенных пресетов + тумблер авто-акцента. Клик применяет
 * тему live (applyTheme в оболочке), поэтому вся карточка онбординга
 * перекрашивается на месте — это и есть превью.
 *
 * Подпись пресета живёт ПОД превью, на фоне карточки, а не внутри цветного
 * прямоугольника: иначе на светлых темах белый текст пропадал.
 *
 * Тумблер — те же классы `.tele-sw`, что и у переключателей настроек.
 */
interface Props {
  active: string
  onPick: (id: string) => void
}

export const ThemeSlide = ({ active, onPick }: Props) => {
  const t = useT()
  const autoAccent = useThemeStore((s) => s.autoAccent)
  const setAutoAccent = useThemeStore((s) => s.setAutoAccent)

  return (
    <div className="ob-body">
      <div className="ob-title">{t('onb.theme.title')}</div>
      <div className="ob-sub">{t('onb.theme.sub')}</div>

      <div className="ob-theme-grid">
        {THEME_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`ob-theme-card${p.id === active ? ' active' : ''}`}
            style={{ ['--ob-accent' as string]: p.preview.accent }}
            onClick={() => onPick(p.id)}
          >
            <div className="ob-tc-preview" style={{ background: p.preview.bg }}>
              <div className="ob-tc-bar" style={{ background: p.preview.card }} />
              <div className="ob-tc-bar" style={{ background: p.preview.card }} />
              <div className="ob-tc-bar" style={{ background: p.preview.card }} />
              <div className="ob-tc-dot" style={{ background: p.preview.accent }} />
            </div>
            <div className="ob-tc-name">{p.name}</div>
          </button>
        ))}
      </div>

      <div className="ob-switch-row">
        <div className="ob-switch-text">
          <div className="ob-switch-title">{t('settings.interface.autoAccent.title')}</div>
          <div className="ob-switch-sub">{t('settings.interface.autoAccent.sub')}</div>
        </div>
        <label className="tele-sw">
          <input type="checkbox" checked={autoAccent} onChange={(e) => setAutoAccent(e.target.checked)} />
          <span className="tele-sw-track" />
        </label>
      </div>

      <div className="ob-hint">
        <Ico name="palette" width={12} height={12} />
        {t('onb.theme.hint')}
      </div>
    </div>
  )
}
