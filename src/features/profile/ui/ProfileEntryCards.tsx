import { useMemo, type ReactNode } from 'react'
import {
  useLibStore,
  useHistoryStore,
  useActivityStore,
  useUsageStore,
} from '@features/library'
import { useWrappedEntries, useWrappedUiStore, periodDatesLabel } from '@features/wrapped'
import { useT, useLocale } from '@shared/i18n'
import { PlaylistCover } from '@shared/ui'
import { Ico, type IconName } from '@shared/ui/icons/solar'
import { fmtDurLong } from '../lib/formatStats'
import { useProfileStats } from '../lib/useProfileStats'
import { buildAchContext, buildAchievements, TIER_ORDER } from '../lib/achievements'
import { useProfilePanelStore, type ProfilePanel } from '../model/profilePanelStore'

/**
 * Два входа под карточкой профиля — «Статистика» и «Достижения» (порт мобильных
 * `_StatsCard` / `_AchCard`). Вкладок с инлайн-секциями больше нет: содержимое
 * открывается боковыми шторками (`StatsPanel` / `AchievementsPanel`), и профиль
 * не растёт вниз на три экрана.
 *
 * Вид карточки мобильный: слева крупное число со значком, справа второе число,
 * у края — плитка 56 (коллаж обложек топа / медаль).
 *
 * Раз в месяц карточка статистики ПОДМЕНЯЕТСЯ входом в итоги прошедшего месяца
 * (`monthTakeover`) — ровно до первого просмотра, потом возвращается на место.
 * Отдельной плашки у месяца нет намеренно: итоги нужны раз в месяц, и ради них
 * не стоит держать в профиле постоянный блок. Пересмотреть их можно кнопкой в
 * самой панели статистики.
 */

const EntryCard = ({
  panel,
  value,
  icon,
  side,
  tile,
}: {
  panel: ProfilePanel
  value: string
  icon: IconName
  side: string
  tile: ReactNode
}) => {
  const open = useProfilePanelStore((s) => s.openPanel)
  return (
    <button className="acc-entry" onClick={() => open(panel)}>
      <span className="acc-entry-val">{value}</span>
      <Ico name={icon} width={16} height={16} className="acc-entry-ico" />
      <span className="acc-entry-side">{side}</span>
      <span className="acc-entry-tile">{tile}</span>
    </button>
  )
}

/**
 * Карточка статистики на время подменена входом в итоги месяца. Оформление то
 * же, что у соседних карточек (`.acc-entry` — прозрачная, одна рамка), чтобы
 * ряд читался единым; от статистики её отличают заголовок, метка «Новое» и
 * капсула «Смотреть».
 */
const MonthTakeoverCard = ({ covers }: { covers: (string | null | undefined)[] }) => {
  const t = useT()
  const loc = useLocale()
  const month = useWrappedEntries().month
  const setOpen = useWrappedUiStore((s) => s.setOpen)
  if (!month) return null
  return (
    <button className="acc-entry acc-entry-wr" onClick={() => setOpen(true, 'month')}>
      <span className="acc-wr-txt">
        <span className="acc-wr-title">
          {t('wrapped.month')}
          <span className="acc-wr-new">{t('wrapped.new')}</span>
        </span>
        <span className="acc-wr-sub">{periodDatesLabel(month.range, loc)}</span>
      </span>
      <span className="acc-wr-cta">{t('wrapped.watch')}</span>
      <span className="acc-entry-tile">
        <PlaylistCover covers={covers} />
      </span>
    </button>
  )
}

export const ProfileEntryCards = () => {
  const stats = useProfileStats()
  const { monthTakeover } = useWrappedEntries()

  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)
  const log = useActivityStore((s) => s.log)
  const appMs = useUsageStore((s) => s.appMs)
  const ach = useMemo(() => {
    const list = buildAchievements(buildAchContext({ tracks, entries, log, appMs }))
    return {
      done: list.reduce((n, a) => n + a.tierReached, 0),
      total: list.length * TIER_ORDER.length,
    }
  }, [tracks, entries, log, appMs])

  return (
    <div className="acc-entries">
      {monthTakeover ? (
        <MonthTakeoverCard covers={stats.topTracks.map((r) => r.track.cover)} />
      ) : (
        <EntryCard
          panel="stats"
          value={String(stats.totalPlays)}
          icon="note"
          side={fmtDurLong(stats.totalSec)}
          tile={<PlaylistCover covers={stats.topTracks.map((r) => r.track.cover)} />}
        />
      )}
      <EntryCard
        panel="ach"
        value={String(ach.done)}
        icon="award"
        side={String(ach.total)}
        // Плитка горит золотом, только когда взято хоть что-то, — как медаль на
        // карточке достижения.
        tile={
          <span className={`acc-entry-medal${ach.done > 0 ? ' on' : ''}`}>
            <Ico name="award" width={28} height={28} />
          </span>
        }
      />
    </div>
  )
}
