import type { TranslationKey } from '@shared/i18n'

/**
 * Каталог мини-игр. Изначально было 15 игр, но по решению пользователя
 * перенесены только **clicker** и **tamagotchi** — остальные планируется
 * переделать с нуля, поэтому их карточки убраны.
 *
 * `id` совпадает с ключами в `gameRegistry` (GAME_COMPONENTS). У каждой игры —
 * своя тема (`theme`), под которую витрина (`GamesModal`) рисует тематическую
 * обложку карточки (монета / питомец), а сама игра — своё полноэкранное
 * оформление.
 */
export interface GameDef {
  id: string
  /** Название игры. */
  labelKey: TranslationKey
  /** Короткий подзаголовок для карточки витрины. */
  tagKey: TranslationKey
  /** Тема оформления — задаёт класс обложки и палитру карточки. */
  theme: 'clicker' | 'tama'
}

export const GAMES_LIST: GameDef[] = [
  { id: 'clicker', labelKey: 'games.clk.brand', tagKey: 'games.clicker.tag', theme: 'clicker' },
  { id: 'tamagotchi', labelKey: 'games.tama.brand', tagKey: 'games.tama.tag', theme: 'tama' },
]
