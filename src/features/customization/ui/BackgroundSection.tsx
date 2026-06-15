import { useCustomizationStore } from '../model/customizationStore'

/**
 * Раздел «Фон» (`ssec-background`) — параметры фонового слоя `#bgl`:
 * «обложка трека как фон» + размытие + затемнение + сброс. Картинка фона
 * выбирается в разделе «Кастомизация» (контекст Фон); движок — в
 * customizationStore (общий с Кастомизацией).
 */
export const BackgroundSection = () => {
  const coverAsBg = useCustomizationStore((s) => s.coverAsBg)
  const bgBlur = useCustomizationStore((s) => s.bgBlur)
  const bgDim = useCustomizationStore((s) => s.bgDim)
  const setCoverAsBg = useCustomizationStore((s) => s.setCoverAsBg)
  const setBgBlur = useCustomizationStore((s) => s.setBgBlur)
  const setBgDim = useCustomizationStore((s) => s.setBgDim)
  const resetBg = useCustomizationStore((s) => s.resetBg)

  return (
    <div className="s-section active" id="ssec-background">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>{' '}
          Фон
        </div>
        <button className="s-section-reset" onClick={resetBg}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>{' '}
          Сбросить
        </button>
      </div>

      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">Обложка трека как фон</div>
            <div className="ssub">Использовать обложку текущего трека как фон</div>
          </div>
          <label className="tele-sw">
            <input type="checkbox" checked={coverAsBg} onChange={(e) => setCoverAsBg(e.target.checked)} />
            <span className="tele-sw-track" />
          </label>
        </div>
      </div>

      <div className="sc">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="sl2">Размытие</span>
          <span className="ssub">{bgBlur}px</span>
        </div>
        <input type="range" className="srange-full" min={0} max={80} value={bgBlur} onChange={(e) => setBgBlur(Number(e.target.value))} />
      </div>

      <div className="sc">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="sl2">Затемнение</span>
          <span className="ssub">{bgDim}%</span>
        </div>
        <input type="range" className="srange-full" min={0} max={100} value={bgDim} onChange={(e) => setBgDim(Number(e.target.value))} />
      </div>
    </div>
  )
}
