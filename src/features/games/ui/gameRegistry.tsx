import type { ComponentType } from 'react'
import { ClickerGame } from './games/ClickerGame'
import { TamagotchiGame } from './games/TamagotchiGame'

/**
 * Реестр компонентов игр: `id` (из GAMES_LIST) → React-компонент игры.
 *
 * Перенесены только clicker и tamagotchi (решение пользователя — остальные игры
 * планируется переделать с нуля). GAMES_LIST содержит ровно эти две, так что
 * ветка-заглушка «Скоро» в модалке сейчас не используется, но оставлена под
 * будущее (добавляешь игру в GAMES_LIST + сюда строку — и всё).
 *
 * Каждый компонент игры — самодостаточная `.s-section` ( `ssec-<id>`):
 * собственное состояние/persist (localStorage `bloom_<id>`), достижения и
 * кнопка «Сбросить». Монтируется в `#gamesGameContent` при открытии игры.
 */
export const GAME_COMPONENTS: Record<string, ComponentType> = {
  clicker: ClickerGame,
  tamagotchi: TamagotchiGame,
}
