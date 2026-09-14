// Витрина «Похожие на X» на главной: один сид из топа прослушиваний и то, что на
// него похоже, — треки и артисты вперемешку.
//
// Сид живёт сутки, как «Для вас», и чередует тип: чётный день — артист,
// нечётный — трек. Внутри типа сиды идут по кругу по верху топа, так что витрина
// успевает показать несколько разных «якорей», а не держится за первое место.
//
// Откуда что берётся:
//   трек-сид   → похожие треки: `getSimilarTracks(сид)`;
//                похожие артисты: артист этого трека → `getArtist().similarArtists`.
//   артист-сид → похожие артисты: его страница, `similarArtists`;
//                похожие треки: похожие на его самые слушаемые треки, но без его
//                собственных (иначе витрина стала бы его дискографией).
//
// Сиды только с площадок, у которых есть похожие треки (`sc_`/`ym_`): YTM
// related не отдаёт, у локальных файлов спросить не у кого. Как и в «Для вас»,
// сид не резолвится в `Track` ради похожих — площадочный id уже в журнале.

import { playMeta, topPlayed, type TopPlayed } from '@/db/playStats'
import { srcFromId } from '@/db/playLog'
import { normalizeArtist } from '@/db/track-meta'
import { trackRegistry, type Track } from '@entities/track'
import type { Artist } from '@entities/artist'
import { getProvider } from '@features/providers'
import { t as tt } from '@shared/i18n'
import { parseArtists } from '@shared/lib/parseArtists'
import { useLibStore } from '../model/store'
import { useHistoryStore } from '../model/historyStore'
import { forYouTracks, knownDups } from './forYou'

/** Окно «текущего вкуса» — то же, что у «Для вас». */
const WINDOW_DAYS = 90
/** Меньше позиций за окно — считаем за всё время (новая установка). */
const WINDOW_MIN = 3
/** Из скольких верхних позиций топа крутится сид. */
const SEED_POOL = 5
/** Сколько сидов пробуем подряд, если первый не дал похожих. */
const SEED_TRIES = 2
const TRACKS_MAX = 14
const ARTISTS_MAX = 6
/** Больше двух треков одного артиста полоса не выдерживает — как в «Для вас». */
const PER_ARTIST_MAX = 2
/** Меньше карточек — витрина выглядит обрывком, пробуем другой тип сида. */
const MIN_ITEMS = 4

export type SimilarSeed =
  | {
      kind: 'track'
      id: string
      name: string
      artist: string
      cover: string | null
      /** Сам трек — чтобы плитка сида играла его и после рестарта. */
      track: Track | null
    }
  | { kind: 'artist'; providerId: string; id: string; name: string; cover: string | null }

export type SimilarItem =
  | { kind: 'track'; track: Track }
  | { kind: 'artist'; artist: Artist; providerId: string }

export interface SimilarTo {
  seed: SimilarSeed
  items: SimilarItem[]
}

/** Локальный день строкой — ключ суточного кэша. */
const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Номер локального дня: от него чётность типа сида и позиция в круге. */
const dayNumber = (): number => {
  const d = new Date()
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

const isPlatform = (id: string): boolean => id.startsWith('sc_') || id.startsWith('ym_')

const isRealArtist = (name: string): boolean => !!name && name !== tt('common.unknownArtist')

/** Самое слушаемое с площадок за окно; данных мало — за всё время. */
const topPlatform = (limit: number, minPlays: number): TopPlayed[] => {
  let top = topPlayed({ sinceDays: WINDOW_DAYS, limit, minPlays }).filter((r) => isPlatform(r.id))
  if (top.length < WINDOW_MIN) top = topPlayed({ limit, minPlays: 1 }).filter((r) => isPlatform(r.id))
  return top
}

/** Имя/артист/обложка трека: живой реестр, иначе снимок из журнала. */
const metaOf = (id: string): { name: string; artist: string; cover: string | null } | null => {
  const t = trackRegistry.get(id)
  if (t?.name) return { name: t.name, artist: t.artist || '', cover: t.cover ?? null }
  const m = playMeta(id)
  return m?.name ? { name: m.name, artist: m.artist, cover: m.cover } : null
}

interface ArtistRef {
  providerId: string
  id: string
  title: string
  cover: string | null
}

/**
 * Найти артиста на площадке трека `viaTrackId`. Если трек ещё в реестре и
 * артист у него один, берём точный id (Яндекс) или scId-подсказку (SoundCloud) —
 * поиск по имени на SoundCloud легко промахивается мимо нужного аккаунта.
 */
const resolveArtist = async (name: string, viaTrackId: string): Promise<ArtistRef | null> => {
  const providerId = srcFromId(viaTrackId)
  const t = trackRegistry.get(viaTrackId)
  const solo = !!t && parseArtists(t.artist).length === 1
  if (solo && t.artistId && t.artistProvider === providerId) {
    return { providerId, id: t.artistId, title: name, cover: t.artistAvatar ?? null }
  }
  const prov = getProvider(providerId)
  if (!prov?.resolveArtistByName) return null
  const hint = solo && t.artistScId != null ? { scId: t.artistScId, permalink: t.artistPermalink ?? null } : undefined
  try {
    const r = await prov.resolveArtistByName(name, hint)
    return r ? { providerId, id: r.id, title: r.title, cover: r.cover ?? null } : null
  } catch {
    return null
  }
}

/** Похожие артисты и аватар — со страницы артиста. Сбой — пусто. */
const artistPageOf = async (ref: ArtistRef): Promise<{ similar: Artist[]; avatar: string | null }> => {
  const prov = getProvider(ref.providerId)
  if (!prov?.getArtist) return { similar: [], avatar: null }
  try {
    const page = await prov.getArtist(ref.id)
    return { similar: page.similarArtists ?? [], avatar: page.artist.avatar ?? null }
  } catch {
    return { similar: [], avatar: null }
  }
}

const similarTracksOf = async (seedId: string): Promise<Track[]> => {
  const prov = getProvider(srcFromId(seedId))
  if (!prov?.getSimilarTracks) return []
  try {
    return await prov.getSimilarTracks(seedId)
  } catch {
    return []
  }
}

/**
 * Отбор треков: только незнакомое (не в библиотеке, не слышанное, не из
 * соседней «Для вас»), без реаплоадов и не больше двух от одного артиста.
 * `excludeArtist` — ключ артиста-сида: его треки в «похожих на него» лишние.
 */
const pickTracks = async (batch: Track[], skipIds: string[], excludeArtist: string | null): Promise<Track[]> => {
  const lib = useLibStore.getState().tracks
  const forYou = await forYouTracks()
  const known = new Set<string>(lib.map((t) => t.id))
  for (const e of useHistoryStore.getState().entries) known.add(e.id)
  for (const t of forYou) known.add(t.id)
  for (const id of skipIds) known.add(id)
  // Перезаливы сверяем и с соседней «Для вас»: под другим id та же песня
  // стояла бы в двух витринах одна под другой.
  const dup = knownDups(lib)
  for (const t of forYou) dup.add(t)

  const out: Track[] = []
  const perArtist = new Map<string, number>()
  for (const t of batch) {
    if (out.length >= TRACKS_MAX) break
    if (known.has(t.id)) continue
    if (excludeArtist && parseArtists(t.artist).some((n) => normalizeArtist(n) === excludeArtist)) continue
    const a = normalizeArtist(t.artist)
    const n = perArtist.get(a) ?? 0
    if (n >= PER_ARTIST_MAX) continue
    if (!dup.accept(t)) continue
    perArtist.set(a, n + 1)
    known.add(t.id)
    out.push(t)
  }
  return out
}

/** Похожие артисты без сида и повторов; с аватаркой — впереди, если их хватает. */
const pickArtists = (list: Artist[], excludeKey: string): Artist[] => {
  const seen = new Set<string>([excludeKey])
  const uniq = list.filter((a) => {
    const k = normalizeArtist(a.name)
    if (!a.name || seen.has(k)) return false
    seen.add(k)
    return true
  })
  // Серый круг-заглушка в ряду выглядит поломкой, поэтому безликих берём,
  // только когда иначе артистов почти нет.
  const withAva = uniq.filter((a) => !!a.avatar)
  return (withAva.length >= MIN_ITEMS ? withAva : uniq).slice(0, ARTISTS_MAX)
}

/**
 * Смешать: артист на каждой третьей позиции (Т А Т Т А Т Т …) — так ряд
 * читается как смесь, а не как два блока подряд. Кончился один вид — хвост
 * добивается другим.
 */
const mix = (tracks: Track[], artists: Artist[], providerId: string): SimilarItem[] => {
  const out: SimilarItem[] = []
  let ti = 0
  let ai = 0
  while (ti < tracks.length || ai < artists.length) {
    const wantArtist = out.length % 3 === 1
    if ((wantArtist && ai < artists.length) || ti >= tracks.length) {
      out.push({ kind: 'artist', artist: artists[ai++]!, providerId })
    } else {
      out.push({ kind: 'track', track: tracks[ti++]! })
    }
  }
  return out
}

/** Трек-сид: самые слушаемые треки, по кругу. */
const fromTrack = async (turn: number): Promise<SimilarTo | null> => {
  const pool = topPlatform(SEED_POOL * 4, 2).slice(0, SEED_POOL)
  for (let k = 0; k < Math.min(SEED_TRIES, pool.length); k++) {
    const id = pool[(turn + k) % pool.length]!.id
    const meta = metaOf(id)
    if (!meta) continue

    const tracks = await pickTracks(await similarTracksOf(id), [id], null)
    const first = parseArtists(meta.artist)[0] ?? ''
    const ref = isRealArtist(first) ? await resolveArtist(first, id) : null
    const artists = ref ? pickArtists((await artistPageOf(ref)).similar, normalizeArtist(first)) : []
    const items = mix(tracks, artists, ref?.providerId ?? srcFromId(id))
    if (items.length < MIN_ITEMS) continue

    // Плитка сида играет сам трек, а после рестарта его в реестре нет.
    let track = trackRegistry.get(id) ?? null
    const prov = getProvider(srcFromId(id))
    if (!track && prov?.resolveTrackById) track = await prov.resolveTrackById(id).catch(() => null)
    return {
      seed: { kind: 'track', id, name: meta.name, artist: meta.artist, cover: meta.cover ?? track?.cover ?? null, track },
      items,
    }
  }
  return null
}

interface ArtistCand {
  name: string
  key: string
  plays: number
  /** Его треки из топа, самый слушаемый первым (topPlayed отсортирован). */
  ids: string[]
  cover: string | null
}

/**
 * Топ артистов — свёртка топа треков, как в статистике профиля: совместный
 * трек идёт каждому из артистов, иначе в топе стояло бы склеенное имя, по
 * которому площадка никого не найдёт.
 */
const topArtists = (): ArtistCand[] => {
  const map = new Map<string, ArtistCand>()
  for (const r of topPlatform(1000, 1)) {
    const m = metaOf(r.id)
    if (!m) continue
    for (const name of parseArtists(m.artist)) {
      if (!isRealArtist(name)) continue
      const key = normalizeArtist(name)
      const cur = map.get(key) ?? { name, key, plays: 0, ids: [], cover: m.cover }
      cur.plays += r.plays
      cur.ids.push(r.id)
      map.set(key, cur)
    }
  }
  return [...map.values()].sort((a, b) => b.plays - a.plays).slice(0, SEED_POOL)
}

/** Артист-сид: самые слушаемые артисты, по кругу. */
const fromArtist = async (turn: number): Promise<SimilarTo | null> => {
  const pool = topArtists()
  for (let k = 0; k < Math.min(SEED_TRIES, pool.length); k++) {
    const cand = pool[(turn + k) % pool.length]!
    const ref = await resolveArtist(cand.name, cand.ids[0]!)
    if (!ref) continue

    const page = await artistPageOf(ref)
    const artists = pickArtists(page.similar, cand.key)
    // Похожие на один трек после отсева его же треков бывают жидкими —
    // тогда добираем от второго по прослушиваниям.
    const batch: Track[] = []
    let tracks: Track[] = []
    for (const id of cand.ids.slice(0, 2)) {
      batch.push(...(await similarTracksOf(id)))
      tracks = await pickTracks(batch, cand.ids, cand.key)
      if (tracks.length >= TRACKS_MAX) break
    }
    const items = mix(tracks, artists, ref.providerId)
    if (items.length < MIN_ITEMS) continue

    return {
      seed: {
        kind: 'artist',
        providerId: ref.providerId,
        id: ref.id,
        name: ref.title || cand.name,
        cover: page.avatar ?? ref.cover ?? cand.cover,
      },
      items,
    }
  }
  return null
}

/**
 * Собрать витрину. Тип сида — по чётности дня; не вышло (нет данных, площадка
 * промолчала) — пробуем другой тип, чтобы витрина не пропадала через день.
 * Запросы последовательные — по той же причине, что в «Для вас».
 */
export const buildSimilarTo = async (): Promise<SimilarTo | null> => {
  const day = dayNumber()
  const turn = Math.floor(day / 2)
  const order = day % 2 === 0 ? (['artist', 'track'] as const) : (['track', 'artist'] as const)
  for (const kind of order) {
    const res = kind === 'artist' ? await fromArtist(turn) : await fromTrack(turn)
    if (res) return res
  }
  console.warn('[similarTo] ни один сид не дал похожих')
  return null
}

/* ── Суточный кэш ────────────────────────────────────────────────────────
 * Как у «Для вас»: храним сами треки, а не id (реестр площадок живёт в памяти),
 * и при чтении возвращаем их в реестр. Артистам хэндлы не нужны — `getArtist`
 * разбирает id сам.
 *
 * Версия в ключе — про ЛОГИКУ отбора: меняешь правила — поднимай, иначе до
 * полуночи висит выдача, собранная по старым.
 *   v2 — перезаливы сверяются со слышанным и с треками «Для вас»
 */
const CACHE_KEY = 'bloom_similar_to_v2'

interface SimilarToCache {
  day: string
  data: SimilarTo
}

export const readSimilarToCache = (): SimilarTo | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as SimilarToCache
    if (!c || c.day !== today() || !c.data?.seed || !Array.isArray(c.data.items) || !c.data.items.length) return null
    const tracks = c.data.items.flatMap((it) => (it.kind === 'track' ? [it.track] : []))
    if (c.data.seed.kind === 'track' && c.data.seed.track) tracks.push(c.data.seed.track)
    if (tracks.length) trackRegistry.put(tracks, { temp: true })
    return c.data
  } catch {
    return null
  }
}

export const writeSimilarToCache = (data: SimilarTo): void => {
  if (!data.items.length) return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ day: today(), data } satisfies SimilarToCache))
  } catch {
    // localStorage переполнен — соберём заново в следующий заход.
  }
}

/* ── Сброс ───────────────────────────────────────────────────────────────
 * Часть «Очистить статистику»: сид взят из стёртого топа. Главная смонтирована,
 * поэтому кроме ключа нужен сигнал — секция забывает витрину и собирает заново.
 */
const resetListeners = new Set<() => void>()

export const onSimilarToReset = (fn: () => void): (() => void) => {
  resetListeners.add(fn)
  return () => {
    resetListeners.delete(fn)
  }
}

export const clearSimilarToCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // Хранилище недоступно — секцию всё равно пересоберём по сигналу.
  }
  for (const fn of resetListeners) fn()
}
