import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Track } from '@entities/track'

/**
 * Журнал прослушиваний для «Итогов» (недели/месяца/года).
 *
 * Зачем отдельное хранилище. `useHistoryStore` держит ОДНУ запись на трек
 * (`{id, ts, count}`, ts = последнее прослушивание, лимит 200), а
 * `useActivityStore` — только «сколько треков за день», без id. Из них нельзя
 * получить «топ треков за прошлую неделю»: у трека нет истории по датам.
 * Поэтому здесь копится сырой поток событий «трек X сыгран в момент T».
 *
 * Схема (IndexedDB `bloom_stats`, v1):
 *   plays: autoIncrement, `{ ts, id }`, индекс by-ts
 *   meta:  keyPath=id, снимок трека `{ name, artist, cover, sec, src }`
 *
 * Почему снимок отдельным стором: обложка/название нужны и через год, а
 * `trackRegistry` живёт в памяти, `trackCache`/`coverCache` вытесняются на
 * 300/400 записях. Дублировать имя в каждое событие — лишние сотни килобайт,
 * поэтому события хранят только id.
 *
 * Обложки: сохраняем только http(s)-ссылки. У локальных треков обложка — это
 * data-URL на десятки килобайт; тысяча таких снимков раздула бы базу. Локальный
 * трек и так живёт в библиотеке — обложка резолвится по id при отрисовке.
 */

export interface PlayEvent {
  /** Момент, когда прослушивание засчитано (creditPlay, ~90% трека). */
  ts: number
  id: string
}

export interface PlayMeta {
  id: string
  name: string
  artist: string
  /** Только http(s); локальные data-URL не храним (см. шапку файла). */
  cover: string | null
  /** Длительность в секундах (0 — неизвестна). */
  sec: number
  /** Площадка: soundcloud / yandex / ytmusic / local. */
  src: string
}

interface StatsDB extends DBSchema {
  plays: {
    key: number
    value: PlayEvent
    indexes: { 'by-ts': number }
  }
  meta: {
    key: string
    value: PlayMeta
  }
}

const DB_NAME = 'bloom_stats'
const DB_VERSION = 1

/**
 * Потолок журнала. ~15–20к событий = год очень плотного слушания; 60к с запасом
 * покрывают несколько лет и весят единицы мегабайт в IDB. При переполнении
 * режем самые старые события.
 */
const MAX_EVENTS = 60_000
/** Насколько часто проверять переполнение (каждое N-е событие). */
const TRIM_EVERY = 200

let dbPromise: Promise<IDBPDatabase<StatsDB>> | null = null

const getDb = (): Promise<IDBPDatabase<StatsDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<StatsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('plays')) {
          const s = db.createObjectStore('plays', { autoIncrement: true })
          s.createIndex('by-ts', 'ts')
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

/** Площадка по префиксу id — как в StatsSection (id надёжнее флагов Track). */
export const srcFromId = (id: string): string =>
  id.startsWith('ytm_') ? 'ytmusic'
    : id.startsWith('ym_') ? 'yandex'
      : id.startsWith('sc_') ? 'soundcloud'
        : 'local'

/** «m:ss» / «h:mm:ss» → секунды (0, если формат неизвестен). */
export const parseDurSec = (dur: string | undefined): number => {
  if (!dur || dur === '—') return 0
  const p = dur.split(':').map(Number)
  if (p.some((n) => Number.isNaN(n))) return 0
  if (p.length === 2) return p[0]! * 60 + p[1]!
  if (p.length === 3) return p[0]! * 3600 + p[1]! * 60 + p[2]!
  return 0
}

let _sinceTrim = 0

/**
 * Записать прослушивание. Вызывается из `creditPlay` (одна точка на всё
 * приложение) и намеренно НЕ ожидается вызывающим: сбой журнала не должен
 * ломать воспроизведение.
 *
 * Трек опционален: если он не резолвится (реестр площадок живёт в памяти и
 * запись могла потеряться), событие всё равно пишем — иначе прослушивание
 * пропадает из итогов совсем. Снимок в `meta` тогда не трогаем: прежний, если
 * он есть, точнее пустышки.
 */
export const logPlay = async (id: string, track?: Track | null, ts = Date.now()): Promise<void> => {
  if (!id) return
  try {
    const db = await getDb()
    const tx = db.transaction(['plays', 'meta'], 'readwrite')
    void tx.objectStore('plays').add({ ts, id })
    if (track) {
      const cover = track.cover && /^https?:/i.test(track.cover) ? track.cover : null
      void tx.objectStore('meta').put({
        id,
        name: track.name || '',
        artist: track.artist || '',
        cover,
        sec: parseDurSec(track.dur),
        src: srcFromId(id),
      })
    }
    await tx.done
    if (++_sinceTrim >= TRIM_EVERY) {
      _sinceTrim = 0
      await trim()
    }
  } catch (e) {
    console.warn('[wrapped] logPlay failed', e)
  }
}

/** Срезать самые старые события, если журнал перерос лимит. */
const trim = async (): Promise<void> => {
  const db = await getDb()
  const count = await db.count('plays')
  if (count <= MAX_EVENTS) return
  let excess = count - MAX_EVENTS
  const tx = db.transaction('plays', 'readwrite')
  let cursor = await tx.store.openCursor()
  while (cursor && excess > 0) {
    await cursor.delete()
    excess--
    cursor = await cursor.continue()
  }
  await tx.done
}

export interface PlayLog {
  /** Все события, по возрастанию ts. */
  events: PlayEvent[]
  meta: Map<string, PlayMeta>
}

/**
 * Прочитать весь журнал. Итоги считаются в памяти (десятки тысяч записей —
 * миллисекунды), зато один код на все периоды и на «первое появление артиста»,
 * которому всё равно нужна вся история.
 */
export const loadPlayLog = async (): Promise<PlayLog> => {
  try {
    const db = await getDb()
    const [events, metaRows] = await Promise.all([
      db.getAllFromIndex('plays', 'by-ts'),
      db.getAll('meta'),
    ])
    return { events, meta: new Map(metaRows.map((m) => [m.id, m])) }
  } catch (e) {
    console.warn('[wrapped] loadPlayLog failed', e)
    return { events: [], meta: new Map() }
  }
}

/** Сколько всего событий в журнале (дёшево, без чтения самих записей). */
export const playLogSize = async (): Promise<number> => {
  try {
    return await (await getDb()).count('plays')
  } catch {
    return 0
  }
}

/** Очистить журнал — часть «Очистить статистику» в профиле. */
export const clearPlayLog = async (): Promise<void> => {
  try {
    const db = await getDb()
    const tx = db.transaction(['plays', 'meta'], 'readwrite')
    void tx.objectStore('plays').clear()
    void tx.objectStore('meta').clear()
    await tx.done
  } catch (e) {
    console.warn('[wrapped] clearPlayLog failed', e)
  }
}
