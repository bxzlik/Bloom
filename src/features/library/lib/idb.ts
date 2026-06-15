import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Track } from '@entities/track'

/**
 * Локальное IndexedDB-хранилище библиотеки.
 *
 * Только треки **загруженные пользователем** (через handleFiles): мета +
 * исходный Blob. Треки из folder_watcher (Rust) НЕ дублируются — Rust
 * пере-присылает их при каждом старте.
 *
 * Схема v1:
 *   tracks: keyPath=id  → { meta: Track (без url), file?: Blob }
 *
 * `file` опционален: загруженные пользователем треки несут Blob; треки площадок
 * (SoundCloud/Yandex), сохранённые в библиотеку, — meta-only (стрим резолвится
 * на лету через source-resolver, см. project-bloom-platform-layer).
 *
 * URL аудио (Blob URL) создаётся в рантайме через blobMgr.create при загрузке.
 */

interface BloomDBv1 extends DBSchema {
  tracks: {
    key: string
    value: {
      id: string
      meta: Track
      file?: Blob
    }
  }
}

const DB_NAME = 'bloom'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<BloomDBv1>> | null = null

const getDb = (): Promise<IDBPDatabase<BloomDBv1>> => {
  if (!dbPromise) {
    dbPromise = openDB<BloomDBv1>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('tracks')) {
          db.createObjectStore('tracks', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

/** blob URL не персистентен — обнуляем перед сохранением. */
const stripUrl = (t: Track): Track => ({ ...t, url: null })

export const idbSaveTrack = async (track: Track, file: Blob): Promise<void> => {
  const db = await getDb()
  await db.put('tracks', { id: track.id, meta: stripUrl(track), file })
}

/**
 * Сохранить meta-only трек (без Blob) — для треков площадок (SC/Yandex),
 * добавленных в библиотеку. Воспроизведение идёт через source-resolver.
 * Если запись с Blob уже была (загруженный трек) — Blob сохраняется.
 */
export const idbSaveMeta = async (track: Track): Promise<void> => {
  const db = await getDb()
  const existing = await db.get('tracks', track.id)
  await db.put('tracks', {
    id: track.id,
    meta: stripUrl(track),
    ...(existing?.file ? { file: existing.file } : {}),
  })
}

export const idbUpdateMeta = async (track: Track): Promise<void> => {
  const db = await getDb()
  const existing = await db.get('tracks', track.id)
  if (!existing) return
  await db.put('tracks', {
    id: track.id,
    meta: stripUrl(track),
    file: existing.file,
  })
}

export const idbDeleteTrack = async (id: string): Promise<void> => {
  const db = await getDb()
  await db.delete('tracks', id)
}

/**
 * Загрузить все треки из IDB. Возвращает массив `{ track, file }`,
 * вызывающий код сам создаёт blob URL и кладёт в стор.
 */
export const idbLoadAll = async (): Promise<
  Array<{ track: Track; file?: Blob }>
> => {
  const db = await getDb()
  const rows = await db.getAll('tracks')
  return rows.map((r) => ({ track: r.meta, file: r.file }))
}
