import { toast } from '@shared/ui'
import { t } from '@shared/i18n'
import { usePlaylistStore } from '../model/playlistStore'
import { usePlAutoStore } from '../model/plAutoStore'
import { refreshPlaylistSilent } from './refreshPlaylist'

/**
 * Авто-обновление плейлистов: пакетный проход по отмеченным плейлистам
 * (`plAutoStore.ids`) + планировщик, который дёргает его по расписанию.
 *
 * Настройки живут в `plAutoStore`, обновление одного плейлиста — в
 * `refreshPlaylistSilent` (без тостов); здесь только выборка целей,
 * последовательный прогон и один сводный тост.
 */

/** Плейлисты, у которых есть привязанные источники — только их можно обновлять. */
export const plAutoCandidates = (): { id: string; name: string; sources: number }[] =>
  usePlaylistStore
    .getState()
    .playlists.filter((p) => (p.sources?.length ?? 0) > 0)
    .map((p) => ({ id: p.id, name: p.name, sources: p.sources?.length ?? 0 }))

/** Отмеченные пользователем цели, пересечённые с реально существующими. */
export const plAutoTargets = (): string[] => {
  const withSources = new Set(plAutoCandidates().map((c) => c.id))
  return usePlAutoStore.getState().ids.filter((id) => withSources.has(id))
}

export interface PlAutoSweepResult {
  /** Всего добавлено новых треков. */
  added: number
  /** В скольких плейлистах что-то появилось. */
  changed: number
  /** Сколько плейлистов не удалось обновить. */
  failed: number
  /** Проход не запускался (нечего обновлять / уже идёт). */
  skipped: boolean
}

// Проход строго один за раз: и таймер, и кнопка «Обновить сейчас» ходят сюда.
let sweeping = false

/**
 * Один проход по всем отмеченным плейлистам (последовательно).
 * `silent` — не показывать тост «нет новых треков» (для фонового расписания:
 * сообщаем только когда реально что-то добавилось).
 */
export const runPlAutoRefresh = async (
  opts: { silent?: boolean } = {},
): Promise<PlAutoSweepResult> => {
  const empty: PlAutoSweepResult = { added: 0, changed: 0, failed: 0, skipped: true }
  if (sweeping) return empty
  const ids = plAutoTargets()
  if (!ids.length) return empty

  sweeping = true
  const st = usePlAutoStore.getState()
  st.setBusy('')
  if (!opts.silent) toast(t('lib.plauto.toast.running', { n: ids.length }))

  let added = 0
  let changed = 0
  let failed = 0
  try {
    for (const id of ids) {
      usePlAutoStore.getState().setBusy(id)
      let res
      try {
        res = await refreshPlaylistSilent(id)
      } catch (e) {
        console.warn('plAutoRefresh: playlist failed', id, e)
        res = { added: 0, err: e, ok: true }
      }
      if (!res.ok) continue // плейлист исчез / потерял источники за время прохода
      if (res.err !== null) {
        failed++
        usePlAutoStore.getState().markRun(id, { at: Date.now(), added: 0, failed: true })
        continue
      }
      added += res.added
      if (res.added) changed++
      usePlAutoStore.getState().markRun(id, { at: Date.now(), added: res.added })
    }
  } finally {
    usePlAutoStore.getState().setBusy(null)
    usePlAutoStore.getState().markSweep()
    sweeping = false
  }

  if (added > 0) {
    toast(t('lib.plauto.toast.added', { n: added, pl: changed }))
  } else if (failed > 0) {
    toast(t('lib.plauto.toast.failed', { n: failed }))
  } else if (!opts.silent) {
    toast(t('toast.refreshNoNew'))
  }
  return { added, changed, failed, skipped: false }
}

// ── Планировщик ────────────────────────────────────────────────────────────

const TICK_MS = 60_000
/** Пауза перед стартовым проходом: провайдеры/авторизация должны подняться. */
const ON_START_DELAY_MS = 12_000

let started = false

/**
 * Запустить фоновое расписание (идемпотентно, только главное окно).
 * Тик раз в минуту: обновляем, если авто включено и период истёк.
 */
export const startPlAutoScheduler = (): void => {
  if (started) return
  started = true

  const due = (): boolean => {
    const s = usePlAutoStore.getState()
    if (!s.enabled || !navigator.onLine) return false
    return Date.now() - s.lastRun >= s.everyMin * 60_000
  }

  const s0 = usePlAutoStore.getState()
  if (s0.enabled && s0.onStart) {
    window.setTimeout(() => {
      if (usePlAutoStore.getState().enabled && navigator.onLine) void runPlAutoRefresh({ silent: true })
    }, ON_START_DELAY_MS)
  }

  window.setInterval(() => {
    if (due()) void runPlAutoRefresh({ silent: true })
  }, TICK_MS)
}
