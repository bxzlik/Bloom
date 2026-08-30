import { parseArtists } from '@shared/lib/parseArtists'
import { srcFromId, type PlayLog, type PlayMeta } from '../model/playLog'
import type { PeriodRange } from './periods'

/**
 * Сборка «Итогов» из журнала прослушиваний. Чистая функция: события + снимки
 * треков → всё, что показывают слайды. Один проход по журналу, порядок событий
 * по возрастанию ts (loadPlayLog отдаёт их из индекса by-ts).
 *
 * Время прослушивания — ОЦЕНКА: Σ длительность трека × число прослушиваний.
 * Прослушивание засчитывается на ~90% трека (creditPlay), поэтому оценка близка
 * к правде, но не является замером.
 */

export interface WrappedTrack {
  id: string
  name: string
  artist: string
  cover: string | null
  src: string
  plays: number
  sec: number
}

export interface WrappedArtist {
  name: string
  plays: number
  cover: string | null
  /**
   * Площадка, где его слушали чаще всего — по ней ищется аватар и открывается
   * страница артиста. Свои файлы в счёт не идут, пока есть хоть одна площадка:
   * у локального артиста страницы нет.
   */
  src: string
}

export interface WrappedSource {
  src: string
  plays: number
  sec: number
}

export interface WrappedData {
  range: PeriodRange
  /** Всего засчитанных прослушиваний за период. */
  plays: number
  uniqueTracks: number
  uniqueArtists: number
  /** Оценка времени прослушивания, секунды. */
  sec: number
  topTracks: WrappedTrack[]
  topArtists: WrappedArtist[]
  sources: WrappedSource[]
  /** Артисты, впервые появившиеся в журнале в этом периоде. */
  newArtists: WrappedArtist[]
  newArtistsCount: number
  newTracksCount: number
  /** Самый «залипательный» день периода. */
  recordDay: { ts: number; plays: number } | null
  /** Гистограмма по часам суток (24 значения, локальное время). */
  hours: number[]
  peakHour: number
  /** Доля прослушиваний с 00:00 до 05:59 — «ночной слушатель». */
  nightShare: number
  /** Дней, в которые вообще что-то играло. */
  activeDays: number
  /** Самая длинная серия дней подряд. */
  streak: number
}

const STUB = (id: string): PlayMeta => ({ id, name: '', artist: '', cover: null, sec: 0, src: srcFromId(id) })

/** Локальный ключ дня — «YYYY-MM-DD» по местному времени (не UTC). */
const dayKey = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Ключ группировки артиста: регистр и лишние пробелы не должны плодить дубли. */
const artistKey = (name: string): string => name.trim().toLowerCase()

/**
 * Имена артистов трека по отдельности: строка бывает мультиартистной
 * («reidenshi, Øneheart»), а в топ должен попадать каждый сам по себе — по
 * склеенному имени площадка не найдёт ни аватара, ни страницы.
 *
 * Кеш — потому что зовётся на КАЖДОЕ событие журнала, а строк артистов там
 * заметно меньше, чем прослушиваний.
 */
const splitArtists = (str: string, cache: Map<string, string[]>): string[] => {
  const hit = cache.get(str)
  if (hit) return hit
  const names = parseArtists(str)
  cache.set(str, names)
  return names
}

/**
 * Площадка артиста — та, где его слушали чаще. Свои файлы в счёт не идут, пока
 * есть хоть одна площадка: у локального артиста своей страницы нет, и искать
 * его там, где слушали хотя бы раз, — единственный способ на неё попасть.
 */
const artistSrc = (plays: Map<string, number>): string => {
  let top = ''
  let best = 0
  for (const [src, n] of plays) {
    if (src === 'local' || n <= best) continue
    top = src
    best = n
  }
  return top || 'local'
}

export const buildWrapped = (log: PlayLog, range: PeriodRange): WrappedData => {
  const { from, to } = range

  // Что уже звучало ДО периода — нужно для «открытий» (новых артистов/треков).
  const seenTracks = new Set<string>()
  const seenArtists = new Set<string>()

  const trackAgg = new Map<string, WrappedTrack>()
  const artistAgg = new Map<
    string,
    WrappedArtist & { bestPlays: number; srcs: Map<string, number> }
  >()
  const srcAgg = new Map<string, WrappedSource>()
  const dayAgg = new Map<string, number>()
  const hours = new Array<number>(24).fill(0)

  let plays = 0
  let sec = 0
  let newTracksCount = 0
  const newArtistKeys = new Set<string>()
  const splitCache = new Map<string, string[]>()

  for (const e of log.events) {
    if (e.ts < from) {
      seenTracks.add(e.id)
      const m = log.meta.get(e.id)
      if (m?.artist) for (const n of splitArtists(m.artist, splitCache)) seenArtists.add(artistKey(n))
      continue
    }
    if (e.ts >= to) break // события отсортированы по ts — дальше только «будущее»

    const m = log.meta.get(e.id) ?? STUB(e.id)
    plays++
    sec += m.sec

    const tr = trackAgg.get(e.id)
    if (tr) {
      tr.plays++
      tr.sec += m.sec
    } else {
      trackAgg.set(e.id, {
        id: e.id,
        name: m.name,
        artist: m.artist,
        cover: m.cover,
        src: m.src,
        plays: 1,
        sec: m.sec,
      })
      if (!seenTracks.has(e.id)) newTracksCount++
    }

    if (m.artist) {
      // Обложка артиста — от его самого заслушанного трека в периоде.
      const tp = trackAgg.get(e.id)!.plays
      // Каждый участник строки считается сам по себе (см. splitArtists), так что
      // совместный трек идёт в зачёт обоим.
      for (const name of splitArtists(m.artist, splitCache)) {
        const k = artistKey(name)
        const a = artistAgg.get(k)
        if (a) {
          a.plays++
          if (m.cover && tp > a.bestPlays) {
            a.cover = m.cover
            a.bestPlays = tp
          }
          a.srcs.set(m.src, (a.srcs.get(m.src) ?? 0) + 1)
        } else {
          artistAgg.set(k, {
            name,
            plays: 1,
            cover: m.cover,
            src: m.src,
            bestPlays: m.cover ? 1 : -1,
            srcs: new Map([[m.src, 1]]),
          })
          if (!seenArtists.has(k)) newArtistKeys.add(k)
        }
      }
    }

    const s = srcAgg.get(m.src)
    if (s) {
      s.plays++
      s.sec += m.sec
    } else {
      srcAgg.set(m.src, { src: m.src, plays: 1, sec: m.sec })
    }

    const dk = dayKey(e.ts)
    dayAgg.set(dk, (dayAgg.get(dk) ?? 0) + 1)
    hours[new Date(e.ts).getHours()]!++
  }

  const topTracks = [...trackAgg.values()].sort((a, b) => b.plays - a.plays || b.sec - a.sec).slice(0, 5)
  const artists = [...artistAgg.values()].map(({ bestPlays: _b, srcs, ...a }) => ({
    ...a,
    src: artistSrc(srcs),
  }))
  const topArtists = [...artists].sort((a, b) => b.plays - a.plays).slice(0, 5)
  const newArtists = artists
    .filter((a) => newArtistKeys.has(artistKey(a.name)))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5)
  const sources = [...srcAgg.values()].sort((a, b) => b.plays - a.plays)

  // Рекордный день.
  let recordDay: WrappedData['recordDay'] = null
  for (const [k, n] of dayAgg) {
    if (recordDay && n <= recordDay.plays) continue
    const [y, mo, d] = k.split('-').map(Number)
    recordDay = { ts: new Date(y!, mo! - 1, d!).getTime(), plays: n }
  }

  // Самая длинная серия дней подряд внутри периода.
  const days = [...dayAgg.keys()].sort()
  let streak = 0
  let run = 0
  let prev = 0
  for (const k of days) {
    const [y, mo, d] = k.split('-').map(Number)
    const ts = new Date(y!, mo! - 1, d!).getTime()
    run = prev && Math.round((ts - prev) / 86_400_000) === 1 ? run + 1 : 1
    prev = ts
    if (run > streak) streak = run
  }

  const peakHour = hours.reduce((best, n, i) => (n > hours[best]! ? i : best), 0)
  const night = hours.slice(0, 6).reduce((s, n) => s + n, 0)

  return {
    range,
    plays,
    uniqueTracks: trackAgg.size,
    uniqueArtists: artistAgg.size,
    sec,
    topTracks,
    topArtists,
    sources,
    newArtists,
    newArtistsCount: newArtistKeys.size,
    newTracksCount,
    recordDay,
    hours,
    peakHour,
    nightShare: plays ? night / plays : 0,
    activeDays: dayAgg.size,
    streak,
  }
}
