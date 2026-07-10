// Глубокий путь (не barrel @features/player) — избегаем цикла с player/ui.
import { registerSourceResolver } from '@features/player/lib/sourceResolvers'
import { localFileUrl } from '@shared/lib/localFile'
import { offlineScanAll } from '../api'
import { offline, useOfflineStore } from '../model/store'

let _done = false

/**
 * Подключает офлайн-кеш: регистрирует source-resolver (офлайн-копия трека
 * выигрывает у сетевого стрима) и гидратирует стор из offline.json.
 *
 * Резолвер должен регистрироваться ПЕРВЫМ (до площадок SC/YM/YTM/Spotify),
 * поэтому `bootstrapOffline()` вызывается в App раньше остальных bootstrap'ов.
 * Для «чужих» (не офлайн) треков резолвер возвращает null — очередь переходит
 * к сетевым резолверам.
 */
export const bootstrapOffline = (): void => {
  if (_done) return
  _done = true
  registerSourceResolver((t) => {
    const p = useOfflineStore.getState().paths.get(t.id)
    return p ? { url: localFileUrl(p) } : null
  })
  offlineScanAll()
    .then((entries) => offline.setAll(entries))
    .catch((e) => console.warn('offlineScanAll failed', e))
}
