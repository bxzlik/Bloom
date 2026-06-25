import { useEffect, useMemo, useRef } from 'react'
import {
  useLibStore,
  useHistoryStore,
  useActivityStore,
  useUsageStore,
} from '@features/library'
import { toast } from '@shared/ui'
import { useT, useLocale, t as tt } from '@shared/i18n'
import { fmtDurLong } from '../lib/formatStats'
import {
  buildAchContext,
  buildAchievements,
  TIER_ORDER,
  type AchProgress,
  type AchUnit,
} from '../lib/achievements'
import { useAchievementsStore, tierKey } from '../model/achievementsStore'

/**
 * Вкладка «Достижения» на странице профиля. Считает прогресс реактивно из тех же
 * сторов, что и статистика, и хранит только даты разблокировки
 * (`achievementsStore`). При появлении новых анлоков — тост (кроме первого
 * seeding-прогона у существующего пользователя).
 */

const tierLabelKey = { bronze: 'ach.tier.bronze', silver: 'ach.tier.silver', gold: 'ach.tier.gold' } as const

const fmtVal = (n: number, unit: AchUnit): string =>
  unit === 'time' ? fmtDurLong(n) : String(n)

export const AchievementsSection = () => {
  const t = useT()
  const loc = useLocale()
  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)
  const log = useActivityStore((s) => s.log)
  const appMs = useUsageStore((s) => s.appMs)
  const unlocked = useAchievementsStore((s) => s.unlocked)
  const sync = useAchievementsStore((s) => s.sync)

  const list = useMemo(() => {
    const ctx = buildAchContext({
      tracks,
      entries,
      log,
      appMs,
    })
    return buildAchievements(ctx)
  }, [tracks, entries, log, appMs])

  const done = list.reduce((n, a) => n + a.tierReached, 0)
  const total = list.length * TIER_ORDER.length

  // Синхронизируем разблокировки и тостим новые. `list` пересчитывается при
  // любом изменении исходных данных — sync сам игнорирует, если нового нет.
  const lastSig = useRef('')
  useEffect(() => {
    const reached: Record<string, number> = {}
    for (const a of list) reached[a.def.id] = a.tierReached
    const sig = JSON.stringify(reached)
    if (sig === lastSig.current) return
    lastSig.current = sig
    const fresh = sync(reached)
    for (const k of fresh) {
      const [id, idxStr] = k.split(':')
      const a = list.find((x) => x.def.id === id)
      if (!a) continue
      const tier = TIER_ORDER[Number(idxStr)]!
      toast(`🏅 ${t('ach.unlocked')} ${t(a.def.nameKey)} — ${t(tierLabelKey[tier])}`)
    }
  }, [list, sync, t])

  return (
    <div className="ach-page">
      <div className="ach-summary">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.48 12.89L17 22l-5-3-5 3 1.52-9.11" /></svg>
        {t('ach.title')}
        <span className="ach-summary-count">{done}/{total}</span>
      </div>

      <div className="ach-grid">
        {list.map((a) => (
          <AchCard key={a.def.id} a={a} unlockedAt={unlocked[tierKey(a.def.id, a.tierReached - 1)]} loc={loc} />
        ))}
      </div>
    </div>
  )
}

const AchCard = ({ a, unlockedAt, loc }: { a: AchProgress; unlockedAt?: number; loc: string }) => {
  const t = useT()
  const cur = fmtVal(a.value, a.def.unit)
  const next = a.maxed ? null : fmtVal(a.nextTarget!, a.def.unit)
  const dateStr = unlockedAt
    ? new Date(unlockedAt).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div className={`ach-card${a.unlocked ? ' on' : ''}${a.maxed ? ' maxed' : ''}`} data-tier={a.tier ?? 'none'}>
      <div className="ach-medal" dangerouslySetInnerHTML={{ __html: a.def.icon }} />
      <div className="ach-info">
        <div className="ach-head">
          <span className="ach-name">{t(a.def.nameKey)}</span>
          {/* Тир-пипсы: сколько уровней взято. */}
          <span className="ach-pips">
            {TIER_ORDER.map((tier, i) => (
              <span key={tier} className={`ach-pip${i < a.tierReached ? ' on' : ''}`} data-tier={tier} />
            ))}
          </span>
        </div>
        <div className="ach-desc">{t(a.def.descKey)}</div>
        <div className="ach-bar"><div className="ach-bar-fill" style={{ width: `${Math.round(a.ratio * 100)}%` }} /></div>
        <div className="ach-meta">
          {a.maxed ? (
            <span className="ach-maxed">{t('ach.max')}</span>
          ) : (
            <span className="ach-progress">{cur} / {next}</span>
          )}
          {dateStr && <span className="ach-date">{tt('ach.unlockedAt', { date: dateStr })}</span>}
        </div>
      </div>
    </div>
  )
}
