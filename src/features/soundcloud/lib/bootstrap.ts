import { registerProvider } from '@features/providers'
import { registerSourceResolver } from '@features/player'
import { registerPlaylistFetcher } from '@features/library'
import { getPlaylistTracks, getUserLikes } from '../api/scClient'
import { toTrack } from '../model/mappers'
import { scProvider, scResolveStream } from '../model/provider'

let _done = false

/**
 * Подключает SoundCloud: регистрирует провайдер (для поиска) и source-resolver
 * (для воспроизведения стрима). Сетевые провайдеры само-регистрируются —
 * вызывается один раз из App. После этого SC-результаты появляются в общем
 * поиске, а SC-треки играют через общий плеер, без правок их UI/логики.
 */
export const bootstrapSoundcloud = (): void => {
  if (_done) return
  _done = true
  registerProvider(scProvider)
  registerSourceResolver(scResolveStream)
  // «Обновить треки»: плейлист по permalink или лайки пользователя по id → Track[].
  registerPlaylistFetcher(async (src) => {
    const raw = src.kind === 'likes' ? await getUserLikes(src.userId) : await getPlaylistTracks(src.url)
    return raw.map(toTrack)
  })
}
