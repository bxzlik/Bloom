import { registerProvider } from '../model/registry'
import { localProvider } from './localProvider'

let _done = false

/**
 * Регистрирует встроенные провайдеры. Вызывается один раз из App.
 * Сетевые провайдеры (SoundCloud/Yandex) регистрируют себя сами при инициализации
 * своих фич — здесь только встроенный локальный.
 */
export const bootstrapProviders = (): void => {
  if (_done) return
  _done = true
  registerProvider(localProvider)
}
