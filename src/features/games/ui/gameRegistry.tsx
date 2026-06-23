import type { ComponentType } from 'react'
import { ClickerGame } from './games/ClickerGame'
import { TamagotchiGame } from './games/TamagotchiGame'

/**
 * Пропсы, которые модалка передаёт каждой игре. Игра сама рисует свою шапку
 * (топ-бар), поэтому ей нужны навигационные колбэки модалки.
 */
export interface GameProps {
  /** Назад на витрину игр. */
  onBack: () => void
  /** Закрыть модалку игр. */
  onClose: () => void
}

/**
 * Реестр компонентов игр: `id` (из GAMES_LIST) → React-компонент игры.
 *
 * Перенесены только clicker и tamagotchi (решение пользователя — остальные игры
 * планируется переделать с нуля). Каждая игра — самодостаточное тематическое
 * оформление (`.game-clicker` / `.game-tama`) со своим топ-баром, палитрой и
 * персонажем; монтируется full-bleed в модалку при открытии.
 */
export const GAME_COMPONENTS: Record<string, ComponentType<GameProps>> = {
  clicker: ClickerGame,
  tamagotchi: TamagotchiGame,
}
