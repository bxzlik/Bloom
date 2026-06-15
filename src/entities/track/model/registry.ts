import type { Track } from './types'

/**
 * Глобальный реестр треков из НЕлокальных источников (SoundCloud / Yandex / …).
 *
 * Зачем: очередь плеера (`useQueueStore.queue`) хранит только `id`. Локальные и
 * загруженные треки резолвятся из `useLibStore.tracks`, но треки площадок там не
 * лежат. Чтобы плеер мог найти и проиграть «sc_123» / «ym_456», каждая площадка
 * после поиска/выдачи кладёт свои `Track` сюда, а `findTrack` в плеере смотрит
 * библиотеку → этот реестр.
 *
 * Единая типизированная точка для всех площадок (без глобалов).
 *
 * Библиотечные треки сюда НЕ дублируем — их источник правды `useLibStore`.
 *
 * `temp`-пометка отделяет эфемерные треки (результаты поиска, не добавленные в
 * библиотеку) — их можно массово выкинуть `clearTemp()` при уходе со страницы,
 * не задев те, что попали в очередь/историю и должны пережить навигацию.
 */
const _map = new Map<string, Track>()
const _temp = new Set<string>()

const _putOne = (t: Track, temp: boolean): void => {
  if (!t?.id) return
  _map.set(t.id, t)
  if (temp) _temp.add(t.id)
  else _temp.delete(t.id)
}

export const trackRegistry = {
  /**
   * Зарегистрировать трек(и). `temp:true` — эфемерные (выдача поиска); по
   * умолчанию false (трек должен пережить навигацию — он в очереди/истории).
   */
  put(t: Track | Track[], opts?: { temp?: boolean }): void {
    const temp = !!opts?.temp
    if (Array.isArray(t)) for (const x of t) _putOne(x, temp)
    else _putOne(t, temp)
  },

  /** Достать по id. undefined если неизвестен. */
  get(id: string): Track | undefined {
    return _map.get(id)
  },

  has(id: string): boolean {
    return _map.has(id)
  },

  /** «Закрепить» трек — снять temp-пометку (например при добавлении в очередь). */
  promote(id: string): void {
    _temp.delete(id)
  },

  remove(ids: string | string[]): void {
    const arr = Array.isArray(ids) ? ids : [ids]
    for (const id of arr) {
      _map.delete(id)
      _temp.delete(id)
    }
  },

  /** Выкинуть все эфемерные (temp) треки. Закреплённые остаются. */
  clearTemp(): void {
    for (const id of _temp) _map.delete(id)
    _temp.clear()
  },

  clear(): void {
    _map.clear()
    _temp.clear()
  },
}
