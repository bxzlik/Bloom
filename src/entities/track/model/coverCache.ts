/**
 * Переживающий перезапуск кеш «id трека → URL обложки».
 *
 * Зачем: `trackRegistry` живёт только в памяти, поэтому треки площадок
 * (`sc_*`/`ym_*`/…) после рестарта не резолвятся — в истории и лайках остаются
 * одни id. Всё, что показывает обложки по id (быстрые карточки «История» /
 * «Любимые» на главной), после перезапуска набирало 1–2 картинки вместо 4.
 *
 * Кешируем только URL, а не Track целиком: для воспроизведения трек всё равно
 * надо перезапрашивать у площадки, а для фоновых коллажей хватает картинки.
 *
 * Лимит — 400 записей, вытесняется самое старое (порядок вставки Map).
 */

const LS_KEY = 'bloom_cover_cache'
const MAX = 400

const load = (): Map<string, string> => {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    if (!Array.isArray(arr)) return new Map()
    return new Map(arr.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string'))
  } catch {
    return new Map()
  }
}

const _map = load()
let _dirty = false

const flush = (): void => {
  if (!_dirty) return
  _dirty = false
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(_map)))
  } catch {
    // ignore (quota)
  }
}

export const coverCache = {
  get(id: string): string | undefined {
    return _map.get(id)
  },

  /**
   * Запомнить обложку. Запись в localStorage отложена до `save()`, чтобы
   * прогон по истории/лайкам не дёргал сериализацию на каждый трек.
   */
  put(id: string, cover: string | undefined | null): void {
    if (!id || !cover || _map.get(id) === cover) return
    _map.delete(id)
    _map.set(id, cover)
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
