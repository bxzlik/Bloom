import type { Track } from '@entities/track'
import { getProvider, rankMatches, type ScoredMatch } from '@features/providers'
import { usePlaylistStore } from '../model/playlistStore'
import { saveTrackToLibrary } from './saveToLibrary'

/**
 * Перенос плейлиста на другую площадку («конвертер»).
 *
 * Каждый трек ищется на целевой площадке по «название + артист», выдача
 * ранжируется общим матчером (`rankMatches`). Уверенные совпадения
 * подставляются сами, спорные и ненайденные уходят пользователю на ручной
 * выбор в `ConvertModal`. Результат — НОВЫЙ плейлист-копия; исходный не
 * меняется (в отличие от `switchTrackPlatform`, который заменяет запись
 * библиотеки на месте).
 *
 * Порог `AUTO_SCORE` намеренно высокий: на плейлисте из сотни треков ошибка
 * матчера не видна глазами, поэтому лучше отправить сомнительное на ручной
 * выбор, чем молча набрать каверов и «sped up»-версий.
 */

/** Счёт, с которого совпадение считаем достоверным без вопросов. */
const AUTO_SCORE = 0.72
/** Ниже этого кандидат вообще не показывается — это уже другой трек. */
const MIN_CAND_SCORE = 0.28
/** Сколько кандидатов показываем в ручном выборе. */
const CAND_LIMIT = 5
/** Сколько треков ищем одновременно (щадим API площадок). */
const CONCURRENCY = 3

export type ConvertStatus =
  /** Трек уже на целевой площадке — переносить нечего. */
  | 'same'
  /** Найдено уверенно (score ≥ AUTO_SCORE). */
  | 'exact'
  /** Кандидаты есть, но ни один не уверенный — нужен ручной выбор. */
  | 'ambiguous'
  /** Ничего похожего (или площадка ответила ошибкой). */
  | 'notfound'

export interface ConvertItem {
  /** Исходный трек из плейлиста. */
  src: Track
  status: ConvertStatus
  /** Отранжированные кандидаты (пусто для 'same' и 'notfound'). */
  cands: ScoredMatch[]
  /** Площадка ответила ошибкой — отличаем от честного «не нашлось». */
  failed?: boolean
}

/**
 * id площадки трека. Локальная копия `trackProviderId` из плеера: библиотека
 * не должна тянуть `@features/player` в слой lib — play.ts сам импортирует
 * библиотеку, получился бы цикл.
 */
export const trackPlatformId = (t: Track): string =>
  t._ym ? 'yandex' : t._ytm ? 'ytmusic' : t._sc ? 'soundcloud' : 'local'

/**
 * Прогнать треки через поиск на целевой площадке.
 *
 * `onProgress` зовётся после КАЖДОГО трека (готово/всего) — для прогресс-бара.
 * `signal` прерывает скан: уже обработанные элементы возвращаются, остальные
 * не запрашиваются (модалка закрывается — сеть не молотит впустую).
 */
export const scanPlaylistConversion = async (
  tracks: Track[],
  providerId: string,
  opts?: {
    onProgress?: (done: number, total: number) => void
    signal?: AbortSignal
  },
): Promise<ConvertItem[]> => {
  const provider = getProvider(providerId)
  const total = tracks.length
  const out: ConvertItem[] = new Array(total)
  let done = 0
  let cursor = 0

  const runOne = async (i: number): Promise<void> => {
    const src = tracks[i]!
    if (trackPlatformId(src) === providerId) {
      out[i] = { src, status: 'same', cands: [] }
      return
    }
    if (!provider) {
      out[i] = { src, status: 'notfound', cands: [], failed: true }
      return
    }
    let found: Track[] = []
    let failed = false
    try {
      const res = await provider.search(`${src.name} ${src.artist}`.trim(), {
        signal: opts?.signal,
      })
      found = res.tracks ?? []
    } catch {
      failed = true
    }
    // Своя же выдача может вернуть треки с других площадок (локальные и т.п.) —
    // берём только те, что реально с целевой.
    const cands = rankMatches(
      found.filter((t) => trackPlatformId(t) === providerId),
      src,
      { limit: CAND_LIMIT, min: MIN_CAND_SCORE },
    )
    const best = cands[0]
    out[i] = {
      src,
      status: !cands.length ? 'notfound' : best!.score >= AUTO_SCORE ? 'exact' : 'ambiguous',
      cands,
      ...(failed ? { failed: true } : {}),
    }
  }

  // Пул воркеров: порядок результатов сохраняется (пишем по индексу), но
  // запросы идут по CONCURRENCY штук — последовательный скан сотни треков
  // ощущался бы вечностью, а полный параллелизм упирается в лимиты площадок.
  const worker = async (): Promise<void> => {
    for (;;) {
      if (opts?.signal?.aborted) return
      const i = cursor++
      if (i >= total) return
      await runOne(i)
      done++
      opts?.onProgress?.(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker))

  return out.filter(Boolean)
}

/**
 * Создать плейлист-копию из выбранных треков: чужие площадочные треки
 * закрепляются в библиотеке (`saveTrackToLibrary` — снимает temp-флаг и пишет
 * meta в IDB, иначе плейлист сослался бы на треки, живущие только в памяти),
 * затем создаётся плейлист с сохранением порядка.
 */
export const createConvertedPlaylist = (
  name: string,
  tracks: Track[],
  cover?: string,
): { id: string; count: number } => {
  const ids: string[] = []
  for (const t of tracks) {
    // `_ytmTemp` saveTrackToLibrary не снимает (он старше площадки) — чистим тут.
    saveTrackToLibrary(t._ytmTemp ? { ...t, _ytmTemp: false } : t)
    if (!ids.includes(t.id)) ids.push(t.id)
  }
  const pl = usePlaylistStore.getState().createPl(name, undefined, cover)
  usePlaylistStore.getState().reorderPlTracks(pl.id, ids)
  return { id: pl.id, count: ids.length }
}
