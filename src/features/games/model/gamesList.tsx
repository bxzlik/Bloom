import type { ReactNode } from 'react'
import type { TranslationKey } from '@shared/i18n'

/**
 * Каталог мини-игр. Изначально в было 15 игр (`GAMES_LIST`),
 * но по решению пользователя перенесены только **clicker** и **tamagotchi** —
 * остальные планируется переделать с нуля в будущем, поэтому их плитки убраны.
 *
 * `id` совпадает с ключами в `gameRegistry` (GAME_COMPONENTS). Иконки — те же
 * SVG из, переписанные в JSX через общий `GameIcon`.
 */
export interface GameDef {
  id: string
  labelKey: TranslationKey
  icon: ReactNode
}

const GameIcon = ({ children }: { children: ReactNode }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    {children}
  </svg>
)

export const GAMES_LIST: GameDef[] = [
  {
    id: 'clicker',
    labelKey: 'games.clicker',
    icon: (
      <GameIcon>
        <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
      </GameIcon>
    ),
  },
  {
    id: 'tamagotchi',
    labelKey: 'games.tama',
    icon: (
      <GameIcon>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </GameIcon>
    ),
  },
]
