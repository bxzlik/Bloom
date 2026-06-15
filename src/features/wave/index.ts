// Публичный API фичи «Волна». Импорт `@/wave` поднимает движок (window.Wave +
// авто-восстановление сессии) — единая точка инициализации.

import waveApi from '@/wave'

/** Типизированный API волны: startPersonal/startByTrack/startByQueue/feedback/… */
export const wave = waveApi
export default waveApi

export { WaveCard } from './ui/WaveCard'
export { DislikeButton } from './ui/DislikeButton'
export { DislikesModal } from './ui/DislikesModal'
export { useDislikesStore } from './model/dislikesStore'
