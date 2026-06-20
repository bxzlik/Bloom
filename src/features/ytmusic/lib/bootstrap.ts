import { registerProvider } from '@features/providers'
import { registerSourceResolver } from '@features/player'
import { ytmProvider, ytmResolveStream } from '../model/provider'

let _done = false

/**
 * Подключает YouTube Music: регистрирует провайдер (поиск) и source-resolver
 * (стрим). Без авторизации — публичный поиск работает сразу, поэтому (в отличие
 * от Яндекса) нет `isEnabled`-гейта и refresh токена. Вызывается один раз из App.
 */
export const bootstrapYtmusic = (): void => {
  if (_done) return
  _done = true
  registerProvider(ytmProvider)
  registerSourceResolver(ytmResolveStream)
}
