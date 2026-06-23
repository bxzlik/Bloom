import { GameNotifToggle } from './GameNotifToggle'
import { useT } from '@shared/i18n'

/**
 * Тематический топ-бар игры (свой для каждой игры через scoped-CSS).
 *
 * Структура одинаковая (Назад • бренд • Сброс • колокольчик • Закрыть), а вид
 * задаётся CSS под корнем темы (`.game-clicker .game-topbar`, `.game-tama …`).
 * Заменяет прежнюю общую шапку приложения (`.games-modal-head`) — теперь шапку
 * рисует сама игра, поэтому игра ощущается отдельным продуктом.
 */
export interface GameTopBarProps {
  /** Название/бренд игры в центре (напр. «Bloom Coin»). */
  brand: string
  /** Левая иконка-бренд (опц.) — рисуется перед названием. */
  icon?: React.ReactNode
  onBack: () => void
  onClose: () => void
  onReset: () => void
  /** Суффикс для тумблера уведомлений (`bloom_notifs_<notifGame>`). */
  notifGame: string
}

export const GameTopBar = ({ brand, icon, onBack, onClose, onReset, notifGame }: GameTopBarProps) => {
  const t = useT()
  return (
    <div className="game-topbar">
      <button className="game-icon-btn game-back" onClick={onBack} aria-label={t('common.back')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div className="game-brand">
        {icon && <span className="game-brand-icon">{icon}</span>}
        <span className="game-brand-text">{brand}</span>
      </div>
      <div className="game-topbar-actions">
        <button className="game-icon-btn game-reset" onClick={onReset} aria-label={t('common.reset')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
        </button>
        <GameNotifToggle game={notifGame} />
        <button className="game-icon-btn game-close" onClick={onClose} aria-label={t('common.close')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
