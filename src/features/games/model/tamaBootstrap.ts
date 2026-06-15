import { useEffect } from 'react'
import { audioEngine } from '@features/player'
import { earnFoodFromSong } from './tamaState'

/**
 * Глобальная подписка «конец трека → +1 еда тамагочи». Монтируется один раз в App, поэтому еда копится, пока ты слушаешь
 * музыку — даже когда игра закрыта (как и задумано в подсказке игры).
 */
export function useTamaBootstrap(): void {
  useEffect(() => audioEngine.onEndedSubscribe(earnFoodFromSong), [])
}
