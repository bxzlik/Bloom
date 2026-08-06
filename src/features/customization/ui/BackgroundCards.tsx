import { useCustomizationStore } from '../model/customizationStore'
import { useT } from '@shared/i18n'

/**
 * Карточки вкладки «Фон» раздела «Кастомизация» — параметры фонового слоя
 * `#bgl`: «обложка трека как фон» + размытие + затемнение. Картинка фона
 * выбирается на вкладке «Кастомизация» (контекст Фон); движок — в
 * customizationStore (общий с Кастомизацией).
 *
 * Раньше это был отдельный раздел сайдбара настроек (`ssec-background`);
 * сброс (`resetBg`) живёт в шапке «Кастомизации» и показывается только на этой
 * вкладке.
 */
export const BackgroundCards = () => {
  const t = useT()
  const coverAsBg = useCustomizationStore((s) => s.coverAsBg)
  const bgBlur = useCustomizationStore((s) => s.bgBlur)
  const bgDim = useCustomizationStore((s) => s.bgDim)
  const setCoverAsBg = useCustomizationStore((s) => s.setCoverAsBg)
  const setBgBlur = useCustomizationStore((s) => s.setBgBlur)
  const setBgDim = useCustomizationStore((s) => s.setBgDim)

  return (
    <>
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.background.coverAsBg')}</div>
            <div className="ssub">{t('settings.background.coverAsBg.sub')}</div>
          </div>
          <label className="tele-sw">
            <input type="checkbox" checked={coverAsBg} onChange={(e) => setCoverAsBg(e.target.checked)} />
            <span className="tele-sw-track" />
          </label>
        </div>
      </div>

      <div className="sc">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="sl2">{t('settings.background.blur')}</span>
          <span className="ssub">{bgBlur}px</span>
        </div>
        <input type="range" className="srange-full" min={0} max={80} value={bgBlur} onChange={(e) => setBgBlur(Number(e.target.value))} />
      </div>

      <div className="sc">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="sl2">{t('settings.background.dim')}</span>
          <span className="ssub">{bgDim}%</span>
        </div>
        <input type="range" className="srange-full" min={0} max={100} value={bgDim} onChange={(e) => setBgDim(Number(e.target.value))} />
      </div>
    </>
  )
}
