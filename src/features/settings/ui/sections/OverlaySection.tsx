import { usePlayerViewStore, type OverlayPos } from '../../model/playerViewStore'
import { useT } from '@shared/i18n'

/**
 * Раздел «Оверлей» (`#ssec-overlay`) — настройки всплывающей плашки now-playing
 * поверх всех окон. Режим (выкл/остров), позиция на экране, прозрачность,
 * размер, длительность авто-показа и тумблер показа при смене трека.
 *
 * Логику синка с нативным окном держит `useOverlayBridge` (app-слой): пушит
 * конфиг в Rust на смену режима/позиции/масштаба; плашка читает прозрачность/
 * размер/длительность из `bloom_view_prefs` сама (storage-событие).
 */

/** Позиции оверлея в порядке сетки (2 ряда × 3 колонки). */
const OVERLAY_POS: OverlayPos[] = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']

/** Поля оверлея, сбрасываемые кнопкой «сброс» этой секции. */
const OVERLAY_DEFAULTS = {
  overlayMode: 'off',
  overlayPos: 'tr',
  overlayOpacity: 90,
  overlaySize: 100,
  overlayDuration: 4,
  overlayOnTrackChange: true,
} as const

/** Мини-иконка экрана с точкой в выбранном углу/крае. */
const PosIcon = ({ id }: { id: OverlayPos }) => {
  const cx = id[1] === 'l' ? 6 : id[1] === 'c' ? 12 : 18
  const cy = id[0] === 't' ? 6 : 13
  return (
    <svg width="26" height="20" viewBox="0 0 24 19" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="2" y="2" width="20" height="15" rx="2" opacity={0.5} />
      <circle cx={cx} cy={cy} r="2.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export const OverlaySection = () => {
  const t = useT()
  const p = usePlayerViewStore()
  const resetOverlay = () => {
    for (const [k, v] of Object.entries(OVERLAY_DEFAULTS)) {
      p.set(k as keyof typeof OVERLAY_DEFAULTS, v as never)
    }
  }

  return (
    <div className="s-section active" id="ssec-overlay">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <rect x="13" y="6" width="6" height="4" rx="1.4" fill="currentColor" stroke="none" opacity={0.8} />
          </svg>{' '}
          {t('settings.nav.overlay')}
        </div>
        <button className="s-section-reset" onClick={resetOverlay}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>{' '}
          {t('common.reset')}
        </button>
      </div>

      <div className="sc">
        <div className="sc-title">{t('settings.view.ovMode')}</div>
        <div className="sc-desc">{t('settings.view.ovMode.desc')}</div>
        <div className="s-opt-row" style={{ marginTop: 12 }}>
          <OptBtn active={p.overlayMode === 'off'} onClick={() => p.set('overlayMode', 'off')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            {t('settings.view.ovMode.off')}
          </OptBtn>
          <OptBtn active={p.overlayMode === 'island'} onClick={() => p.set('overlayMode', 'island')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="8" width="20" height="8" rx="4" /></svg>
            {t('settings.view.ovMode.island')}
          </OptBtn>
        </div>
      </div>

      {p.overlayMode === 'island' && (
        <>
          <div className="sc">
            <div className="sc-title">{t('settings.view.ovPos')}</div>
            <div className="sc-desc">{t('settings.view.ovPos.desc')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
              {OVERLAY_POS.map((pos) => (
                <OptBtn key={pos} active={p.overlayPos === pos} onClick={() => p.set('overlayPos', pos)}>
                  <PosIcon id={pos} />
                </OptBtn>
              ))}
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">{t('settings.view.ovOpacity')}</div>
            <div className="sc-desc">{t('settings.view.ovOpacity.desc')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <span className="ssub" style={{ minWidth: 40 }}>{p.overlayOpacity}%</span>
              <input type="range" className="srange-full" min={20} max={100} value={p.overlayOpacity} onChange={(e) => p.set('overlayOpacity', Number(e.target.value))} />
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">{t('settings.view.ovSize')}</div>
            <div className="sc-desc">{t('settings.view.ovSize.desc')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <span className="ssub" style={{ minWidth: 40 }}>{p.overlaySize}%</span>
              <input type="range" className="srange-full" min={50} max={150} value={p.overlaySize} onChange={(e) => p.set('overlaySize', Number(e.target.value))} />
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">{t('settings.view.ovDuration')}</div>
            <div className="sc-desc">{t('settings.view.ovDuration.desc')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <span className="ssub" style={{ minWidth: 40 }}>{p.overlayDuration}s</span>
              <input type="range" className="srange-full" min={2} max={10} value={p.overlayDuration} onChange={(e) => p.set('overlayDuration', Number(e.target.value))} />
            </div>
          </div>

          <div className="sc">
            <div className="sr">
              <div>
                <div className="sl2">{t('settings.view.ovOnTrack')}</div>
                <div className="ssub">{t('settings.view.ovOnTrack.sub')}</div>
              </div>
              <Toggle checked={p.overlayOnTrackChange} onChange={(v) => p.set('overlayOnTrackChange', v)} />
            </div>
            <div className="ssub" style={{ marginTop: 10, opacity: 0.8 }}>{t('settings.view.ovHint')}</div>
          </div>
        </>
      )}
    </div>
  )
}

const OptBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button className={`s-opt-btn ${active ? 'bta' : 'btg'}`} onClick={onClick}>
    {children}
  </button>
)

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="tele-sw">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="tele-sw-track" />
  </label>
)
