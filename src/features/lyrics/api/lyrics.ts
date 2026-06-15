import { invoke } from '@shared/tauri'
import type { Track } from '@entities/track'
import { useLyricsStore } from '../model/lyricsStore'
import { useGeniusStore } from '../model/geniusStore'

/** "m:ss" / "h:mm:ss" → секунды. 0 если не парсится. */
const parseDur = (dur: string | undefined): number => {
  if (!dur) return 0
  const parts = dur.split(':').map((s) => parseInt(s, 10))
  if (parts.some((n) => Number.isNaN(n))) return 0
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
  return 0
}

/**
 * Запрашивает текст для трека. Бампит requestId в сторе (фильтр устаревших
 * ответов), результат прилетает событием `bloom-lyrics` → applyResult.
 * `LyricsController.load`.
 *
 * @param durSec  длительность в секундах; если 0/undefined — берём из track.dur.
 */
export const requestLyrics = (track: Track, durSec?: number): void => {
  const requestId = useLyricsStore.getState().beginRequest()
  const duration = durSec && durSec > 0 ? Math.round(durSec) : parseDur(track.dur)
  const geniusToken = useGeniusStore.getState().token || undefined
  void invoke('lyrics_request', {
    artist: track.artist || '',
    title: track.name || '',
    duration,
    localPath: track._localPath || undefined,
    geniusToken, // fallback-провайдер текстов (поле в «API-ключи»)
    requestId: String(requestId),
  }).catch((e) => {
    console.warn('[lyrics] request failed', e)
  })
}

/** Очистка дискового кеша текстов. Возвращает кол-во удалённых (если бэк отдаёт). */
export const clearLyricsCache = (): Promise<void> =>
  invoke<void>('lyrics_cache_clear').catch((e) => {
    console.warn('[lyrics] cache clear failed', e)
  })

/** Вкл/выкл дисковый кеш текстов. */
export const setLyricsDiskCache = (enabled: boolean): Promise<void> =>
  invoke<void>('set_lyrics_cache', { enabled }).catch((e) => {
    console.warn('[lyrics] set disk cache failed', e)
  })

export interface LyricsCacheStats {
  count: number
  bytes: number
}

/** Статистика дискового кеша текстов: число записей + суммарный размер в байтах. */
export const lyricsCacheStats = (): Promise<LyricsCacheStats> =>
  invoke<LyricsCacheStats>('lyrics_cache_stats').catch((e) => {
    console.warn('[lyrics] cache stats failed', e)
    return { count: 0, bytes: 0 }
  })

/** Удалить записи кеша текстов старше `maxAgeSecs` секунд. Возвращает число удалённых. */
export const purgeLyricsCache = (maxAgeSecs: number): Promise<number> =>
  invoke<number>('lyrics_cache_purge', { maxAgeSecs }).catch((e) => {
    console.warn('[lyrics] cache purge failed', e)
    return 0
  })
