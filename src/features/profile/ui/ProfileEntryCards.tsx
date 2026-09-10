import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  useLibStore,
  useActivityStore,
  useUsageStore,
} from '@features/library'
import { useWrappedEntries, useWrappedUiStore, periodDatesLabel } from '@features/wrapped'
import { useT, useLocale } from '@shared/i18n'
import { PlaylistCover } from '@shared/ui'
import { Ico, type IconName } from '@shared/ui/icons/solar'
import { fmtDurLong } from '../lib/formatStats'
import { usePlayEntries } from '../lib/usePlayEntries'
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
 *
 * А всю первую неделю месяца — уже вернувшаяся карточка статистики раз в десять
 * секунд подменяет своё число надписью «Итоги месяца» и обратно (`monthHint`,
 * `SwapValue`): напоминание, что итоги никуда не делись, без второго блока в
 * профиле и без смены того, куда ведёт клик.
 */

/** Сколько висит каждая из двух надписей, пока они сменяют друг друга. */
const SWAP_HOLD_MS = 10_000

/**
 * Левый слот карточки, который раз в `SWAP_HOLD_MS` сменяет число надписью и
 * обратно: уходящее уезжает вверх, приходящее подъезжает снизу (слой обрезан
 * рамкой слота). Оба слоя лежат в одной клетке грида, поэтому ширина слота —
 * по самому широкому из них, и правая половина карточки не дёргается.
 *
 * Первый показ БЕЗ анимации (`moved`): иначе на монтировании второй слой успел
 * бы мигнуть поверх первого, пока играет его «уход».
 */
const SwapValue = ({
  value,
  icon,
  alt,
}: {
  value: string
  icon: IconName
  alt: ReactNode
}) => {
  const [phase, setPhase] = useState(0)
  const [moved, setMoved] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => {
      setMoved(true)
      setPhase((p) => (p === 0 ? 1 : 0))
    }, SWAP_HOLD_MS)
    return () => window.clearInterval(id)
  }, [])
  const cls = (i: number) =>
    `acc-swap-i${moved ? (phase === i ? ' in' : ' out') : phase === i ? ' on' : ''}`
  return (
    <span className="acc-swap">
      <span className={cls(0)} aria-hidden={phase !== 0}>
        <span className="acc-entry-val">{value}</span>
        <Ico name={icon} width={16} height={16} className="acc-entry-ico" />
      </span>
      <span className={cls(1)} aria-hidden={phase !== 1}>
        <span className="acc-entry-val acc-swap-alt">{alt}</span>
      </span>
    </span>
  )
}

const EntryCard = ({
  panel,
  value,
  icon,
  side,
  tile,
  alt,
}: {
  panel: ProfilePanel
  value: string
  icon: IconName
  side: string
  tile: ReactNode
  /** Задан — левый слот чередует число с этой надписью (см. `SwapValue`). */
  alt?: ReactNode
}) => {
  const open = useProfilePanelStore((s) => s.openPanel)
  return (
    <button className="acc-entry" onClick={() => open(panel)}>
      {alt ? (
        <SwapValue value={value} icon={icon} alt={alt} />
      ) : (
        <>
          <span className="acc-entry-val">{value}</span>
          <Ico name={icon} width={16} height={16} className="acc-entry-ico" />
        </>
      )}
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
  const t = useT()
  const stats = useProfileStats()
  const { monthTakeover, monthHint } = useWrappedEntries()

  const tracks = useLibStore((s) => s.tracks)
  const entries = usePlayEntries()
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
          // Первую неделю месяца число чередуется с «Итогами месяца». Карточка
          // при этом остаётся входом в статистику — сами итоги открывает кнопка
          // в её футере: цель клика не должна меняться под курсором.
          alt={monthHint ? t('wrapped.month') : undefined}
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
