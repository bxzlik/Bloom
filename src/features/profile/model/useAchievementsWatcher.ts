import { useEffect, useRef } from 'react'
import {
  useLibStore,
  useHistoryStore,
  useActivityStore,
  useUsageStore,
} from '@features/library'
import { toast } from '@shared/ui'
import { t } from '@shared/i18n'
import { buildAchContext, buildAchievements, TIER_ORDER } from '../lib/achievements'
import { useAchievementsStore } from './achievementsStore'

/**
 * Глобальный вотчер достижений. Раньше синхронизация/тосты жили ВНУТРИ
 * `AchievementsSection`, из-за чего достижения «получались» только когда
 * пользователь открывал вкладку «Достижения». Теперь этот хук монтируется в
 * `App` и работает всегда: реактивно пересчитывает прогресс из тех же сторов и
 * тостит новые анлоки в реальном времени. Сам расчёт значений остаётся
 * реактивным (`buildAchievements`), персистятся только даты (`achievementsStore`).
 */

const tierLabelKey = { bronze: 'ach.tier.bronze', silver: 'ach.tier.silver', gold: 'ach.tier.gold' } as const

export const useAchievementsWatcher = (): void => {
  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)
  const log = useActivityStore((s) => s.log)
  const appMs = useUsageStore((s) => s.appMs)

  const lastSig = useRef('')
  useEffect(() => {
    // Первый (seeding) прогон должен идти по ПОЛНЫМ данным. `entries`/`log`
    // грузятся синхронно из localStorage, а `tracks` (нужны для listenSec)
    // гидратируются из IDB асинхронно и стартуют пустыми. Сид против пустых
    // tracks занизил бы «Время прослушивания», и подгрузка треков потом
    // «выстрелила» бы пачкой тостов. Поэтому пока не сидировали и есть история,
    // ждём гидрации библиотеки. (Если истории нет — сидировать нечего.)
    if (!useAchievementsStore.getState().seeded && entries.length > 0 && tracks.length === 0) return

    const ctx = buildAchContext({ tracks, entries, log, appMs })
    const list = buildAchievements(ctx)

    const reached: Record<string, number> = {}
    for (const a of list) reached[a.def.id] = a.tierReached
    const sig = JSON.stringify(reached)
    if (sig === lastSig.current) return
    lastSig.current = sig

    const fresh = useAchievementsStore.getState().sync(reached)
    for (const k of fresh) {
      const [id, idxStr] = k.split(':')
      const a = list.find((x) => x.def.id === id)
      if (!a) continue
      const tier = TIER_ORDER[Number(idxStr)]!
      toast(`🏅 ${t('ach.unlocked')} ${t(a.def.nameKey)} — ${t(tierLabelKey[tier])}`)
    }
  }, [tracks, entries, log, appMs])
}
