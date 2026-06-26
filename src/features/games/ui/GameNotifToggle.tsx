import { useState } from 'react'
import { Ico } from '@shared/ui/icons/solar'

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
      <Ico name={on ? 'bell' : 'bellOff'} width={14} height={14} />
    </button>
  )
}
