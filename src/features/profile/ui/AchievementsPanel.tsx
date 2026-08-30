import { useMemo } from 'react'
import {
  useLibStore,
  useHistoryStore,
  useActivityStore,
  useUsageStore,
} from '@features/library'
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
import { ProfilePanelShell } from './ProfilePanelShell'

/**
 * Боковая шторка «Достижения» (`.spanel`) — бывшая вкладка страницы профиля,
 * теперь порт мобильной `achievements_sheet.dart`: шапка со счётчиком взятых
 * уровней и список карточек в одну колонку.
 *
 * Прогресс считается реактивно из тех же сторов, что и статистика; хранятся
 * только даты разблокировки (`achievementsStore`). Синхронизацию/тосты новых
 * анлоков ведёт глобальный `useAchievementsWatcher` (App) — чтобы достижения
 * приходили в реальном времени, а не только при открытии шторки.
 */

const fmtVal = (n: number, unit: AchUnit): string =>
  unit === 'time' ? fmtDurLong(n) : String(n)

export const AchievementsPanel = () => {
  const loc = useLocale()
  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)
  const log = useActivityStore((s) => s.log)
  const appMs = useUsageStore((s) => s.appMs)
  const unlocked = useAchievementsStore((s) => s.unlocked)

  const list = useMemo(
    () => buildAchievements(buildAchContext({ tracks, entries, log, appMs })),
    [tracks, entries, log, appMs],
  )

  const done = list.reduce((n, a) => n + a.tierReached, 0)
  const total = list.length * TIER_ORDER.length

  return (
    <ProfilePanelShell kind="ach">
      {/* Заголовка у шторки нет — от прежней шапки остался только счётчик
          взятых уровней. */}
      <div className="pach-count"><span className="ppnl-badge">{done}/{total}</span></div>
      <div className="pach-list">
        {list.map((a) => (
          <AchCard key={a.def.id} a={a} unlockedAt={unlocked[tierKey(a.def.id, a.tierReached - 1)]} loc={loc} />
        ))}
      </div>
    </ProfilePanelShell>
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
