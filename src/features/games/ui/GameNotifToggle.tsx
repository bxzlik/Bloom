import { useState } from 'react'

/**
 * Тумблер уведомлений конкретной игры — кнопка вкл/выкл внутри топ-бара игры.
 *
 * Управляет флагом `localStorage['bloom_notifs_<game>']`, который гейтит
 * `gameToast` (см. [[gameToast]]). `game` — тот же суффикс, что игра передаёт в
 * `gameToast` (например `'clicker'`, `'tama'`).
 *
 * Вид кнопки задаётся тематическим scoped-CSS игры через классы
 * `.game-icon-btn`/`.game-notif` и атрибут `data-on` — никаких токенов приложения,
 * чтобы каждая игра красила тумблер в своей палитре.
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
    <button className="game-icon-btn game-notif" data-on={on ? 'true' : 'false'} onClick={toggle} aria-pressed={on}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        {!on && <line x1="3" y1="3" x2="21" y2="21" />}
      </svg>
    </button>
  )
}
