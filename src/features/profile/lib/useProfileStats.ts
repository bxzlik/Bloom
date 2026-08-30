import { useMemo } from 'react'
import { useLibStore, useHistoryStore, useActivityStore, useUsageStore } from '@features/library'
import { trackRegistry, type Track } from '@entities/track'
import { parseArtists } from '@shared/lib/parseArtists'
import { t as tt } from '@shared/i18n'
import { parseDur } from './formatStats'

/**
 * Общий расчёт статистики профиля. Раньше жил внутри `StatsSection` (её больше
 * нет — статистика уехала в боковую шторку `StatsPanel`), но те же цифры нужны
 * ещё и карточке-входу на странице профиля, поэтому вынесен в хук.
 *
 * Источники — те же сторы: `useHistoryStore` (прослушивания), `useActivityStore`
 * (дневной журнал), `useLibStore.tracks` (библиотека), `useUsageStore` (время в
 * приложении).
 */

const findTrack = (id: string, libTracks: Track[]): Track | undefined =>
  libTracks.find((t) => t.id === id) ?? trackRegistry.get(id)

/**
 * Площадка трека по ПРЕФИКСУ его id (`sc_`/`ym_`/`ytm_`, иначе локальный).
 * Берём из id, а не из флагов `_sc/_ym` объекта Track, чтобы разбивка считалась
 * и для треков, которых уже нет в реестре/библиотеке (после перезапуска треки
 * площадок живут только в памяти). Иначе в «где слушали чаще» оставался только
 * SoundCloud — его треки чаще оседают в библиотеке и потому резолвятся.
 */
const sourceFromId = (id: string): string =>
  id.startsWith('ytm_') ? 'ytmusic'
    : id.startsWith('ym_') ? 'yandex'
      : id.startsWith('sc_') ? 'soundcloud'
        : 'local'

/**
 * Площадка артиста — та, где его слушали чаще всего.
 *
 * Свои файлы в счёт не идут, пока есть хоть одна площадка: у локального артиста
 * страницы нет, а искать его там, где слушали хотя бы раз, — единственный способ
 * на неё попасть. Слушали ТОЛЬКО свои файлы — `local`.
 */
const artistSource = (plays: Map<string, number>): string => {
  let top = ''
  let best = 0
  for (const [src, n] of plays) {
    if (src === 'local' || n <= best) continue
    top = src
    best = n
  }
  return top || 'local'
}

export interface ArtistRow {
  name: string
  plays: number
  /** Обложка лучшего трека артиста — заглушка, пока не подгрузился аватар. */
  cover: string
  /**
   * Где его слушали — по ней и ищем самого артиста: аватар для топа и страница
   * по клику. Иначе у того, кто слушает Яндекс, в любимых исполнителях стояли бы
   * аккаунты SoundCloud.
   */
  source: string
}

export interface ProfileStats {
  /** Треков в библиотеке. */
  libTracks: number
  totalSec: number
  totalPlays: number
  /** Время в приложении, сек. */
  appSec: number
  topTracks: { track: Track; plays: number }[]
  topArtists: ArtistRow[]
  favArtist: string | null
  bySource: { source: string; plays: number; sec: number }[]
  recordDay: number
  recordDateFmt: string
  uniqueTracks: number
  uniqueArtists: number
  avgSec: number
  daySpan: number
  /** Средняя длина трека, «m:ss». */
  avgLenFmt: string
  avgHoursDay: string
  avgTracksDay: string
  /** Дневной журнал активности — для графика/теплокарты. */
  log: Record<string, number>
}

export const useProfileStats = (): ProfileStats => {
  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)
  const log = useActivityStore((s) => s.log)
  const appMs = useUsageStore((s) => s.appMs)

  return useMemo(() => {
    let totalSec = 0
    let totalPlays = 0
    const artistMap = new Map<
      string,
      { count: number; cover: string; bestPlays: number; sources: Map<string, number> }
    >()
    // Разбивка прослушиваний по площадке (Yandex / SoundCloud / …). Считается из
    // той же истории, что и топы — поэтому покрывает и прошлые прослушивания.
    const sourceMap = new Map<string, { plays: number; sec: number }>()
    const trackRows: { track: Track; plays: number }[] = []

    for (const e of entries) {
      const plays = e.count || 0
      totalPlays += plays
      // Разбивку по площадке считаем ВСЕГДА (по префиксу id), даже если сам трек
      // уже не резолвится — иначе теряются все площадки кроме SoundCloud.
      const t = findTrack(e.id, tracks)
      const sec = t ? parseDur(t.dur) * plays : 0
      const src = sourceFromId(e.id)
      const sc = sourceMap.get(src) || { plays: 0, sec: 0 }
      sc.plays += plays
      sc.sec += sec
      sourceMap.set(src, sc)
      // Дальше — топы/время прослушивания: им нужен сам трек.
      if (!t) continue
      totalSec += sec
      if (plays > 0) trackRows.push({ track: t, plays })
      // Строка артиста бывает мультиартистной («reidenshi, Øneheart») — считаем
      // каждого отдельно, иначе в топе стоит склеенное имя, по которому не
      // найдётся ни аватар, ни страница артиста. Совместный трек идёт обоим.
      for (const a of parseArtists(t.artist || tt('common.unknownArtist'))) {
        const cur = artistMap.get(a) || { count: 0, cover: '', bestPlays: -1, sources: new Map<string, number>() }
        cur.count += plays
        if (t.cover && plays > cur.bestPlays) {
          cur.cover = t.cover
          cur.bestPlays = plays
        }
        // Считаем прослушивания по площадкам: по ним потом и выбирается, где
        // этого артиста искать.
        cur.sources.set(src, (cur.sources.get(src) ?? 0) + plays)
        artistMap.set(a, cur)
      }
    }

    const bySource = [...sourceMap.entries()]
      .map(([source, v]) => ({ source, plays: v.plays, sec: v.sec }))
      .filter((s) => s.plays > 0)
      .sort((a, b) => b.plays - a.plays)

    const topTracks = trackRows.sort((a, b) => b.plays - a.plays).slice(0, 10)
    const topArtists: ArtistRow[] = [...artistMap.entries()]
      .filter(([, v]) => v.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, v]) => ({ name, plays: v.count, cover: v.cover, source: artistSource(v.sources) }))
    const favArtist = topArtists.length ? topArtists[0]!.name : null

    const logEntries = Object.entries(log)
    const recordDay = logEntries.length ? Math.max(...logEntries.map(([, v]) => v)) : 0
    const recordDate = recordDay > 0 ? logEntries.sort((a, b) => b[1] - a[1])[0]![0] : null
    const recordDateFmt = recordDate
      ? new Date(recordDate).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
      : ''

    // Доп. метрики: уникальные треки, средняя длина трека и средние за день.
    // Разброс дней — из временных меток истории (первое/последнее прослушивание).
    const uniqueTracks = entries.length
    const uniqueArtists = artistMap.size
    const avgSec = totalPlays > 0 ? Math.round(totalSec / totalPlays) : 0
    let firstTs = Date.now()
    let lastTs = Date.now()
    for (const e of entries) {
      if (e.ts) {
        if (e.ts < firstTs) firstTs = e.ts
        if (e.ts > lastTs) lastTs = e.ts
      }
    }
    const daySpan = Math.max(1, Math.ceil((lastTs - firstTs) / 86400000))

    return {
      libTracks: tracks.length,
      totalSec,
      totalPlays,
      appSec: Math.round(appMs / 1000),
      topTracks,
      topArtists,
      favArtist,
      bySource,
      recordDay,
      recordDateFmt,
      uniqueTracks,
      uniqueArtists,
      avgSec,
      daySpan,
      avgLenFmt: `${Math.floor(avgSec / 60)}:${String(avgSec % 60).padStart(2, '0')}`,
      avgHoursDay: (totalSec / 3600 / daySpan).toFixed(1),
      avgTracksDay: (totalPlays / daySpan).toFixed(1),
      log,
    }
  }, [entries, tracks, log, appMs])
}
