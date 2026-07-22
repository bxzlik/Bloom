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
  /**
   * Очередь доиграла до конца: последний трек закончился при выключенном повторе,
   * переходить некуда. Главная кнопка транспорта в этом состоянии показывает
   * «начать заново» вместо play (см. PlayPauseButton). Снимается любым новым
   * запуском трека (`loadPlay`) / перемоткой / сменой очереди.
   */
  queueEnded: boolean
  /** Массив track id'ов (в порядке воспроизведения). */
  queue: string[]
  /** Индекс в queue. -1 если очередь пуста. */
  qIdx: number
  source: PlaySource

  shuffle: boolean
  /**
   * Флаг «умной» перемешки поверх shuffle. Активен только когда shuffle=true.
   * shuffle остаётся источником правды «включена ли перемешка вообще» (Rust
   * mp_state / mirror / tray его читают), а smartShuffle различает вариант.
   */
  smartShuffle: boolean
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
  /** Выставить/снять «очередь доиграла до конца». */
  setQueueEnded: (v: boolean) => void

  /**
   * Прокрутить режим перемешки: off → обычный → умный → off, реорганизуя очередь.
   * `weightFn` (вес трека по истории) нужен для «умного» шага; без неё умный шаг
   * ведёт себя как обычный shuffle.
   */
  cycleShuffle: (weightFn?: (id: string) => number) => void
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

/**
 * Взвешенный shuffle без повторов (Efraimidis–Spirakis): ключ = u^(1/w),
 * где u∈(0,1) случайно, w — вес. Чем больше вес, тем ближе ключ к 1 и тем
 * раньше трек в результате — но порядок всё равно случайный каждый раз.
 */
const weightedShuffle = (
  ids: string[],
  weightFn: (id: string) => number,
): string[] =>
  ids
    .map((id) => {
      const w = Math.max(weightFn(id), 1e-4)
      return { id, key: Math.pow(Math.random(), 1 / w) }
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.id)

type ShuffleMode = 'off' | 'normal' | 'smart'

export const useQueueStore = create<QueueState>((set, get) => ({
  curId: null,
  loadingId: null,
  queueEnded: false,
  queue: [],
  qIdx: -1,
  source: null,
  shuffle: false,
  smartShuffle: false,
  repeat: 0,
  _origQueue: null,

  setQueue: (queue, qIdx, source) =>
    set({ queue, qIdx, source, _origQueue: null, queueEnded: false }),
  setQIdx: (qIdx) => set({ qIdx }),
  setCurId: (id) => set({ curId: id }),
  setLoadingId: (id) => set({ loadingId: id }),
  setQueueEnded: (v) => set({ queueEnded: v }),

  cycleShuffle: (weightFn) => {
    const { shuffle, smartShuffle, queue, qIdx, _origQueue, curId } = get()
    const cur: ShuffleMode = !shuffle ? 'off' : smartShuffle ? 'smart' : 'normal'
    const next: ShuffleMode =
      cur === 'off' ? 'normal' : cur === 'normal' ? 'smart' : 'off'

    // Выключаем — восстанавливаем исходный линейный порядок.
    if (next === 'off') {
      if (_origQueue) {
        const restored = [..._origQueue]
        const idx = curId ? Math.max(0, restored.indexOf(curId)) : 0
        set({
          shuffle: false,
          smartShuffle: false,
          queue: restored,
          qIdx: idx,
          _origQueue: null,
        })
      } else {
        set({ shuffle: false, smartShuffle: false })
      }
      return
    }

    // Включаем/переключаем режим — (пере)собираем перемешанную очередь.
    if (queue.length <= 1) {
      set({ shuffle: true, smartShuffle: next === 'smart' })
      return
    }
    // Базой для перемешки берём исходный линейный порядок (если уже сохранён при
    // переходе normal↔smart), иначе текущую очередь.
    const orig = _origQueue ?? [...queue]
    const curTrack = queue[qIdx] ?? curId
    const rest = orig.filter((id) => id !== curTrack)
    let shuffledRest: string[]
    if (next === 'smart' && weightFn) {
      shuffledRest = weightedShuffle(rest, weightFn)
    } else {
      shuffledRest = [...rest]
      shuffleInPlace(shuffledRest)
    }
    const newQueue = curTrack ? [curTrack, ...shuffledRest] : shuffledRest
    set({
      shuffle: true,
      smartShuffle: next === 'smart',
      queue: newQueue,
      qIdx: 0,
      _origQueue: orig,
    })
  },

  cycleRepeat: () => set((s) => ({ repeat: ((s.repeat + 1) % 3) as 0 | 1 | 2 })),

  clearExceptCurrent: () => {
    const { curId } = get()
    if (!curId) return
    set({ queue: [curId], qIdx: 0, _origQueue: null })
  },
}))
