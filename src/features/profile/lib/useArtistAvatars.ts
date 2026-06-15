import { useEffect, useState } from 'react'
import { searchArtists } from '@features/soundcloud'

/**
 * Фоновая подгрузка реальных аватаров артистов с SoundCloud.
 * `_enrichTopArtistAvas` + `_loadArtistAvaCache`/`_saveArtistAvaCache`
 *. Кеш в `localStorage['bloom_artist_avas']`, TTL 30 дней.
 *
 * Возвращает map `name.toLowerCase() → avatar url`. Пустые (не найдено)
 * кешируются тоже, чтобы не дёргать сеть повторно. Если SC недоступен
 * (нет client_id) — тихо игнорируем, остаётся fallback на обложку трека.
 */

const LS_KEY = 'bloom_artist_avas'
const TTL = 30 * 24 * 3600 * 1000

type AvaCache = Record<string, { url: string; t: number }>

const loadCache = (): AvaCache => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as AvaCache
  } catch {
    // повреждённый JSON — пустой кеш
  }
  return {}
}

const saveCache = (c: AvaCache): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(c))
  } catch {
    // переполнение — игнорируем
  }
}

const toMap = (c: AvaCache): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const k in c) if (c[k]!.url) out[k] = c[k]!.url
  return out
}

export const useArtistAvatars = (names: string[]): Record<string, string> => {
  const [avas, setAvas] = useState<Record<string, string>>(() => toMap(loadCache()))

  // join — стабильный ключ зависимости (массив пересоздаётся каждый рендер)
  const key = names.join('|')

  useEffect(() => {
    if (!names.length) return
    const cache = loadCache()
    const now = Date.now()
    const todo = names.filter((n) => {
      const c = cache[n.toLowerCase()]
      return !c || now - (c.t || 0) > TTL
    })
    if (!todo.length) return

    let cancelled = false
    void (async () => {
      let changed = false
      for (const name of todo) {
        const nl = name.toLowerCase()
        try {
          const res = await searchArtists(name, 3)
          const items = res.items || []
          const match = items.find((a) => (a.title || '').toLowerCase() === nl) || items[0]
          cache[nl] = { url: (match && match.artwork) || '', t: now }
          changed = true
        } catch {
          cache[nl] = { url: '', t: now }
          changed = true
        }
      }
      if (changed && !cancelled) {
        saveCache(cache)
        setAvas(toMap(cache))
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return avas
}
