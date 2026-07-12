/**
 * IndexedDB-хранилище медиа-библиотеки кастомизации. Две роли записей в одном object store `items`:
 *   - пользовательские картинки: `{ id, name, data, type, addedAt }`
 *   - текущие выборы приложения: `{ id: '_appimg_<key>', data, _appimg: true }`
 *     (key = manualBgUrl | playerCoverUrl | vizPhoto | customCursor)
 *
 * dataURL'ы крупные → именно IDB (не localStorage). Фолбэк на localStorage —
 * на случай недоступной IDB.
 */

export interface MediaItem {
  id: string
  name: string
  /** dataURL (загруженный файл) ИЛИ http(s)-URL (добавлен по ссылке). */
  data: string
  /** MIME ('image/png'...) или 'url' для внешних ссылок. */
  type: string
  addedAt: number
}

/** Ключи «текущих» картинок приложения (_appimg_<key>). */
export type AppImageKey = 'manualBgUrl' | 'playerCoverUrl' | 'vizPhoto' | 'customCursor' | 'sliderThumb'

const DB_NAME = 'bloom_media'
const STORE = 'items'
const APPIMG_PREFIX = '_appimg_'

let _db: IDBDatabase | null = null
let _openPromise: Promise<IDBDatabase | null> | null = null

const openDb = (): Promise<IDBDatabase | null> => {
  if (_db) return Promise.resolve(_db)
  if (_openPromise) return _openPromise
  _openPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => {
        _db = req.result
        resolve(_db)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return _openPromise
}

/** Загрузить пользовательские картинки (без _appimg_* записей), в порядке добавления. */
export const loadItems = async (): Promise<MediaItem[]> => {
  const db = await openDb()
  if (!db) {
    try {
      const raw = localStorage.getItem('bloom_media_items')
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        const all = (req.result as (MediaItem & { _appimg?: boolean })[]) || []
        resolve(all.filter((x) => !x.id.startsWith(APPIMG_PREFIX)))
      }
      req.onerror = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

/** Перезаписать весь список пользовательских картинок (не трогая _appimg_*). */
export const saveItems = async (items: MediaItem[]): Promise<void> => {
  const db = await openDb()
  if (!db) {
    try {
      localStorage.setItem('bloom_media_items', JSON.stringify(items))
    } catch {
      /* переполнение — игнор */
    }
    return
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const st = tx.objectStore(STORE)
      // Удаляем старые пользовательские записи, _appimg_* оставляем.
      const getReq = st.getAllKeys()
      getReq.onsuccess = () => {
        const keys = (getReq.result as IDBValidKey[]) || []
        for (const k of keys) {
          if (typeof k === 'string' && !k.startsWith(APPIMG_PREFIX)) st.delete(k)
        }
        for (const it of items) st.put(it)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Сохранить/снять «текущую» картинку приложения (_appimg_<key>). */
export const saveAppImage = async (key: AppImageKey, dataUrl: string | null): Promise<void> => {
  const db = await openDb()
  const id = APPIMG_PREFIX + key
  if (!db) {
    try {
      if (dataUrl) localStorage.setItem(id, dataUrl)
      else localStorage.removeItem(id)
    } catch {
      /* игнор */
    }
    return
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const st = tx.objectStore(STORE)
      if (dataUrl) st.put({ id, data: dataUrl, _appimg: true })
      else st.delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export interface CustomizationStats {
  count: number
  bytes: number
}

/** Оценка размера одной записи: для dataURL — декодированные байты (base64→ ~3/4),
 *  для http(s)-ссылки — длина строки. Точный размер IDB неизвестен, это оценка. */
const approxBytes = (data: string): number => {
  if (!data) return 0
  if (data.startsWith('data:')) {
    const comma = data.indexOf(',')
    const b64 = comma >= 0 ? data.length - comma - 1 : data.length
    return Math.round(b64 * 0.75)
  }
  return data.length
}

/** Статистика медиа-библиотеки кастомизации: число пользовательских картинок +
 *  суммарный оценочный размер (без учёта _appimg_* — текущих выборов приложения). */
export const customizationStats = async (): Promise<CustomizationStats> => {
  const items = await loadItems()
  let bytes = 0
  for (const it of items) bytes += approxBytes(it.data)
  return { count: items.length, bytes }
}

/** Загрузить все «текущие» картинки приложения (map key→dataUrl). */
export const loadAppImages = async (): Promise<Partial<Record<AppImageKey, string>>> => {
  const db = await openDb()
  if (!db) {
    const out: Partial<Record<AppImageKey, string>> = {}
    for (const k of ['manualBgUrl', 'playerCoverUrl', 'vizPhoto', 'customCursor', 'sliderThumb'] as AppImageKey[]) {
      const v = localStorage.getItem(APPIMG_PREFIX + k)
      if (v) out[k] = v
    }
    return out
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        const out: Partial<Record<AppImageKey, string>> = {}
        for (const rec of (req.result as { id: string; data: string }[]) || []) {
          if (rec.id.startsWith(APPIMG_PREFIX)) {
            const key = rec.id.slice(APPIMG_PREFIX.length) as AppImageKey
            out[key] = rec.data
          }
        }
        resolve(out)
      }
      req.onerror = () => resolve({})
    } catch {
      resolve({})
    }
  })
}
