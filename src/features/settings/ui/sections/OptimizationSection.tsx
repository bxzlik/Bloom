import { useOptStore, type OptMode, type OptEffects } from '../../model/optStore'
import { useT, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Раздел «Эффективность» (`ssec-unfocus` + `ssec-minimized`) —
 * объединён в одну вкладку (по макету): сверху блок анфокуса (упрощение графики +
 * качество/сила размытия + грид эффектов), ниже под-заголовок «СВЁРНУТОЕ
 * СОСТОЯНИЕ» (умное высвобождение + свой грид). Грид из 6 карточек-эффектов
 * (Динамический фон / Фон-GIF / Обложки / Визуализаторы / Размытие / Прокрутка
 * текста) — клик переключает, активен он или деградируется. Движок — optEngine.
 */
export const OptimizationSection = () => {
  const t = useT()
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
          <Ico name="cpu" width={15} height={15} />{' '}
          {t('settings.nav.efficiency')}
        </div>
      </div>

      {/* ── Анфокус ── */}
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2" style={{ fontSize: 13, fontWeight: 700 }}>{t('settings.efficiency.simplify')}</div>
            <div className="ssub">{t('settings.efficiency.simplify.sub')}</div>
          </div>
          <Toggle checked={simplify} onChange={setSimplify} />
        </div>
      </div>

      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.efficiency.blurQuality')}</div>
            <div className="ssub">{t('settings.efficiency.blurQuality.sub')}</div>
          </div>
          <select className="ssel" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
            <option value="low">{t('settings.efficiency.blurQuality.low')}</option>
            <option value="medium">{t('settings.efficiency.blurQuality.medium')}</option>
            <option value="high">{t('settings.efficiency.blurQuality.high')}</option>
          </select>
        </div>
      </div>

      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.efficiency.blurStrength')}</div>
            <div className="ssub">{t('settings.efficiency.blurStrength.sub')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" className="srange" min={0} max={20} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
            <span className="ssub" style={{ minWidth: 28, textAlign: 'right' }}>{strength}px</span>
          </div>
        </div>
      </div>

      <OptGrid mode="unfocus" />

      {/* ── Свёрнутое состояние ── */}
      <div className="s-cat-label" style={{ marginTop: 16 }}>{t('settings.efficiency.minimized')}</div>

      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2" style={{ fontSize: 13, fontWeight: 700 }}>{t('settings.efficiency.smart')}</div>
            <div className="ssub">{t('settings.efficiency.smart.sub')}</div>
          </div>
          <Toggle checked={smart} onChange={setSmart} />
        </div>
      </div>

      <OptGrid mode="minimized" />
    </div>
  )
}

// ── Грид карточек-эффектов ──────────────────────────────────────────────────
const EFFECTS: { key: keyof OptEffects; nameKey: TranslationKey; icon: React.ReactNode }[] = [
  { key: 'bg', nameKey: 'settings.efficiency.effect.bg', icon: <ImgIcon /> },
  { key: 'bgGif', nameKey: 'settings.efficiency.effect.bgGif', icon: <GifIcon /> },
  { key: 'covers', nameKey: 'settings.efficiency.effect.covers', icon: <DiscIcon /> },
  { key: 'visualizers', nameKey: 'settings.efficiency.effect.visualizers', icon: <BarsIcon /> },
  { key: 'blur', nameKey: 'settings.efficiency.effect.blur', icon: <BlurIcon /> },
  { key: 'marquee', nameKey: 'settings.efficiency.effect.marquee', icon: <LinesIcon /> },
]

const DEGRADED: Record<keyof OptEffects, { textKey: TranslationKey; cls: string }> = {
  bg: { textKey: 'settings.efficiency.state.frozen', cls: 'frozen' },
  bgGif: { textKey: 'settings.efficiency.state.pausedM', cls: 'stopped' },
  covers: { textKey: 'settings.efficiency.state.pausedPl', cls: 'stopped' },
  visualizers: { textKey: 'settings.efficiency.state.stopped', cls: 'stopped' },
  blur: { textKey: 'settings.efficiency.state.disabled', cls: 'disabled' },
  marquee: { textKey: 'settings.efficiency.state.stopped', cls: 'stopped' },
}
const ACTIVE: Record<keyof OptEffects, TranslationKey> = {
  bg: 'settings.efficiency.state.activeM',
  bgGif: 'settings.efficiency.state.activeM',
  covers: 'settings.efficiency.state.activePl',
  visualizers: 'settings.efficiency.state.activePl',
  blur: 'settings.efficiency.state.activePl',
  marquee: 'settings.efficiency.state.activePl',
}

const OptGrid = ({ mode }: { mode: OptMode }) => {
  const t = useT()
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
              <div className="opt-card-name">{t(e.nameKey)}</div>
              <div className={`opt-card-state ${isActive ? 'active' : DEGRADED[e.key].cls}`}>
                {isActive ? t(ACTIVE[e.key]) : t(DEGRADED[e.key].textKey)}
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
  return <Ico name="gallery" width={16} height={16} />
}
function GifIcon() {
  return <Ico name="video" width={16} height={16} />
}
function DiscIcon() {
  return <Ico name="vinyl" width={16} height={16} />
}
function BarsIcon() {
  return <Ico name="eq" width={16} height={16} />
}
function BlurIcon() {
  return <Ico name="blur" width={16} height={16} />
}
function LinesIcon() {
  return <Ico name="text" width={16} height={16} />
}
