import { useEffect, useState } from 'react'
import { usePlayerViewStore, type OverlayPos } from '../../model/playerViewStore'
import { invoke } from '@shared/tauri'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Раздел «Оверлей» (`#ssec-overlay`) — настройки всплывающей плашки now-playing
 * поверх всех окон. Режим (выкл/остров/компактный), позиция на экране,
 * прозрачность, размер, длительность авто-показа, тумблеры показа при смене
 * трека, перемотки по бару и режима оптимизации (без эквалайзера/бегущей строки).
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
  overlayX: 0.98,
  overlayY: 0.02,
  overlayOpacity: 90,
  overlaySize: 100,
  overlayDuration: 4,
  overlayOnTrackChange: true,
  overlaySeek: false,
  overlayPerf: false,
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

  // Режим ручного размещения: плашка закреплена и перетаскивается мышью.
  const [placing, setPlacing] = useState(false)
  const setPlaceMode = (on: boolean) => {
    setPlacing(on)
    void invoke('overlay_place_mode', { on }).catch(() => {})
  }
  // Выход из режима при уходе с секции / выключении оверлея.
  useEffect(() => {
    return () => {
      void invoke('overlay_place_mode', { on: false }).catch(() => {})
    }
  }, [])
  useEffect(() => {
    if (p.overlayMode === 'off' && placing) setPlaceMode(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.overlayMode])

  /** Выбрать пресет-якорь (выходим из ручного размещения). */
  const pickAnchor = (pos: OverlayPos) => {
    if (placing) setPlaceMode(false)
    p.set('overlayPos', pos)
  }

  const resetOverlay = () => {
    if (placing) setPlaceMode(false)
    for (const [k, v] of Object.entries(OVERLAY_DEFAULTS)) {
      p.set(k as keyof typeof OVERLAY_DEFAULTS, v as never)
    }
  }

  return (
    <div className="s-section active" id="ssec-overlay">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="widget" width={15} height={15} />{' '}
          {t('settings.nav.overlay')}
        </div>
        <button className="s-section-reset" onClick={resetOverlay}>
          <Ico name="refresh" width={10} height={10} />{' '}
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
          <OptBtn active={p.overlayMode === 'compact'} onClick={() => p.set('overlayMode', 'compact')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="6" /></svg>
            {t('settings.view.ovMode.compact')}
          </OptBtn>
          <OptBtn active={p.overlayMode === 'bar'} onClick={() => p.set('overlayMode', 'bar')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="5" cy="12" r="2.5" /><rect x="9" y="9" width="11" height="6" rx="3" /></svg>
            {t('settings.view.ovMode.bar')}
          </OptBtn>
        </div>
      </div>

      {p.overlayMode !== 'off' && (
        <>
          <div className="sc">
            <div className="sc-title">{t('settings.view.ovPos')}</div>
            <div className="sc-desc">{t('settings.view.ovPos.desc')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
              {OVERLAY_POS.map((pos) => (
                <OptBtn key={pos} active={p.overlayPos === pos} onClick={() => pickAnchor(pos)}>
                  <PosIcon id={pos} />
                </OptBtn>
              ))}
            </div>

            {/* Свободное расположение: выбор «custom» + перетаскивание плашки. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <OptBtn active={p.overlayPos === 'custom'} onClick={() => pickAnchor('custom')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
                </svg>
                {t('settings.view.ovPos.custom')}
              </OptBtn>
              <button
                className={`s-opt-btn ${placing ? 'bta' : 'btg'}`}
                disabled={p.overlayPos !== 'custom'}
                style={{ opacity: p.overlayPos === 'custom' ? 1 : 0.45 }}
                onClick={() => setPlaceMode(!placing)}
              >
                {placing ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t('settings.view.ovPos.placeDone')}
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                      <path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" />
                    </svg>
                    {t('settings.view.ovPos.place')}
                  </>
                )}
              </button>
            </div>
            {placing && <div className="sc-desc" style={{ marginTop: 8 }}>{t('settings.view.ovPos.placeHint')}</div>}
            {p.overlayPos === 'custom' && (
              <div className="sc-desc" style={{ marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {t('settings.view.ovPos.coords')}: X {Math.round(p.overlayX * 100)}% · Y {Math.round(p.overlayY * 100)}%
              </div>
            )}
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
          </div>

          <div className="sc">
            <div className="sr">
              <div>
                <div className="sl2">{t('settings.view.ovSeek')}</div>
                <div className="ssub">{t('settings.view.ovSeek.sub')}</div>
              </div>
              <Toggle checked={p.overlaySeek} onChange={(v) => p.set('overlaySeek', v)} />
            </div>
          </div>

          <div className="sc">
            <div className="sr">
              <div>
                <div className="sl2">{t('settings.view.ovPerf')}</div>
                <div className="ssub">{t('settings.view.ovPerf.sub')}</div>
              </div>
              <Toggle checked={p.overlayPerf} onChange={(v) => p.set('overlayPerf', v)} />
            </div>
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
