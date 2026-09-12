/**
 * Свои шрифты: файл, загруженный пользователем, становится в один ряд со
 * встроенными (features/settings/lib/fonts.ts).
 *
 * Файл КОПИРУЕТСЯ внутрь приложения (dataURL в IndexedDB `bloom_fonts`), а не
 * читается с диска по пути: иначе шрифт умирал бы после переноса/удаления
 * исходника, а `file://` из вебвью Tauri всё равно не отдаётся.
 *
 * Два хранилища на один список — намеренно:
 *   - IDB держит сами файлы (сотни КБ, в localStorage не влезут);
 *   - localStorage `bloom_user_fonts` — только мета (id/имя/семейство), зато
 *     СИНХРОННО. `normalizeFont` вызывается при импорте themeStore, до любого
 *     await: без синхронной меты выбранный свой шрифт на старте выглядел бы
 *     «неизвестным» и молча сбрасывался на Inter.
 *
 * Сам @font-face появляется, когда IDB ответит (десятки мс) — до этого текст
 * рисуется запасным шрифтом стека, как и при `font-display:swap`.
 */

export interface UserFont {
  id: string
  /** Имя из файла, без расширения — показывается в настройках. */
  name: string
  /** Уникальное CSS-семейство (`bloomfont-<id>`), чтобы не конфликтовать с встроенными. */
  family: string
  /** dataURL файла шрифта. */
  data: string
  /** Хинт формата для @font-face: woff2 | woff | truetype | opentype. */
  format: string
  bytes: number
  addedAt: number
}

/** Мета без данных — то, что лежит в localStorage и читается синхронно. */
export type UserFontMeta = Pick<UserFont, 'id' | 'name' | 'family'>

const DB_NAME = 'bloom_fonts'
const STORE = 'fonts'
const LS_META = 'bloom_user_fonts'
const STYLE_ID = 'bloom-user-fonts'

/** Потолок на файл. Шрифт с CJK может весить и 20 МБ — такой в IDB класть незачем. */
export const MAX_FONT_BYTES = 12 * 1024 * 1024

/** Расширение → значение format() в @font-face. Неизвестное — не шрифт. */
const FORMATS: Record<string, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
}

export const ACCEPT_FONTS = '.woff2,.woff,.ttf,.otf'

/** Формат по имени файла; null — расширение не шрифтовое. */
export const fontFormat = (fileName: string): string | null => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return FORMATS[ext] ?? null
}

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

/** Мета из localStorage. Синхронно и без падений — её читает normalizeFont. */
export const loadUserFontMeta = (): UserFontMeta[] => {
  try {
    const raw = localStorage.getItem(LS_META)
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (x): x is UserFontMeta =>
        !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.family === 'string',
    )
  } catch {
    return []
  }
}

const saveUserFontMeta = (items: UserFont[]): void => {
  try {
    localStorage.setItem(LS_META, JSON.stringify(items.map(({ id, name, family }) => ({ id, name, family }))))
  } catch {
    /* переполнение — игнор */
  }
}

/** Все загруженные шрифты с данными, в порядке добавления. */
export const loadUserFonts = async (): Promise<UserFont[]> => {
  const db = await openDb()
  if (!db) return []
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        const all = (req.result as UserFont[]) || []
        resolve(all.slice().sort((a, b) => a.addedAt - b.addedAt))
      }
      req.onerror = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

export const putUserFont = async (font: UserFont, all: UserFont[]): Promise<void> => {
  saveUserFontMeta(all)
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(font)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export const deleteUserFont = async (id: string, all: UserFont[]): Promise<void> => {
  saveUserFontMeta(all)
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/**
 * Переписать общий `<style>` со всеми @font-face. Один тег на все шрифты:
 * удаление шрифта тогда — просто перерисовка тега, без охоты за своим правилом.
 *
 * `font-weight:100 900` — чтобы вариативный шрифт отдавал все начертания, а
 * не только 400 (жирный интерфейса — var(--fw-bold) 500, см. font-weight-tokens).
 */
export const injectUserFonts = (items: UserFont[]): void => {
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = STYLE_ID
    document.head.appendChild(tag)
  }
  tag.textContent = items
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-style:normal;font-weight:100 900;font-display:swap;` +
        `src:url("${f.data}") format('${f.format}')}`,
    )
    .join('\n')
}

/** CSS-значение font-family для своего шрифта (с запасным стеком). */
export const userFontValue = (family: string): string => `'${family}',system-ui,sans-serif`

export const genFontId = (): string => 'uf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/**
 * Файл → запись. Возвращает причину отказа вместо шрифта: вызывающий решает,
 * какой текст показать.
 */
export const readFontFile = async (
  file: File,
): Promise<{ font: UserFont } | { err: 'format' | 'size' | 'read' }> => {
  const format = fontFormat(file.name)
  if (!format) return { err: 'format' }
  if (file.size > MAX_FONT_BYTES) return { err: 'size' }
  const data = await new Promise<string | null>((resolve) => {
    const rd = new FileReader()
    rd.onload = (e) => resolve((e.target?.result as string) ?? null)
    rd.onerror = () => resolve(null)
    rd.readAsDataURL(file)
  })
  if (!data) return { err: 'read' }
  const id = genFontId()
  return {
    font: {
      id,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Font',
      family: `bloomfont-${id}`,
      data,
      format,
      bytes: file.size,
      addedAt: Date.now(),
    },
  }
}
