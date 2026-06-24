import { create } from 'zustand'

/**
 * Реальное время, проведённое в приложении (wall-clock). В отличие от
 * «Времени прослушивания» в статистике (оценка = Σ длительность × прослушивания),
 * здесь копятся фактические миллисекунды, пока окно приложения открыто —
 * счётчик «сколько времени вы провели в Bloom».
 *
 * Механика — heartbeat (`startUsageTracking`): раз в `HEARTBEAT_MS` берём дельту
 * реального времени с прошлого тика и прибавляем. Дельта ограничена
 * `MAX_DELTA_MS`, чтобы НЕ засчитывать «провалы» (сон системы, заморозка таймеров
 * фоновой вкладки на часы) как время в приложении. При сворачивании в трей вебвью
 * троттлит таймеры до ~1/мин — дельта ≈ 60с укладывается в лимит и засчитывается.
 *
 * Данные копятся с момента появления фичи (за прошлое — 0).
 */

const LS_KEY = 'bloom_usage'

const load = (): number => {
  try {
    const v = Number(JSON.parse(localStorage.getItem(LS_KEY) || '0'))
    return Number.isFinite(v) && v >= 0 ? v : 0
  } catch {
    return 0
  }
}

const save = (ms: number): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Math.round(ms)))
  } catch {
    // localStorage переполнен — игнорируем
  }
}

interface UsageState {
  /** Суммарное время в приложении, миллисекунды. */
  appMs: number
  /** Прибавить отрезок реального времени (из heartbeat). */
  add: (ms: number) => void
  /** Сбросить счётчик (часть «очистить статистику»). */
  clear: () => void
}

export const useUsageStore = create<UsageState>((set, get) => ({
  appMs: load(),
  add: (ms) => {
    const next = get().appMs + ms
    save(next)
    set({ appMs: next })
  },
  clear: () => {
    save(0)
    set({ appMs: 0 })
  },
}))

const HEARTBEAT_MS = 20000
/** Дельта больше лимита = провал (сон/заморозка) — не засчитываем. */
const MAX_DELTA_MS = 90000

let _started = false
let _lastBeat = 0

/**
 * Запустить учёт времени в приложении. Идемпотентно (singleton), вызывается один
 * раз из App. Считаем реальную дельту между тиками (а не фиксированный шаг), чтобы
 * не зависеть от точности setInterval; добиваем недосчитанный хвост на закрытии.
 */
export const startUsageTracking = (): void => {
  if (_started || typeof window === 'undefined') return
  _started = true
  _lastBeat = Date.now()
  const beat = (): void => {
    const now = Date.now()
    const delta = now - _lastBeat
    _lastBeat = now
    if (delta > 0 && delta < MAX_DELTA_MS) useUsageStore.getState().add(delta)
  }
  setInterval(beat, HEARTBEAT_MS)
  window.addEventListener('beforeunload', beat)
}
