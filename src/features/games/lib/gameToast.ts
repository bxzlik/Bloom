import { toast } from '@shared/ui'

/**
 * Тост игры. Показывается ТОЛЬКО если
 * включён нотиф-тогл игры в настройках (`localStorage['bloom_notifs_<game>']`).
 *
 * По умолчанию тоглы выключены, поэтому игровые тосты молчат, пока пользователь
 * не включит уведомления конкретной игры. Тоглы — в шапке модалки игр
 * (GameNotifToggle), ключ localStorage `bloom_notifs_<game>`.
 */
export function gameToast(game: string, msg: string): void {
  if (localStorage.getItem('bloom_notifs_' + game) === 'true') toast(msg)
}
