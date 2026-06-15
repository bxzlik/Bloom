import { useEffect, useState } from 'react'

export type LibSidebarSort = 'default' | 'name-asc' | 'name-desc' | 'type'

const KEY = 'bloom_lib_sidebar_sort'
const VALID: LibSidebarSort[] = ['default', 'name-asc', 'name-desc', 'type']

const read = (): LibSidebarSort => {
  try {
    const v = localStorage.getItem(KEY)
    if (v && (VALID as string[]).includes(v)) return v as LibSidebarSort
  } catch {
    // ignore
  }
  return 'default'
}

/**
 * Сортировка сайдбара `_libSidebarSort` + `setLibSidebarSort`.
 * Хранится в `localStorage[bloom_lib_sidebar_sort]`.
 */
export const useLibSidebarSort = (): [LibSidebarSort, (m: LibSidebarSort) => void] => {
  const [mode, setMode] = useState<LibSidebarSort>(read)

  // Слушаем storage event — если открыто несколько окон, синхронизируемся.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setMode(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = (next: LibSidebarSort) => {
    setMode(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // ignore
    }
  }

  return [mode, update]
}
