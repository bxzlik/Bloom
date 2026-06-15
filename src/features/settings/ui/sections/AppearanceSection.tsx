import { useThemeStore } from '../../model'

/**
 * Секция «Внешний вид» — цветовая тема через CSS vars.
 * Использует markup: `.s-section.active > .sc > h3 + .sr*`.
 */
export const AppearanceSection = () => {
  const bg = useThemeStore((s) => s.bg)
  const blockColor = useThemeStore((s) => s.blockColor)
  const accent = useThemeStore((s) => s.accent)
  const setBg = useThemeStore((s) => s.setBg)
  const setBlockColor = useThemeStore((s) => s.setBlockColor)
  const setAccent = useThemeStore((s) => s.setAccent)

  return (
    <div className="s-section active" id="ssec-view">
      <div className="sc">
        <h3>Цвета</h3>
        <div className="sr">
          <div>
            <div className="sl2">Цвет фона</div>
            <div className="ssub">Фон страницы и сайдбара (CSS var(--bg))</div>
          </div>
          <ColorRow value={bg} onChange={setBg} onReset={() => setBg('#0a0a0a')} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">Цвет блоков</div>
            <div className="ssub">Цвет контейнеров: библиотека, плеер, очередь (var(--block-color))</div>
          </div>
          <ColorRow
            value={blockColor}
            onChange={setBlockColor}
            onReset={() => setBlockColor('#0a0a0a')}
          />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">Акцентный цвет</div>
            <div className="ssub">Активные кнопки, прогресс, выделение</div>
          </div>
          <ColorRow
            value={accent}
            onChange={setAccent}
            onReset={() => setAccent('#3b82f6')}
          />
        </div>
      </div>
    </div>
  )
}

const ColorRow = ({
  value,
  onChange,
  onReset,
}: {
  value: string
  onChange: (v: string) => void
  onReset: () => void
}) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: 28,
        height: 24,
        padding: 0,
        border: '1px solid var(--border)',
        borderRadius: 'calc(var(--radius) * 0.4)',
        background: 'transparent',
        cursor: 'pointer',
      }}
    />
    <input
      type="text"
      value={value}
      maxLength={7}
      onChange={(e) => {
        const v = e.target.value.trim()
        if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
          onChange(v.startsWith('#') ? v : `#${v}`)
        }
      }}
      style={{
        width: 76,
        padding: '3px 7px',
        fontSize: 11,
        fontFamily: 'monospace',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'calc(var(--radius) * 0.4)',
        color: 'var(--text)',
        outline: 'none',
      }}
    />
    <button
      onClick={onReset}
      style={{
        width: 24,
        height: 24,
        border: '1px solid var(--border)',
        borderRadius: 'calc(var(--radius) * 0.4)',
        background: 'transparent',
        color: 'var(--text2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
      </svg>
    </button>
  </div>
)
