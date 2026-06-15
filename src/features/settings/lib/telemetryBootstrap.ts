import { useEffect } from 'react'
import { clearLyricsCache, purgeLyricsCache } from '@features/lyrics'
import { TTL_OPTIONS, useTelemetryStore, type TtlPolicy } from '../model/telemetryStore'

let _ran = false

/** Применить TTL-политику к дисковому кешу текстов. */
const enforceLyricsTtl = (policy: TtlPolicy): void => {
  if (policy === 'never') return
  if (policy === 'restart') {
    void clearLyricsCache()
    return
  }
  const secs = TTL_OPTIONS.find((o) => o.id === policy)?.seconds ?? 0
  if (secs > 0) void purgeLyricsCache(secs)
}

/**
 * Применяет сроки хранения (TTL) кешируемых данных на старте приложения.
 * Запускается один раз (StrictMode-guard). Сейчас обслуживает только тексты.
 */
export const useTelemetryBootstrap = (): void => {
  useEffect(() => {
    if (_ran) return
    _ran = true
    const { ttl } = useTelemetryStore.getState()
    enforceLyricsTtl(ttl.lyrics)
  }, [])
}
