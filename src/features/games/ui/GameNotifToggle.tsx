import { useState } from 'react'

/**
 * Тумблер уведомлений конкретной игры — кнопка вкл/выкл внутри самой игры.
 *
 * Управляет флагом `localStorage['bloom_notifs_<game>']`, который гейтит
 * `gameToast` (см. [[gameToast]]). `game` — тот же суффикс, что игра передаёт в
 * `gameToast` (например `'clicker'`, `'tama'`).
 */
export const GameNotifToggle = ({ game }: { game: string }) => {
  const key = 'bloom_notifs_' + game
  const [on, setOn] = useState(() => localStorage.getItem(key) === 'true')

  const toggle = () => {
    const next = !on
    try {
      localStorage.setItem(key, next ? 'true' : 'false')
    } catch {
      /* ignore */
    }
    setOn(next)
  }

  return (
    <button
      onClick={toggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        flexShrink: 0,
        borderRadius: 'calc(var(--radius)*.5)',
        cursor: 'pointer',
        transition: '.15s',
        border: '1px solid ' + (on ? 'rgba(var(--accent-rgb),.5)' : 'var(--border)'),
        background: on ? 'rgba(var(--accent-rgb),.13)' : 'none',
        color: on ? 'var(--accent)' : 'var(--muted)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        {!on && <line x1="3" y1="3" x2="21" y2="21" />}
      </svg>
    </button>
  )
}
