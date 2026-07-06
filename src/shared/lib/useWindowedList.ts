import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'

/**
 * Оконная (windowing) виртуализация списка БЕЗ absolute-позиционирования:
 * рендерится только срез [start, end), а высота невидимых частей добирается
 * двумя спейсерами (padTop/padBottom). Строки остаются в нормальном потоке
 * документа — поэтому продолжает работать useSortable (реальный DOM
 * insertBefore во время drag), делегированные hover-обработчики и
 * content-visibility.
 *
 * Высоты не задаются руками: «шаг» строки (высота + margin) замеряется по
 * реальным соседним элементам с data-widx (top(i+1) − top(i)), до замера
 * действует estimate. Для списков с заголовками-группами (история) есть второй
 * тип элемента (getType → 1) со своим замером.
 *
 * Скролл-контейнер: либо сам контейнер списка (containerRef), либо внешний
 * предок (scrollRef) — тогда смещение списка внутри него вычисляется по
 * getBoundingClientRect (актуально для очереди и detail-оверлея).
 *
 * freezeRef: на время активного drag окно замораживается — useSortable
 * двигает DOM-строки императивно, и ре-рендер среза срубил бы placeholder-стили
 * и указатели на строки.
 */
export interface UseWindowedListOpts {
  /** Полное количество элементов списка. */
  count: number
  /** Внешний скролл-контейнер; не задан → скроллится сам контейнер списка. */
  scrollRef?: RefObject<HTMLElement | null>
  /** Оценка «шага» элемента типа 0 до первого замера, px (высота+margin). */
  estimate: number
  /** Тип элемента по индексу (0 — строка, 1 — заголовок). По умолчанию все 0. */
  getType?: (index: number) => 0 | 1
  /** Оценка «шага» элемента типа 1, px. */
  estimate1?: number
  /** Запас строк сверху/снизу за пределами вьюпорта. */
  overscan?: number
  /**
   * true в ref → drag-режим: окно живое, но только дорастает (grow-only, ничего
   * не размонтируется — тащить можно сколь угодно далеко), замер шага
   * приостановлен. Сжатие окна — после дропа (refresh()).
   */
  freezeRef?: RefObject<boolean>
  /**
   * Доп. строки с обеих сторон окна (ref, читается при пересчёте). На время
   * drag списки ставят сюда большой запас и зовут refresh() ДО заморозки —
   * иначе при подскролле во время drag за пределами окна была бы пустота.
   */
  expandRef?: RefObject<number>
}

export interface WindowedList {
  containerRef: RefObject<HTMLDivElement | null>
  /** Первый (включительно) и последний (исключительно) индексы среза. */
  start: number
  end: number
  padTop: number
  padBottom: number
  /** Смещение верха элемента i от верха списка, px. */
  offsetOf: (i: number) => number
  /** Скролл так, чтобы элемент i оказался у верха контейнера. */
  scrollToIndex: (i: number, behavior?: ScrollBehavior) => void
  /** Принудительный пересчёт окна (смена expandRef и т.п.). */
  refresh: () => void
}

const DEFAULT_OVERSCAN = 6
/** Стартовое окно до первого замера layout'а. */
const INITIAL_ROWS = 30

export const useWindowedList = ({
  count,
  scrollRef,
  estimate,
  getType,
  estimate1,
  overscan = DEFAULT_OVERSCAN,
  freezeRef,
  expandRef,
}: UseWindowedListOpts): WindowedList => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: Math.min(count, INITIAL_ROWS),
  })
  // Замеренные «шаги» по типам (null = ещё не замерено, действует estimate).
  const sizesRef = useRef<{ h0: number | null; h1: number | null }>({ h0: null, h1: null })
  // Тик для принудительного пересчёта спейсеров после первого замера.
  const [, setMeasureTick] = useState(0)

  // Свежие пропсы для мемоизированных колбэков.
  const propsRef = useRef({ count, getType, estimate, estimate1, overscan })
  propsRef.current = { count, getType, estimate, estimate1, overscan }

  // Префиксные количества элементов типа 1 (только для двухтиповых списков):
  // t1b[i] = сколько заголовков среди индексов [0, i).
  const type1Before = useMemo(() => {
    if (!getType) return null
    const arr = new Uint32Array(count + 1)
    for (let i = 0; i < count; i++) arr[i + 1] = arr[i]! + (getType(i) === 1 ? 1 : 0)
    return arr
  }, [count, getType])
  const t1bRef = useRef(type1Before)
  t1bRef.current = type1Before

  const stride0 = () => sizesRef.current.h0 ?? propsRef.current.estimate
  const stride1 = () =>
    sizesRef.current.h1 ?? propsRef.current.estimate1 ?? propsRef.current.estimate

  const offsetOf = useCallback((i: number): number => {
    const t1b = t1bRef.current
    const idx = Math.max(0, Math.min(i, propsRef.current.count))
    if (!t1b) return idx * stride0()
    const n1 = t1b[idx]!
    return (idx - n1) * stride0() + n1 * stride1()
  }, [])

  /** Индекс элемента, чей верх ≤ y < верх следующего (clamp по границам). */
  const indexAt = useCallback(
    (y: number): number => {
      const n = propsRef.current.count
      if (n === 0 || y <= 0) return 0
      if (!t1bRef.current) return Math.min(n - 1, Math.floor(y / stride0()))
      // Бинарный поиск по монотонному offsetOf.
      let lo = 0
      let hi = n - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (offsetOf(mid) <= y) lo = mid
        else hi = mid - 1
      }
      return lo
    },
    [offsetOf],
  )

  /** Смещение верха списка относительно scrollTop-координат скролл-элемента. */
  const listTopIn = useCallback(
    (scrollEl: HTMLElement): number => {
      const cont = containerRef.current
      if (!cont || scrollEl === cont) return 0
      return (
        cont.getBoundingClientRect().top -
        scrollEl.getBoundingClientRect().top +
        scrollEl.scrollTop
      )
    },
    [],
  )

  // Предохранитель от каскада: подряд идущие синхронные изменения окна без
  // внешнего события (скролл/резайз) — признак feedback-цикла; обрываем.
  const cascadeRef = useRef(0)

  const compute = useCallback(() => {
    const cont = containerRef.current
    if (!cont) return
    const scrollEl = scrollRef?.current ?? cont
    const n = propsRef.current.count
    // Активный drag: окно живое, но ТОЛЬКО растёт (grow-only) — ничего не
    // размонтируется, перетаскиваемые строки гарантированно остаются в DOM,
    // а императивные перестановки useSortable не рассыпаются. Сжатие — на дропе.
    const frozen = !!freezeRef?.current
    if (n === 0) {
      if (frozen) return
      setRange((r) => (r.start === 0 && r.end === 0 ? r : { start: 0, end: 0 }))
      return
    }
    const viewH = scrollEl.clientHeight
    // Скрытый контейнер (страница не активна) — не трогаем окно.
    if (viewH === 0) return
    const viewTop = scrollEl.scrollTop - listTopIn(scrollEl)
    const ov = propsRef.current.overscan + (expandRef?.current ?? 0)
    const start = Math.max(0, indexAt(viewTop) - ov)
    const end = Math.min(n, indexAt(viewTop + viewH) + 1 + ov)
    setRange((r) => {
      const ns = frozen ? Math.min(r.start, start) : start
      const ne = frozen ? Math.max(r.end, end) : end
      if (r.start === ns && r.end === ne) {
        cascadeRef.current = 0
        return r
      }
      if (cascadeRef.current > 8) return r
      cascadeRef.current += 1
      return { start: ns, end: ne }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, indexAt, listTopIn, freezeRef, expandRef])

  // Смена оценок (плотность строк библиотеки и т.п.) — высоты строк изменились,
  // а размер скролл-контейнера мог остаться прежним: сбрасываем замер вручную.
  useLayoutEffect(() => {
    sizesRef.current = { h0: null, h1: null }
  }, [estimate, estimate1])

  // Пересчёт при каждом рендере (смена count/данных) — дёшево: пара rect-чтений.
  useLayoutEffect(() => {
    compute()
  })

  // Замер реальных «шагов» по отрендеренным соседям с data-widx.
  useLayoutEffect(() => {
    if (freezeRef?.current) return
    const cont = containerRef.current
    if (!cont) return
    const els = cont.querySelectorAll<HTMLElement>('[data-widx]')
    if (els.length < 2) return
    const gt = propsRef.current.getType
    const s = sizesRef.current
    let changed = false
    for (let i = 0; i < els.length - 1; i++) {
      const idx = Number(els[i]!.dataset.widx)
      const t = gt ? gt(idx) : 0
      const key = t === 1 ? 'h1' : 'h0'
      if (s[key] != null) continue
      const h = els[i + 1]!.getBoundingClientRect().top - els[i]!.getBoundingClientRect().top
      if (h > 1) {
        s[key] = h
        changed = true
      }
      if (s.h0 != null && (!gt || s.h1 != null)) break
    }
    if (changed) setMeasureTick((v) => v + 1)
  })

  // Компенсация сдвига при дорастании окна ВВЕРХ: спейсер отдаёт расчётную
  // высоту (шаг × строк), а реально смонтированные строки могут занять чуть
  // другую (content-visibility даёт офскринам intrinsic-размер, дробный зум).
  // Без поправки вьюпорт «телепортирует» — особенно при drag-расширении на
  // 150 строк. Якорь — content-позиция первой отрендеренной строки прошлого
  // коммита; расхождение доводим scrollTop'ом. В drag-режиме (freeze) якорь не
  // трогаем: useSortable двигает строки императивно, позиции ≠ модели.
  const anchorRef = useRef<{ widx: number; top: number } | null>(null)
  const prevStartRef = useRef(0)
  const prevCountRef = useRef(count)
  useLayoutEffect(() => {
    const cont = containerRef.current
    if (!cont) return
    const scrollEl = scrollRef?.current ?? cont
    if (freezeRef?.current) {
      anchorRef.current = null
      prevStartRef.current = range.start
      prevCountRef.current = propsRef.current.count
      return
    }
    const contentTopOf = (el: Element): number =>
      el.getBoundingClientRect().top -
      scrollEl.getBoundingClientRect().top +
      scrollEl.scrollTop
    const a = anchorRef.current
    if (
      a &&
      range.start < prevStartRef.current &&
      propsRef.current.count === prevCountRef.current
    ) {
      const el = cont.querySelector<HTMLElement>(`[data-widx="${a.widx}"]`)
      if (el) {
        const delta = contentTopOf(el) - a.top
        if (Math.abs(delta) > 1) scrollEl.scrollTop += delta
      }
    }
    prevStartRef.current = range.start
    prevCountRef.current = propsRef.current.count
    const first = cont.querySelector<HTMLElement>('[data-widx]')
    anchorRef.current = first
      ? { widx: Number(first.dataset.widx), top: contentTopOf(first) }
      : null
  })

  // Слушатели: scroll (rAF-троттлинг) + ResizeObserver на контейнер и скролл-
  // элемент (появление страницы из display:none, ресайз окна, смена плотности).
  // Подписка сверяется КАЖДЫЙ рендер по identity элементов: контейнер может
  // ремаунтиться (пустое состояние ↔ список), а эффект с deps это пропустил бы.
  const subRef = useRef<{
    scrollEl: HTMLElement
    cont: HTMLElement
    cleanup: () => void
  } | null>(null)
  useLayoutEffect(() => {
    const cont = containerRef.current
    const scrollEl = scrollRef?.current ?? cont
    const sub = subRef.current
    if (sub && sub.scrollEl === scrollEl && sub.cont === cont) return
    sub?.cleanup()
    subRef.current = null
    if (!cont || !scrollEl) return
    // КРИТИЧНО: отключаем scroll anchoring. При скролле вверх окно
    // перестраивается (спейсер ↔ строки), браузер «якорит» видимую строку и
    // сам двигает scrollTop → наш пересчёт окна → снова anchoring → бесконечный
    // цикл setState (Maximum update depth) и падение дерева.
    const prevAnchor = scrollEl.style.overflowAnchor
    scrollEl.style.overflowAnchor = 'none'
    let raf: number | null = null
    const onScroll = () => {
      // Реальное внешнее событие — снимаем предохранитель каскада.
      cascadeRef.current = 0
      if (raf != null) return
      raf = requestAnimationFrame(() => {
        raf = null
        compute()
      })
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(() => {
      // Смена плотности/зума меняет высоты строк — сбрасываем замер.
      sizesRef.current = { h0: null, h1: null }
      cascadeRef.current = 0
      compute()
    })
    ro.observe(scrollEl)
    // Внешний скролл: высоты строк меняют размер контейнера списка, а не
    // скролл-элемента — наблюдаем оба.
    if (cont !== scrollEl) ro.observe(cont)
    subRef.current = {
      scrollEl,
      cont,
      cleanup: () => {
        scrollEl.style.overflowAnchor = prevAnchor
        scrollEl.removeEventListener('scroll', onScroll)
        if (raf != null) cancelAnimationFrame(raf)
        ro.disconnect()
      },
    }
  })
  useEffect(() => () => {
    subRef.current?.cleanup()
    subRef.current = null
  }, [])

  const scrollToIndex = useCallback(
    (i: number, behavior: ScrollBehavior = 'auto') => {
      const cont = containerRef.current
      if (!cont) return
      const scrollEl = scrollRef?.current ?? cont
      scrollEl.scrollTo({ top: listTopIn(scrollEl) + offsetOf(i), behavior })
    },
    [scrollRef, listTopIn, offsetOf],
  )

  const start = Math.min(range.start, count)
  const end = Math.min(range.end, count)
  return {
    containerRef,
    start,
    end,
    padTop: offsetOf(start),
    padBottom: Math.max(0, offsetOf(count) - offsetOf(end)),
    offsetOf,
    scrollToIndex,
    refresh: compute,
  }
}
