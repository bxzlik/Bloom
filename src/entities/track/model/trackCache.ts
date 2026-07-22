import { trackRegistry } from './registry'
import type { Track } from './types'

/**
 * Переживающий перезапуск кеш снимков треков площадок («id → Track»).
 *
 * Зачем: `trackRegistry` живёт только в памяти, а персистентные списки (история,
 * лайки, плейлисты) хранят одни id. Трек площадки, которого нет в библиотеке,
 * после перезапуска не резолвился ни в одном из них — запись оставалась в
 * localStorage, но список её молча пропускал («послушал → трек в истории →
 * перезашёл → истории нет»). `coverCache` спасал только коллажи на главной:
 * картинки хватает для фона, но не для строки списка и не для воспроизведения.
 *
 * Снимок кладётся в реестр при старте (см. гидратацию ниже), поэтому весь
 * остальной код продолжает ходить через `trackRegistry`, ничего не зная о кеше.
 *
 * Не храним: `url` (signed-ссылка протухает), `scMedia` (transcodings раздувают
 * localStorage; резолвер дотянет их по `scId`) и `description` (длинный текст,
 * в списках не нужен).
 *
 * Лимит — 300 записей, вытесняется самое старое (порядок вставки Map).
 */

const LS_KEY = 'bloom_track_cache'
const MAX = 300

const strip = (t: Track): Track => {
  const { url: _url, scMedia: _scMedia, description: _desc, ...rest } = t
  return rest as Track
}

const load = (): Map<string, Track> => {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    if (!Array.isArray(arr)) return new Map()
    return new Map(
      arr.filter(
        (e): e is [string, Track] =>
          Array.isArray(e) && typeof e[0] === 'string' && !!e[1] && typeof e[1] === 'object',
      ),
    )
  } catch {
    return new Map()
  }
}

const _map = load()
let _dirty = false

// Гидратация реестра снимками — до того, как что-либо начнёт резолвить id.
// Реальные (свежие) треки, если они уже пришли от площадки, не перетираем.
for (const [id, t] of _map) if (!trackRegistry.has(id)) trackRegistry.put(t)

const flush = (): void => {
  if (!_dirty) return
  _dirty = false
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(_map)))
  } catch {
    // ignore (quota)
  }
}

export const trackCache = {
  get(id: string): Track | undefined {
    return _map.get(id)
  },

  /**
   * Запомнить снимок трека площадки. Библиотечные треки сюда класть НЕ надо —
   * их источник правды `useLibStore`. Запись в localStorage отложена до `save()`.
   */
  put(t: Track | undefined | null): void {
    if (!t?.id) return
    _map.delete(t.id)
    _map.set(t.id, strip(t))
    while (_map.size > MAX) _map.delete(_map.keys().next().value as string)
    _dirty = true
  },

  /** Сбросить накопленное в localStorage (вызывать после пачки `put`). */
  save: flush,

  remove(ids: string | string[]): void {
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      if (_map.delete(id)) _dirty = true
    }
    flush()
  },
}
