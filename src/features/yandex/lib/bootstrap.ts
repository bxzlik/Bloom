import { registerProvider } from '@features/providers'
import { registerSourceResolver } from '@features/player'
import { ymProvider, ymResolveStream } from '../model/provider'
import { useYmAuthStore } from '../model/authStore'

let _done = false

/**
 * Подключает Яндекс.Музыку: регистрирует провайдер (поиск/страницы) и
 * source-resolver (стрим). Провайдер гейтится `isEnabled` по логину — до
 * авторизации он не участвует в поиске. Вызывается один раз из App; заодно
 * перечитывает статус токена (чтобы дропдаун источника знал, авторизованы ли мы).
 */
export const bootstrapYandex = (): void => {
  if (_done) return
  _done = true
  registerProvider(ymProvider)
  registerSourceResolver(ymResolveStream)
  void useYmAuthStore.getState().refresh()
}
