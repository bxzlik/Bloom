import { useCustomizationStore } from '../model/customizationStore'
import { useT } from '@shared/i18n'

/**
 * Параметры фонового слоя `#bgl` — размытие и затемнение. Показываются в
 * разделе «Кастомизация» под сеткой картинок, за разделительной полосой.
 *
 * Сама картинка фона выбирается там же (плашка «Фон»), движок — в
 * customizationStore. Тоггл «обложка трека как фон» переехал в раздел
 * «Интерфейс» (группа «Интерфейс»).
 */
export const BackgroundSliders = () => {
  const t = useT()
  const bgBlur = useCustomizationStore((s) => s.bgBlur)
  const bgDim = useCustomizationStore((s) => s.bgDim)
  const setBgBlur = useCustomizationStore((s) => s.setBgBlur)
  const setBgDim = useCustomizationStore((s) => s.setBgDim)

  return (
    <>
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
