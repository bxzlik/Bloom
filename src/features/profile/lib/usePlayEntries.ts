import { useMemo, useSyncExternalStore } from 'react'
import { allPlayed, subscribePlayStats, playStatsVersion } from '@/db/playStats'

/**
 * Прослушивания для достижений и карточек профиля: `{id, count}` по полному
 * журналу.
 *
 * Почему не `useHistoryStore.entries`, хотя форма та же. Список «История»
 * теперь учитывает скрытие: убрал строку — она из него ушла. Но скрытие это
 * про список, а не про учёт, и прогресс достижений от него меняться не должен —
 * иначе «прослушал 100 треков» откатывалось бы назад от уборки в истории.
 * Здесь берётся журнал как есть, без отметок скрытия.
 */
export const usePlayEntries = (): { id: string; count: number }[] => {
  // playStats — не стор: подписываемся на его версию (прогрев журнала на старте
  // + каждое зачтённое прослушивание).
  const ver = useSyncExternalStore(subscribePlayStats, playStatsVersion)
  return useMemo(() => allPlayed().map((e) => ({ id: e.id, count: e.plays })), [ver])
}
