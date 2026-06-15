import { useOptStore, type OptMode, type OptEffects } from '../../model/optStore'

/**
 * Раздел «Эффективность» (`ssec-unfocus` + `ssec-minimized`) —
 * объединён в одну вкладку (по макету): сверху блок анфокуса (упрощение графики +
 * качество/сила размытия + грид эффектов), ниже под-заголовок «СВЁРНУТОЕ
 * СОСТОЯНИЕ» (умное высвобождение + свой грид). Грид из 6 карточек-эффектов
 * (Динамический фон / Фон-GIF / Обложки / Визуализаторы / Размытие / Прокрутка
 * текста) — клик переключает, активен он или деградируется. Движок — optEngine.
 */
export const OptimizationSection = () => {
  const simplify = useOptStore((s) => s.unfocusSimplify)
  const quality = useOptStore((s) => s.unfocusBlurQuality)
  const strength = useOptStore((s) => s.unfocusBlurStrength)
  const setSimplify = useOptStore((s) => s.setUnfocusSimplify)
  const setQuality = useOptStore((s) => s.setUnfocusBlurQuality)
  const setStrength = useOptStore((s) => s.setUnfocusBlurStrength)
  const smart = useOptStore((s) => s.minimizedSmart)
  const setSmart = useOptStore((s) => s.setMinimizedSmart)

  return (
    <div className="s-section active" id="ssec-unfocus">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>{' '}
          Эффективность
        </div>
      </div>

      {/* ── Анфокус ── */}
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2" style={{ fontSize: 13, fontWeight: 700 }}>Упрощение графики</div>
            <div className="ssub">Снижать качество размытия и эффектов, когда окно не активно</div>
          </div>
          <Toggle checked={simplify} onChange={setSimplify} />
        </div>
      </div>

      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">Качество размытия</div>
            <div className="ssub">Насколько сильно упрощать стекло в фоне</div>
          </div>
          <select className="ssel" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
            <option value="low">Низкое (Быстро)</option>
            <option value="medium">Среднее</option>
            <option value="high">Высокое (Медленно)</option>
          </select>
        </div>
      </div>

      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">Сила размытия</div>
            <div className="ssub">Настройте интенсивность размытия в анфокусе</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" className="srange" min={0} max={20} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
            <span className="ssub" style={{ minWidth: 28, textAlign: 'right' }}>{strength}px</span>
          </div>
        </div>
      </div>

      <OptGrid mode="unfocus" />

      {/* ── Свёрнутое состояние ── */}
      <div className="s-cat-label" style={{ marginTop: 16 }}>Свёрнутое состояние</div>

      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2" style={{ fontSize: 13, fontWeight: 700 }}>Умное высвобождение ресурсов</div>
            <div className="ssub">Автоматически отключать тяжёлые процессы при сворачивании</div>
          </div>
          <Toggle checked={smart} onChange={setSmart} />
        </div>
      </div>

      <OptGrid mode="minimized" />
    </div>
  )
}

// ── Грид карточек-эффектов ──────────────────────────────────────────────────
const EFFECTS: { key: keyof OptEffects; name: string; icon: React.ReactNode }[] = [
  { key: 'bg', name: 'Динамический фон', icon: <ImgIcon /> },
  { key: 'bgGif', name: 'Фон', icon: <GifIcon /> },
  { key: 'covers', name: 'Обложки', icon: <DiscIcon /> },
  { key: 'visualizers', name: 'Визуализаторы', icon: <BarsIcon /> },
  { key: 'blur', name: 'Размытие', icon: <BlurIcon /> },
  { key: 'marquee', name: 'Прокрутка текста', icon: <LinesIcon /> },
]

const DEGRADED: Record<keyof OptEffects, { text: string; cls: string }> = {
  bg: { text: 'Заморожен', cls: 'frozen' },
  bgGif: { text: 'Приостановлен', cls: 'stopped' },
  covers: { text: 'Приостановлены', cls: 'stopped' },
  visualizers: { text: 'Остановлены', cls: 'stopped' },
  blur: { text: 'Отключены', cls: 'disabled' },
  marquee: { text: 'Остановлены', cls: 'stopped' },
}
const ACTIVE: Record<keyof OptEffects, string> = {
  bg: 'Активен',
  bgGif: 'Активен',
  covers: 'Активны',
  visualizers: 'Активны',
  blur: 'Активны',
  marquee: 'Активны',
}

const OptGrid = ({ mode }: { mode: OptMode }) => {
  const effects = useOptStore((s) => s.effects[mode])
  const toggle = useOptStore((s) => s.toggleEffect)
  return (
    <div className="opt-grid">
      {EFFECTS.map((e) => {
        const val = effects[e.key]
        const isActive = e.key === 'covers' ? (val as number) >= 2 : !!val
        return (
          <div key={e.key} className={`opt-card${isActive ? ' opt-active' : ''}`} onClick={() => toggle(mode, e.key)}>
            <div className="opt-card-icon">{e.icon}</div>
            <div className="opt-card-info">
              <div className="opt-card-name">{e.name}</div>
              <div className={`opt-card-state ${isActive ? 'active' : DEGRADED[e.key].cls}`}>
                {isActive ? ACTIVE[e.key] : DEGRADED[e.key].text}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="tele-sw">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="tele-sw-track" />
  </label>
)

// ── Иконки ─────────────────────────────────────────────────
function ImgIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
}
function GifIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" /><path d="m16 5 3 3-7 7-3 1 1-3 7-7z" /></svg>
}
function DiscIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
}
function BarsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><polyline points="22 8 22 16" /><polyline points="18 10 18 14" /><polyline points="14 4 14 20" /><polyline points="10 8 10 16" /><polyline points="6 11 6 13" /><polyline points="2 10 2 14" /></svg>
}
function BlurIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /></svg>
}
function LinesIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M21 10H7" /><path d="M21 6H3" /><path d="M21 14H3" /><path d="M21 18H7" /></svg>
}
