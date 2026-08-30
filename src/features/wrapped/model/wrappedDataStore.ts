import { useEffect } from 'react'
import { create } from 'zustand'
import { loadPlayLog } from './playLog'
import { buildWrapped, type WrappedData } from '../lib/aggregate'
import {
  inYearWindow,
  inMonthWindow,
  isPeriodSeen,
  PERIOD_ORDER,
  periodRange,
  type PeriodKind,
} from '../lib/periods'

/**
 * Общие данные «Итогов» на всё приложение.
 *
 * Входов в итоги теперь три, и все они спрашивают одно и то же:
 *   • карточка статистики в профиле — подменяться ли на итоги месяца;
 *   • кнопка «Итоги месяца» в панели статистики — есть ли что открывать;
 *   • плашка итогов года — идёт ли декабрьское окно и есть ли данные.
 * Раньше журнал читал баннер и держал результат у себя; с тремя потребителями
 * это значило бы три чтения IndexedDB и три расхождения. Поэтому чтение и
 * агрегация живут здесь, а компоненты только подписываются.
 */

const dayStamp = (): string => new Date().toDateString()

interface WrappedDataState {
  /** Журнал прочитан хотя бы раз (до этого входов не показываем). */
  ready: boolean
  /** Сутки, на которые посчитаны периоды: приложение может провисеть до 1-го числа. */
  day: string
  data: Partial<Record<PeriodKind, WrappedData>>
  /** Растёт после просмотра — по нему пересчитывается «просмотрено». */
  seenTick: number
  refresh: (force?: boolean) => Promise<void>
  bumpSeen: () => void
}

/** Один общий разбор журнала: параллельные вызовы ждут первый, а не читают заново. */
let inFlight: Promise<void> | null = null

export const useWrappedDataStore = create<WrappedDataState>((set, get) => ({
  ready: false,
  day: '',
  data: {},
  seenTick: 0,

  refresh: async (force = false) => {
    const today = dayStamp()
    if (!force && get().ready && get().day === today) return
    if (inFlight) {
      await inFlight
      return
    }
    const run = (async () => {
      const log = await loadPlayLog()
      const data: Partial<Record<PeriodKind, WrappedData>> = {}
      for (const k of PERIOD_ORDER) {
        const d = buildWrapped(log, periodRange(k))
        // Пусто — итогов не существует: ни подмены карточки, ни кнопки, ни плашки.
        if (d.plays > 0) data[k] = d
      }
      console.debug(
        '[wrapped] событий в журнале:', log.events.length,
        '· с данными:', PERIOD_ORDER.filter((k) => data[k]).map((k) => `${k}=${data[k]!.plays}`).join(' ') || 'нет',
      )
      set({ ready: true, day: today, data })
    })()
    inFlight = run
    try {
      await run
    } finally {
      inFlight = null
    }
  },

  bumpSeen: () => set((s) => ({ seenTick: s.seenTick + 1 })),
}))

export interface WrappedEntries {
  /** Итоги прошедшего месяца — доступны всегда, когда в нём что-то играло. */
  month: WrappedData | null
  /** Итоги года — ТОЛЬКО в декабрьском окне и только если есть данные. */
  year: WrappedData | null
  /**
   * Подменять ли карточку статистики входом в итоги месяца: наступило 1-е число,
   * данные есть, и этот месяц ещё не смотрели. После просмотра карточка
   * возвращается к статистике до следующего месяца.
   */
  monthTakeover: boolean
  /** Год ещё не смотрели — метка «Новое» на плашке. */
  yearUnseen: boolean
}

/**
 * Что показывать входам прямо сейчас. Хук можно звать из скольких угодно мест:
 * лишних чтений журнала не будет (см. `inFlight`), а смена суток при открытом
 * приложении ловится по возврату фокуса — иначе 1-го числа карточка подменилась
 * бы только после перезапуска.
 */
export const useWrappedEntries = (): WrappedEntries => {
  const ready = useWrappedDataStore((s) => s.ready)
  const data = useWrappedDataStore((s) => s.data)
  const seenTick = useWrappedDataStore((s) => s.seenTick)
  const refresh = useWrappedDataStore((s) => s.refresh)

  useEffect(() => {
    void refresh()
    const check = () => void refresh()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [refresh])

  if (!ready) return { month: null, year: null, monthTakeover: false, yearUnseen: false }

  void seenTick // «просмотрено» читается из localStorage — пересчитываем по тику

  const month = data.month ?? null
  const year = inYearWindow() ? data.year ?? null : null

  return {
    month,
    year,
    monthTakeover: !!month && inMonthWindow() && !isPeriodSeen(month.range),
    yearUnseen: !!year && !isPeriodSeen(year.range),
  }
}
