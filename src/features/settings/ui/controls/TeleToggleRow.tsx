import type { ReactNode } from 'react'

/**
 * Строка-тоггл `.tele-toggle-row`:
 *   .tele-toggle-row
 *     .tele-toggle-icon (40×40, тинт акцента)
 *     .tele-toggle-info > .tele-toggle-title + .tele-toggle-sub
 *     label.tele-sw > input[checkbox] + .tele-sw-track
 *
 * Все стили — из CSS, никаких inline-overrides.
 */
export const TeleToggleRow = ({
  icon,
  title,
  sub,
  checked,
  disabled,
  onChange,
}: {
  icon: ReactNode
  title: string
  sub: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) => (
  <div className="tele-toggle-row">
    <div className="tele-toggle-icon">{icon}</div>
    <div className="tele-toggle-info">
      <div className="tele-toggle-title">{title}</div>
      <div className="tele-toggle-sub">{sub}</div>
    </div>
    <label className="tele-sw">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="tele-sw-track" />
    </label>
  </div>
)
