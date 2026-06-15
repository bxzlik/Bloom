import { create } from 'zustand'

/**
 * Срок хранения (TTL) для кешируемых данных. Применяется на старте приложения
 * (`useTelemetryBootstrap`): по выбранной политике устаревшие записи удаляются.
 *   never   — не чистить
 *   restart — чистить весь кеш при каждом запуске
 *   <время> — удалять записи старше указанного возраста
 */
export type TtlPolicy = 'never' | 'restart' | '24h' | '3d' | '1w' | '1m'

/** Категории телеметрии/кеша. Пока bloom осмысленно кеширует на диск только тексты. */
export type TeleCategory = 'lyrics'

export interface TtlOption {
  id: TtlPolicy
  label: string
  /** Возраст в секундах для time-based политик (для never/restart — 0). */
  seconds: number
}

export const TTL_OPTIONS: TtlOption[] = [
  { id: 'never', label: 'Никогда', seconds: 0 },
  { id: 'restart', label: 'До перезапуска', seconds: 0 },
  { id: '24h', label: '24 часа', seconds: 86_400 },
  { id: '3d', label: '3 дня', seconds: 259_200 },
  { id: '1w', label: '1 неделя', seconds: 604_800 },
  { id: '1m', label: '1 месяц', seconds: 2_592_000 },
]

export const ttlLabel = (id: TtlPolicy): string =>
  TTL_OPTIONS.find((o) => o.id === id)?.label ?? 'Никогда'

const KEY = 'bloom_tele_ttl'

const DEFAULTS: Record<TeleCategory, TtlPolicy> = {
  lyrics: 'never',
}

const read = (): Record<TeleCategory, TtlPolicy> => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Record<TeleCategory, TtlPolicy>>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export interface TelemetryState {
  ttl: Record<TeleCategory, TtlPolicy>
  setTtl: (cat: TeleCategory, policy: TtlPolicy) => void
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  ttl: read(),
  setTtl: (cat, policy) => {
    const next = { ...get().ttl, [cat]: policy }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
    set({ ttl: next })
  },
}))
