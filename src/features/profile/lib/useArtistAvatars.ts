import { useEffect, useState } from 'react'
import { getProvider } from '@features/providers'

/**
 * Фоновая подгрузка настоящих аватаров артистов для топов (профиль и «Итоги»).
 *
 * В истории от артиста остаётся одно имя, поэтому аватар приходится искать по
 * имени — но НЕ где придётся: у той площадки, где его и слушали. Раньше хук
 * всегда ходил в SoundCloud, и у слушателя Яндекса/YT Music в топе оказывались
 * чужие аккаунты с тем же именем (порт поведения мобильной версии,
 * `artist_avatars.dart`). Поэтому и ключ кеша — «площадка|имя».
 *
 * Кеш в `localStorage['bloom_artist_avas']`, TTL 30 дней. Промахи («не нашли»)
 * кешируются тоже, чтобы не дёргать сеть повторно. Площадка недоступна или не
 * настроена — тихо игнорируем: в топе остаётся обложка лучшего трека артиста.
 */

const LS_KEY = 'bloom_artist_avas'
const TTL = 30 * 24 * 3600 * 1000

/** Кого спрашивать и у какой площадки. */
export interface ArtistRef {
  name: string
  /** Площадка, где артиста слушали (`soundcloud`/`yandex`/`ytmusic`/`local`). */
  source: string
}

/**
 * У какого провайдера искать артиста. У локальных файлов своей площадки нет —
 * их артиста ищем на SoundCloud (так же поступает переход из «Итогов»).
 */
export const artistProviderOf = (source: string): string =>
  source && source !== 'local' ? source : 'soundcloud'

/**
 * Ключ кеша и возвращаемой карты. Одна функция на запись и на чтение: разъедься
 * они, топ смотрел бы в пустоту.
 */
export const artistAvatarKey = (source: string, name: string): string =>
  `${artistProviderOf(source)}|${name.trim().toLowerCase()}`

type AvaCache = Record<string, { url: string; t: number }>

/** Кеш общий на все инстансы хука: топ артистов рисуют сразу несколько слайдов. */
let cache: AvaCache | null = null
/** Кого уже спрашиваем — чтобы параллельные топы не слали одинаковые запросы. */
const inFlight = new Set<string>()
const listeners = new Set<(m: Record<string, string>) => void>()

const load = (): AvaCache => {
  if (cache) return cache
  const out: AvaCache = {}
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const k in raw as AvaCache) {
        // Записи старого кеша лежали под голым именем — площадки в них нет, и
        // чьи это аватарки, уже не сказать. Роняем: перезапросятся у нужной.
        if (!k.includes('|')) continue
        out[k] = (raw as AvaCache)[k]!
      }
    }
  } catch {
    // повреждённый JSON — пустой кеш
  }
  cache = out
  return out
}

const save = (): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache ?? {}))
  } catch {
    // переполнение — игнорируем
  }
}

const toMap = (c: AvaCache): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const k in c) if (c[k]!.url) out[k] = c[k]!.url
  return out
}

const publish = (): void => {
  save()
  const m = toMap(cache ?? {})
  for (const fn of listeners) fn(m)
}

export const useArtistAvatars = (refs: ArtistRef[]): Record<string, string> => {
  const [avas, setAvas] = useState<Record<string, string>>(() => toMap(load()))

  // join — стабильный ключ зависимости (массив пересоздаётся каждый рендер)
  const key = refs.map((r) => artistAvatarKey(r.source, r.name)).join('|')

  // Догрузку делает один инстанс, а показать её надо всем: подписываемся на
  // общий кеш (иначе соседний топ ждал бы своего ре-рендера).
  useEffect(() => {
    listeners.add(setAvas)
    return () => {
      listeners.delete(setAvas)
    }
  }, [])

  useEffect(() => {
    if (!refs.length) return
    const c = load()
    const now = Date.now()
    const todo = refs.filter((r) => {
      if (!r.name.trim()) return false
      const k = artistAvatarKey(r.source, r.name)
      if (inFlight.has(k)) return false
      const hit = c[k]
      return !hit || now - (hit.t || 0) > TTL
    })
    if (!todo.length) return
    for (const r of todo) inFlight.add(artistAvatarKey(r.source, r.name))

    void (async () => {
      let changed = false
      for (const r of todo) {
        const k = artistAvatarKey(r.source, r.name)
        const prov = getProvider(artistProviderOf(r.source))
        // Площадка выключена — промах не запоминаем: включат, и спросим.
        if (!prov?.resolveArtistByName) {
          inFlight.delete(k)
          continue
        }
        let url = ''
        try {
          url = (await prov.resolveArtistByName(r.name))?.cover ?? ''
        } catch {
          // Сети нет или площадка отказала — запомним промах, чтобы не биться
          // об неё каждым открытием профиля.
        }
        c[k] = { url, t: Date.now() }
        inFlight.delete(k)
        changed = true
      }
      if (changed) publish()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return avas
}
