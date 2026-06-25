import type { TranslationKey } from '@shared/i18n'
import type { Track } from '@entities/track'
import { trackRegistry } from '@entities/track'
import { parseDur } from './formatStats'

/**
 * Движок достижений профиля. Декларативный список `ACHIEVEMENTS`, каждое со
 * списком порогов (`tiers` = bronze/silver/gold) и функцией `value(ctx)`,
 * возвращающей текущее «сырое» значение метрики. Прогресс/тиры считаются из тех
 * же сторов, что и статистика (`buildAchContext`) — ничего нового персистить не
 * нужно (даты разблокировки хранит `achievementsStore`).
 *
 * Паттерн повторяет ачивки кликера (`CLK_ACHIEVEMENTS`): inline-SVG иконка +
 * nameKey/descKey. Здесь добавлены тиры и прогресс-бар.
 */

export type AchTier = 'bronze' | 'silver' | 'gold'
export const TIER_ORDER: AchTier[] = ['bronze', 'silver', 'gold']

/** Единица измерения метрики — влияет только на формат подписи прогресса. */
export type AchUnit = 'count' | 'time'

export interface AchDef {
  id: string
  /** inline-SVG строка (как в кликере), рендерится через dangerouslySetInnerHTML. */
  icon: string
  nameKey: TranslationKey
  descKey: TranslationKey
  unit: AchUnit
  /** Три порога по возрастанию: [bronze, silver, gold]. */
  tiers: [number, number, number]
  /** Текущее значение метрики из контекста. */
  value: (ctx: AchContext) => number
}

/** Данные для вычисления достижений — снимок из всех сторов. */
export interface AchContext {
  totalPlays: number
  listenSec: number
  appSec: number
  /** Текущий стрик — дней подряд с прослушиваниями (с грейсом на сегодня). */
  streak: number
  /** Рекорд прослушиваний за один день. */
  recordDay: number
  /** Всего дней с хотя бы одним прослушиванием. */
  activeDays: number
}

/** Результат расчёта одного достижения для рендера. */
export interface AchProgress {
  def: AchDef
  value: number
  /** Сколько тиров пройдено (0..3). */
  tierReached: number
  /** Достигнутый тир (или null, если ни один). */
  tier: AchTier | null
  /** Порог следующего тира (или null, если всё взято). */
  nextTarget: number | null
  /** 0..1 прогресс к следующему тиру (1, если maxed). */
  ratio: number
  unlocked: boolean
  maxed: boolean
}

const m = (id: string): TranslationKey => `ach.${id}.name` as TranslationKey
const d = (id: string): TranslationKey => `ach.${id}.desc` as TranslationKey

const H = 3600

const SVG = (path: string): string =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`

export const ACHIEVEMENTS: AchDef[] = [
  {
    id: 'listener',
    icon: SVG('<path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5z"/>'),
    nameKey: m('listener'), descKey: d('listener'), unit: 'count',
    tiers: [100, 1000, 10000], value: (c) => c.totalPlays,
  },
  {
    id: 'time',
    icon: SVG('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    nameKey: m('time'), descKey: d('time'), unit: 'time',
    tiers: [10 * H, 100 * H, 500 * H], value: (c) => c.listenSec,
  },
  {
    id: 'streak',
    icon: SVG('<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 002.5 2.5z"/>'),
    nameKey: m('streak'), descKey: d('streak'), unit: 'count',
    tiers: [3, 7, 30], value: (c) => c.streak,
  },
  {
    id: 'marathon',
    icon: SVG('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
    nameKey: m('marathon'), descKey: d('marathon'), unit: 'count',
    tiers: [20, 50, 100], value: (c) => c.recordDay,
  },
  {
    id: 'veteran',
    icon: SVG('<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89L17 22l-5-3-5 3 1.52-9.11"/>'),
    nameKey: m('veteran'), descKey: d('veteran'), unit: 'time',
    tiers: [5 * H, 50 * H, 200 * H], value: (c) => c.appSec,
  },
  {
    id: 'devotee',
    icon: SVG('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    nameKey: m('devotee'), descKey: d('devotee'), unit: 'count',
    tiers: [7, 30, 100], value: (c) => c.activeDays,
  },
]

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Текущий стрик: дни подряд с прослушиваниями. Старт — сегодня; если сегодня
 * ещё не слушали, начинаем со вчера (грейс), чтобы стрик не «обнулялся» в начале
 * дня. Затем идём назад, пока в журнале есть активность.
 */
const computeStreak = (log: Record<string, number>): number => {
  const today = new Date()
  let cursor = new Date(today)
  if (!log[dayKey(today)]) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (log[dayKey(cursor)]) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export interface AchSources {
  tracks: Track[]
  /** История: id → count (из useHistoryStore.entries). */
  entries: { id: string; count?: number }[]
  log: Record<string, number>
  appMs: number
}

/** Собрать контекст достижений из снимка сторов. */
export const buildAchContext = (s: AchSources): AchContext => {
  let totalPlays = 0
  let listenSec = 0
  let recordDay = 0

  const findTrack = (id: string): Track | undefined =>
    s.tracks.find((t) => t.id === id) ?? trackRegistry.get(id)

  for (const e of s.entries) {
    const plays = e.count || 0
    totalPlays += plays
    const t = findTrack(e.id)
    if (t) listenSec += parseDur(t.dur) * plays
  }

  for (const v of Object.values(s.log)) if (v > recordDay) recordDay = v
  const activeDays = Object.values(s.log).filter((v) => v > 0).length

  return {
    totalPlays,
    listenSec,
    appSec: Math.round(s.appMs / 1000),
    streak: computeStreak(s.log),
    recordDay,
    activeDays,
  }
}

/** Посчитать прогресс/тиры для всех достижений из контекста. */
export const buildAchievements = (ctx: AchContext): AchProgress[] =>
  ACHIEVEMENTS.map((def) => {
    const value = def.value(ctx)
    let tierReached = 0
    for (const target of def.tiers) if (value >= target) tierReached++
    const maxed = tierReached >= def.tiers.length
    const nextTarget = maxed ? null : def.tiers[tierReached]!
    const prevTarget = tierReached > 0 ? def.tiers[tierReached - 1]! : 0
    const ratio = maxed
      ? 1
      : Math.max(0, Math.min(1, (value - prevTarget) / (nextTarget! - prevTarget)))
    return {
      def,
      value,
      tierReached,
      tier: tierReached > 0 ? TIER_ORDER[tierReached - 1]! : null,
      nextTarget,
      ratio,
      unlocked: tierReached > 0,
      maxed,
    }
  })
