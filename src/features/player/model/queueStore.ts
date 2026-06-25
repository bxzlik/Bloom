import { create } from 'zustand'

/**
 * Источник очереди (`curSource`).
 * При смене источника UI плеера показывает соответствующий ярлык в `qpSourcePill`.
 *
 * MVP: lib-all / lib-fav / lib-history / playlist:id / folder:path.
 * Позже добавятся: sc:type, ym:type, wave.
 */
export type PlaySource =
  | { kind: 'lib-all' }
  | { kind: 'lib-fav' }
  | { kind: 'lib-history' }
  | { kind: 'playlist'; id: string; name: string; cover?: string | null }
  | { kind: 'folder'; path: string; name: string }
  | { kind: 'sc'; label: string; cover?: string | null; round?: boolean }
  | { kind: 'wave'; label: string }
  /** Одиночный трек, запущенный вне коллекции (клик «играть» в меню/поиске). */
  | { kind: 'single'; name: string; cover?: string | null }
  | null

/**
 * Очередь воспроизведения. Источник правды в main окне; в mirror окнах не
 * используется (там только usePlayerStore через bridge).
 *
 * Соответствует старым глобалам: `queue` (массив id), `qIdx`, `curSource`,
 * `shuffle`, `_origQueue` (запоминается перед shuffle для восстановления).
 *
 * Repeat живёт здесь же, потому что nextTr() читает его при решении wrap-around.
 */
export interface QueueState {
  /** Текущий играющий id (включая когда playing=false — это «выбранный»). */
  curId: string | null
  /**
   * id трека, чей стрим сейчас резолвится/буферизуется (показываем спиннер на
   * обложке строки/плеера). null когда ничего не грузится.
   * `_showCoverLoading`/`_hideCoverLoading`.
   */
  loadingId: string | null
  /** Массив track id'ов (в порядке воспроизведения). */
  queue: string[]
  /** Индекс в queue. -1 если очередь пуста. */
  qIdx: number
  source: PlaySource

  shuffle: boolean
  /** 0 = off, 1 = repeat-all, 2 = repeat-one. */
  repeat: 0 | 1 | 2

  /** Оригинальный порядок до shuffle (чтобы восстановить при отключении). */
  _origQueue: string[] | null

  /** Заменить очередь целиком и выбрать стартовый индекс. */
  setQueue: (queue: string[], qIdx: number, source: PlaySource) => void
  /** Прямо сменить индекс (после nextTr/prevTr API уже решил куда). */
  setQIdx: (qIdx: number) => void
  setCurId: (id: string | null) => void
  /** Пометить/снять трек как «загружается» (спиннер на обложке). */
  setLoadingId: (id: string | null) => void

  /** Включить/выключить shuffle с реорганизацией очереди. */
  toggleShuffle: () => void
  /** off → all → one → off. */
  cycleRepeat: () => void

  /** Очистить очередь, оставив только curId. Используется кнопкой ✕ в qp. */
  clearExceptCurrent: () => void
}

const shuffleInPlace = <T,>(arr: T[]): void => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

export const useQueueStore = create<QueueState>((set, get) => ({
  curId: null,
  loadingId: null,
  queue: [],
  qIdx: -1,
  source: null,
  shuffle: false,
  repeat: 0,
  _origQueue: null,

  setQueue: (queue, qIdx, source) =>
    set({ queue, qIdx, source, _origQueue: null }),
  setQIdx: (qIdx) => set({ qIdx }),
  setCurId: (id) => set({ curId: id }),
  setLoadingId: (id) => set({ loadingId: id }),

  toggleShuffle: () => {
    const { shuffle, queue, qIdx, _origQueue, curId } = get()
    if (!shuffle) {
      if (queue.length <= 1) {
        set({ shuffle: true })
        return
      }
      const orig = [...queue]
      const cur = queue[qIdx] ?? curId
      const rest = queue.filter((_, i) => i !== qIdx)
      shuffleInPlace(rest)
      const newQueue = cur ? [cur, ...rest] : rest
      set({ shuffle: true, queue: newQueue, qIdx: 0, _origQueue: orig })
    } else {
      if (_origQueue) {
        const restored = [..._origQueue]
        const idx = curId ? Math.max(0, restored.indexOf(curId)) : 0
        set({
          shuffle: false,
          queue: restored,
          qIdx: idx,
          _origQueue: null,
        })
      } else {
        set({ shuffle: false })
      }
    }
  },

  cycleRepeat: () => set((s) => ({ repeat: ((s.repeat + 1) % 3) as 0 | 1 | 2 })),

  clearExceptCurrent: () => {
    const { curId } = get()
    if (!curId) return
    set({ queue: [curId], qIdx: 0, _origQueue: null })
  },
}))
