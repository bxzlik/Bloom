import { registerProvider } from '@features/providers'
import { registerSourceResolver } from '@features/player'
import { spProvider, spResolveStream } from '../model/provider'
import { useSpAuthStore } from '../model/authStore'

let _done = false

/**
 * Подключает Spotify: регистрирует провайдер (поиск/страницы) и source-resolver
 * (бридж-стрим на SoundCloud). Провайдер гейтится `isEnabled` по наличию creds —
 * до их ввода Spotify не участвует в поиске. Вызывается один раз из App; заодно
 * перечитывает creds (чтобы дропдаун источника знал, включён ли Spotify).
 */
export const bootstrapSpotify = (): void => {
  if (_done) return
  _done = true
  registerProvider(spProvider)
  registerSourceResolver(spResolveStream)
  void useSpAuthStore.getState().refresh()
}
