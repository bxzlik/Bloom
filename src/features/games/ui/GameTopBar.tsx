import { GameNotifToggle } from './GameNotifToggle'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

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
        <Ico name="arrowLeft" width={16} height={16} />
      </button>
      <div className="game-brand">
        {icon && <span className="game-brand-icon">{icon}</span>}
        <span className="game-brand-text">{brand}</span>
      </div>
      <div className="game-topbar-actions">
        <button className="game-icon-btn game-reset" onClick={onReset} aria-label={t('common.reset')}>
          <Ico name="refresh" width={14} height={14} />
        </button>
        <GameNotifToggle game={notifGame} />
        <button className="game-icon-btn game-close" onClick={onClose} aria-label={t('common.close')}>
          <Ico name="close" width={15} height={15} />
        </button>
      </div>
    </div>
  )
}
