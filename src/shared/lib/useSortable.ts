import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

/**
 * Sortable-хук на pointer events. Поведение:
 * `_spawnGhost` + `_domShiftFlip` + `trReorderStart`/`libUnifiedDragStart`
 *.
 *
 * Ключевая разница с типовыми реализациями: **настоящий DOM insertBefore во
 * время drag** + FLIP-анимация по реальным `getBoundingClientRect()` соседей.
 * Это работает для строк РАЗНОЙ высоты (плейлист с обложкой vs папка) и для
 * списков под scroll'ом — никаких предположений об uniform layout.
 *
 * После pointerup читаем data-sortable-id всех детей контейнера → это финальный
 * порядок, вызываем onReorder.
 *
 * Раздельные `rootProps` / `handleProps`:
 *   - rootProps на корневую строку (для DOM-поиска и opacity-стиля placeholder'а)
 *   - handleProps на конкретный handle (`.trcov` для треков, `.lib-icon` для
 *     non-compact sidebar; всю строку для compact sidebar)
 *
 * Click fallback: handle вызывает `clickAction` если pointerdown→pointerup без
 * пересечения `threshold` ( `_roEnd`: `else if(_ro.pending) playTr()`).
 * pointerdown делает preventDefault+stopPropagation чтобы убить нативный click.
 *
 * НЕ поддерживается (отложено по необходимости):
 *   - Multi-select
 *   - Autoscroll
 *   - Grid-режим (libViewMode==='grid')
 * Поддерживается: pinned-партиционирование через `getGroupRank`.
 */
export interface UseSortableOpts<T> {
  items: T[]
  getId: (item: T) => string
  onReorder: (newIds: string[]) => void
  enabled?: boolean
  /**
   * Раскладка контейнера. `'list'` (по умолчанию) — вертикальный список:
   * вставка по `clientY`, FLIP только по Y. `'grid'` — 2D-сетка: вставка по
   * ближайшей карточке (X+Y, reading-order), FLIP по обеим осям.
   */
  mode?: 'list' | 'grid'
  /** Минимальная дистанция до активации drag (px). По умолчанию 5 (как в). */
  threshold?: number
  /**
   * Multi-drag. Если на
   * pointerdown возвращается массив длиной >1 содержащий drag-id —
   * перетаскивается группа: все строки скрываются (opacity:0), ghost — стек
   * до 3-х клонов с count-badge, drop перемещает группу как блок.
   */
  getDragGroup?: (id: string) => string[] | null
  /**
   * Pinned-партиционирование. Возвращает «ранг группы» элемента: меньший ранг = выше
   * в списке (закреплённые=0, обычные=1). Если задан — drag ограничен своей
   * группой: элемент реордерится только среди равноранговых, не пересекая
   * границу. Дойдя до низа своей группы — встаёт перед первым элементом
   * следующей группы.
   */
  getGroupRank?: (id: string) => number
  /**
   * Доводка клона-ghost'а после создания. Нужно, т.к. ghost
   * живёт в `document.body`, вне grid-контейнера → его дочерние grid-CSS-правила
   * (`width:100%`) не применяются, и обложка схлопывалась бы в дефолтный размер.
   */
  ghostAdjust?: (ghost: HTMLElement, srcRow: HTMLElement) => void
}

export interface SortableItemBindings {
  /** На корневой элемент: data-sortable-id + opacity-стиль когда дерётся. */
  rootProps: {
    'data-sortable-id': string
    style: CSSProperties
  }
  /** На элемент-handle (cover/icon/строка). */
  handleProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
    onClick: (e: ReactMouseEvent<HTMLElement>) => void
    /**
     * Маркер для CSS: `.trcov[data-draggable]{cursor:grab;touch-action:none}`
     * (/src/styles/main.css:1468). Только когда drag реально включён.
     */
    'data-draggable'?: string
  }
}

export interface UseSortableResult {
  containerRef: React.RefObject<HTMLDivElement | null>
  /**
   * @param clickAction Колбэк для click-fallback если drag не активировался.
   *   pointerdown гасит нативный click, поэтому fallback нужен.
   */
  itemProps: (id: string, clickAction?: () => void) => SortableItemBindings
}

interface DragState {
  pending: boolean
  active: boolean
  id: string | null
  /** Колбэк для click-fallback из последнего pointerdown. */
  clickAction: (() => void) | null
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  ghost: HTMLElement | null
  srcRow: HTMLElement | null
  /** Последний clientY для rAF-троттлинга. */
  lastClientY: number
  /** Последний clientX (для grid-режима 2D hit-test). */
  lastClientX: number
  /** id рAF, чтобы отменять при следующем move. */
  raf: number | null
  /**
   * Снимок исходного порядка id'шников (на активации). Используется для
   * сравнения «изменился ли порядок» при коммите.
   */
  originalOrder: string[]
  /** Multi-drag: ids всей группы (включая srcRow.id). null = single. */
  multiIds: string[] | null
  /** Скрытые элементы (в multi-mode = все group rows) — для восстановления. */
  hiddenRows: HTMLElement[]
}

const initialState = (): DragState => ({
  pending: false,
  active: false,
  id: null,
  clickAction: null,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
  ghost: null,
  srcRow: null,
  lastClientY: 0,
  lastClientX: 0,
  raf: null,
  originalOrder: [],
  multiIds: null,
  hiddenRows: [],
})

export const useSortable = <T,>({
  items,
  getId,
  onReorder,
  enabled = true,
  mode = 'list',
  threshold = 5,
  getDragGroup,
  getGroupRank,
  ghostAdjust,
}: UseSortableOpts<T>): UseSortableResult => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<DragState>(initialState())

  // Ref для getGroupRank — onMove мемоизирован и захватывает domShiftFlip из
  // старого рендера; чтение из ref гарантирует свежий pinned-набор.
  const groupRankRef = useRef(getGroupRank)
  groupRankRef.current = getGroupRank
  // Ref для ghostAdjust (та же причина — свежий колбэк без пересоздания onMove).
  const ghostAdjustRef = useRef(ghostAdjust)
  ghostAdjustRef.current = ghostAdjust

  // Текущий список id для сравнения «изменился ли порядок» (актуализируется
  // на каждый рендер; ставим в ref чтобы handlers видели свежее значение без
  // пересоздания через useCallback deps).
  const currentIdsRef = useRef<string[]>([])
  currentIdsRef.current = items.map(getId)

  // ── DOM helpers ──
  const getRowsExcept = (srcRow: HTMLElement): HTMLElement[] => {
    const c = containerRef.current
    if (!c) return []
    return Array.from(c.querySelectorAll<HTMLElement>('[data-sortable-id]')).filter(
      (r) => r !== srcRow,
    )
  }

  /**
   * FLIP-сдвиг через реальный DOM insertBefore +
   * FLIP по реальным rect'ам. Соседи сами «расступаются» в нужное место
   * независимо от их высоты.
   */
  const domShiftFlip = (srcRow: HTMLElement, clientY: number): void => {
    const container = containerRef.current
    if (!container) return
    const others = getRowsExcept(srcRow)
    const beforeTops = others.map((r) => r.getBoundingClientRect().top)

    // Pinned-партиционирование: drag ограничен своей группой. eligible = равноранговые соседи; дойдя до низа своей
    // группы — встаём перед первым элементом следующей группы.
    const rankFn = groupRankRef.current
    const dragRank = rankFn ? rankFn(srcRow.dataset.sortableId ?? '') : 0
    const eligible = rankFn
      ? others.filter((r) => rankFn(r.dataset.sortableId ?? '') === dragRank)
      : others

    let insertBefore: HTMLElement | null = null
    for (let i = 0; i < eligible.length; i++) {
      const r = eligible[i]!
      const top = r.getBoundingClientRect().top
      const h = r.offsetHeight
      if (clientY < top + h / 2) {
        insertBefore = r
        break
      }
    }
    // Не нашли якорь среди своей группы → встаём перед первым элементом группы
    // с бо́льшим рангом (= конец нашей группы). Иначе append в конец списка.
    if (rankFn && !insertBefore) {
      insertBefore = others.find((r) => rankFn(r.dataset.sortableId ?? '') > dragRank) ?? null
    }
    const noChange = insertBefore
      ? srcRow.nextSibling === insertBefore
      : container.lastElementChild === srcRow
    if (noChange) return

    if (insertBefore) container.insertBefore(srcRow, insertBefore)
    else container.appendChild(srcRow)

    // FLIP: инвертированный transform → cancel в следующем кадре с transition.
    others.forEach((row, i) => {
      const dy = beforeTops[i]! - row.getBoundingClientRect().top
      if (Math.abs(dy) < 1) return
      const w = row as HTMLElement & { _flipRaf?: number | null }
      if (w._flipRaf) cancelAnimationFrame(w._flipRaf)
      row.style.transition = 'none'
      row.style.transform = `translateY(${dy}px)`
      w._flipRaf = requestAnimationFrame(() => {
        w._flipRaf = null
        row.style.transition = 'transform 0.18s cubic-bezier(0.2,0,0,1)'
        row.style.transform = ''
      })
    })
  }

  /**
   * Grid-вариант `domShiftFlip`:
   * вставка перед ближайшей карточкой по reading-order (X+Y), FLIP по обеим осям
   * (соседи разъезжаются и по горизонтали, и по вертикали при reflow сетки).
   */
  const gridShiftFlip = (srcRow: HTMLElement, clientX: number, clientY: number): void => {
    const container = containerRef.current
    if (!container) return
    const others = getRowsExcept(srcRow)
    const beforeRects = others.map((r) => r.getBoundingClientRect())

    const rankFn = groupRankRef.current
    const dragRank = rankFn ? rankFn(srcRow.dataset.sortableId ?? '') : 0
    const eligible = rankFn
      ? others.filter((r) => rankFn(r.dataset.sortableId ?? '') === dragRank)
      : others

    // Ближайшая по центру карточка среди равноранговых.
    let best: HTMLElement | null = null
    let bestRect: DOMRect | null = null
    let bestDist = Infinity
    for (const r of eligible) {
      const rect = r.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const d = (clientX - cx) ** 2 + (clientY - cy) ** 2
      if (d < bestDist) {
        bestDist = d
        best = r
        bestRect = rect
      }
    }

    let insertBefore: HTMLElement | null = null
    if (best && bestRect) {
      // Курсор «до» карточки в reading-order: выше её ряда, либо в её ряду левее центра.
      let before: boolean
      if (clientY < bestRect.top) before = true
      else if (clientY > bestRect.bottom) before = false
      else before = clientX < bestRect.left + bestRect.width / 2
      insertBefore = before ? best : (best.nextElementSibling as HTMLElement | null)
      // «После best» могло указать на не-карточку (sys-row/label не имеют id) → append.
      if (insertBefore && !insertBefore.hasAttribute('data-sortable-id')) insertBefore = null
    }
    // Партиционирование: не выходим за границу своей группы.
    // Без этого одиночный закреплённый (нет равноранговых соседей → best=null)
    // улетал бы в самый конец через append. Встаём перед первым элементом
    // группы с бо́льшим рангом (= конец нашей группы).
    if (rankFn && !insertBefore) {
      insertBefore = others.find((r) => rankFn(r.dataset.sortableId ?? '') > dragRank) ?? null
    }

    const noChange = insertBefore
      ? srcRow.nextSibling === insertBefore || insertBefore === srcRow
      : container.lastElementChild === srcRow
    if (noChange) return

    if (insertBefore) container.insertBefore(srcRow, insertBefore)
    else container.appendChild(srcRow)

    // 2D FLIP: инвертируем смещение по обеим осям → отпускаем в следующем кадре.
    others.forEach((row, i) => {
      const b = beforeRects[i]!
      const a = row.getBoundingClientRect()
      const dx = b.left - a.left
      const dy = b.top - a.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      const w = row as HTMLElement & { _flipRaf?: number | null }
      if (w._flipRaf) cancelAnimationFrame(w._flipRaf)
      row.style.transition = 'none'
      row.style.transform = `translate(${dx}px,${dy}px)`
      w._flipRaf = requestAnimationFrame(() => {
        w._flipRaf = null
        row.style.transition = 'transform 0.18s cubic-bezier(0.2,0,0,1)'
        row.style.transform = ''
      })
    })
  }

  const cleanFlip = () => {
    const c = containerRef.current
    if (!c) return
    c.querySelectorAll<HTMLElement>('[data-sortable-id]').forEach((r) => {
      const w = r as HTMLElement & { _flipRaf?: number | null }
      if (w._flipRaf) {
        cancelAnimationFrame(w._flipRaf)
        w._flipRaf = null
      }
      r.style.transition = ''
      r.style.transform = ''
    })
  }

  /**
   * Multi-drag перемещение блока: ищем insertBefore (первая видимая non-group
   * строка под курсором), вытаскиваем все group rows и вставляем перед ней
   * (или в конец). FLIP-анимация выполняется для видимых соседей.
   */
  const domShiftMulti = (clientY: number, hiddenSet: Set<HTMLElement>): void => {
    const container = containerRef.current
    if (!container) return
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-sortable-id]'),
    )
    const visible = rows.filter((r) => !hiddenSet.has(r))
    const beforeTops = visible.map((r) => r.getBoundingClientRect().top)
    let insertBefore: HTMLElement | null = null
    for (let i = 0; i < visible.length; i++) {
      const top = beforeTops[i]!
      const h = visible[i]!.offsetHeight
      if (clientY < top + h / 2) {
        insertBefore = visible[i]!
        break
      }
    }
    // Сохраняем порядок group в текущем DOM (== пользовательский порядок).
    const groupOrdered = rows.filter((r) => hiddenSet.has(r))
    // No-op detection: если группа уже подряд прямо перед insertBefore.
    if (insertBefore && groupOrdered[groupOrdered.length - 1]?.nextSibling === insertBefore) {
      let contiguous = true
      for (let i = 0; i < groupOrdered.length - 1; i++) {
        if (groupOrdered[i]!.nextSibling !== groupOrdered[i + 1]) {
          contiguous = false
          break
        }
      }
      if (contiguous) return
    }
    if (!insertBefore && groupOrdered[groupOrdered.length - 1] === container.lastElementChild) {
      let contiguous = true
      for (let i = 0; i < groupOrdered.length - 1; i++) {
        if (groupOrdered[i]!.nextSibling !== groupOrdered[i + 1]) {
          contiguous = false
          break
        }
      }
      if (contiguous) return
    }
    // Перемещаем группу как блок.
    groupOrdered.forEach((row) => {
      if (insertBefore) container.insertBefore(row, insertBefore)
      else container.appendChild(row)
    })
    // FLIP для видимых соседей.
    visible.forEach((row, i) => {
      const dy = beforeTops[i]! - row.getBoundingClientRect().top
      if (Math.abs(dy) < 1) return
      const w = row as HTMLElement & { _flipRaf?: number | null }
      if (w._flipRaf) cancelAnimationFrame(w._flipRaf)
      row.style.transition = 'none'
      row.style.transform = `translateY(${dy}px)`
      w._flipRaf = requestAnimationFrame(() => {
        w._flipRaf = null
        row.style.transition = 'transform 0.18s cubic-bezier(0.2,0,0,1)'
        row.style.transform = ''
      })
    })
  }

  /** Создаёт стек-ghost из 1-3 клонов group rows + count badge. */
  const buildMultiGhost = (
    groupRows: HTMLElement[],
    count: number,
    rect: DOMRect,
  ): HTMLElement => {
    const wrapper = document.createElement('div')
    wrapper.style.cssText =
      `position:fixed;pointer-events:none;z-index:9999;` +
      `width:${rect.width}px;height:${rect.height}px;top:0;left:0;` +
      `will-change:transform;transform:translate3d(${rect.left}px,${rect.top}px,0);` +
      `overflow:visible;`
    const show = groupRows.slice(0, 3)
    const off = 6
    for (let i = show.length - 1; i >= 0; i--) {
      const clone = show[i]!.cloneNode(true) as HTMLElement
      clone.style.cssText =
        `position:absolute;width:${rect.width}px;height:${rect.height}px;` +
        `top:${i * off}px;left:0;opacity:${1 - i * 0.2};` +
        `box-shadow:0 ${8 + i * 4}px ${24 + i * 8}px rgba(0,0,0,.7);` +
        `border-radius:var(--radius);background:var(--card-solid,var(--card));` +
        `box-sizing:border-box;overflow:hidden;`
      clone.style.setProperty('transition', 'none', 'important')
      wrapper.appendChild(clone)
    }
    const badge = document.createElement('div')
    badge.style.cssText =
      `position:absolute;top:-8px;right:-8px;background:var(--accent);color:var(--accent-text);` +
      `border-radius:50%;width:20px;height:20px;display:flex;align-items:center;` +
      `justify-content:center;font-size:11px;font-weight:700;z-index:10;`
    badge.textContent = String(count)
    wrapper.appendChild(badge)
    return wrapper
  }

  // ── pointer handlers ──

  const onEnd = useCallback(() => {
    const s = stateRef.current
    const wasActive = s.active
    const srcRow = s.srcRow
    const clickAction = s.clickAction

    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onEnd)
    document.removeEventListener('pointercancel', onEnd)
    document.body.style.userSelect = ''
    if (s.raf != null) cancelAnimationFrame(s.raf)
    if (s.ghost) {
      s.ghost.remove()
    }
    cleanFlip()
    // Восстанавливаем placeholder-styles на ВСЕХ скрытых (multi-mode) или
    // только на srcRow (single).
    if (s.hiddenRows.length) {
      for (const r of s.hiddenRows) {
        r.style.opacity = ''
        r.style.pointerEvents = ''
      }
    } else if (srcRow) {
      srcRow.style.opacity = ''
      srcRow.style.pointerEvents = ''
    }

    let commit: string[] | null = null
    if (wasActive && containerRef.current) {
      const finalIds = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>('[data-sortable-id]'),
      ).map((el) => el.dataset.sortableId ?? '')
      const orig = s.originalOrder
      const changed =
        finalIds.length !== orig.length || finalIds.some((id, i) => orig[i] !== id)
      if (changed) commit = finalIds
    }
    const wasPending = s.pending
    stateRef.current = initialState()

    if (commit) onReorder(commit)
    // Click-fallback: pointerdown без активации drag.
    else if (!wasActive && wasPending && clickAction) clickAction()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReorder])

  const onMove = useCallback((e: PointerEvent) => {
    const s = stateRef.current
    if (!s.pending && !s.active) return

    if (!s.active) {
      if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < threshold) return
      // Активация.
      const container = containerRef.current
      if (!container || s.id == null) {
        onEnd()
        return
      }
      const srcRow = container.querySelector<HTMLElement>(
        `[data-sortable-id="${cssEscape(s.id)}"]`,
      )
      if (!srcRow) {
        onEnd()
        return
      }
      const rect = srcRow.getBoundingClientRect()

      // Multi-drag detection: getDragGroup может вернуть массив (включая id).
      const group = getDragGroup?.(s.id) ?? null
      const isMulti = !!(group && group.length > 1 && group.includes(s.id))

      let ghost: HTMLElement
      const hiddenRows: HTMLElement[] = []

      if (isMulti && group) {
        // Собираем все DOM-rows группы в текущем порядке.
        const all = Array.from(
          container.querySelectorAll<HTMLElement>('[data-sortable-id]'),
        )
        const idSet = new Set(group)
        const groupRows = all.filter((r) => idSet.has(r.dataset.sortableId ?? ''))
        // Стек-ghost.
        ghost = buildMultiGhost(groupRows, group.length, rect)
        document.body.appendChild(ghost)
        // Скрываем все group rows.
        for (const r of groupRows) {
          r.style.opacity = '0'
          r.style.pointerEvents = 'none'
          hiddenRows.push(r)
        }
        s.multiIds = group
      } else {
        // Single-mode: клон + фон карточки + радиус +
        // прямоугольная тень + opacity .92. List vs grid отличаются лишь тем, что
        // grid не клипует (`overflow:hidden`) и снимает min-width (`min-width:0`),
        // а после — ресайзит обложку через ghostAdjust (см. ниже).
        ghost = srcRow.cloneNode(true) as HTMLElement
        const ghostBase = `position:fixed;pointer-events:none;z-index:9999;width:${rect.width}px;height:${rect.height}px;top:0;left:0;box-shadow:0 16px 48px rgba(0,0,0,.85),0 4px 16px rgba(0,0,0,.6);opacity:0.92;will-change:transform;background:var(--card-solid,var(--card));border-radius:var(--radius);`
        ghost.style.cssText = mode === 'grid' ? `${ghostBase}min-width:0;` : `${ghostBase}overflow:hidden;`
        // Принудительно отключаем transition с !important — без этого ghost
        // лагает за курсором из-за classed `.tr/.lib-item { transition:.15s }`.
        ghost.style.setProperty('transition', 'none', 'important')
        ghost.style.transform = `translate3d(${rect.left}px,${rect.top}px,0)`
        document.body.appendChild(ghost)
        // Grid: довести размеры обложки клона под реальную ячейку.
        ghostAdjustRef.current?.(ghost, srcRow)
        srcRow.style.opacity = '0'
        srcRow.style.pointerEvents = 'none'
        hiddenRows.push(srcRow)
      }

      s.active = true
      s.pending = false
      s.ghost = ghost
      s.srcRow = srcRow
      s.hiddenRows = hiddenRows
      s.offsetX = s.startX - rect.left
      s.offsetY = s.startY - rect.top
      s.originalOrder = currentIdsRef.current.slice()
      document.body.style.userSelect = 'none'
      e.preventDefault()
      return
    }

    e.preventDefault()
    if (s.ghost) {
      s.ghost.style.transform = `translate3d(${e.clientX - s.offsetX}px,${e.clientY - s.offsetY}px,0)`
    }
    s.lastClientY = e.clientY
    s.lastClientX = e.clientX
    // rAF-троттлинг hover-detection.
    if (s.raf == null) {
      s.raf = requestAnimationFrame(() => {
        s.raf = null
        if (!s.active) return
        if (s.multiIds) {
          const hiddenSet = new Set(s.hiddenRows)
          domShiftMulti(s.lastClientY, hiddenSet)
        } else if (s.srcRow) {
          if (mode === 'grid') gridShiftFlip(s.srcRow, s.lastClientX, s.lastClientY)
          else domShiftFlip(s.srcRow, s.lastClientY)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, onEnd, getDragGroup, mode])

  const itemProps = useCallback(
    (id: string, clickAction?: () => void): SortableItemBindings => ({
      rootProps: {
        'data-sortable-id': id,
        // Style на корне применяется реально через ref в onMove (srcRow.style.opacity).
        // Здесь только cursor — реальный opacity ставится императивно во избежание
        // re-render во время drag'а.
        style: {},
      },
      handleProps: {
        ...(enabled ? { 'data-draggable': '1' } : {}),
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
          if (!enabled) return
          if (e.button !== 0) return
          const s = stateRef.current
          if (s.active || s.pending) return
          // Гасим нативный click.
          e.preventDefault()
          e.stopPropagation()
          s.pending = true
          s.id = id
          s.clickAction = clickAction ?? null
          s.startX = e.clientX
          s.startY = e.clientY
          document.addEventListener('pointermove', onMove, { passive: false })
          document.addEventListener('pointerup', onEnd)
          document.addEventListener('pointercancel', onEnd)
        },
        onClick: (e) => {
          // Не даём click пробулькать к row.onClick — fallback уже отработает
          // через pointerdown→pointerup путь (см. onEnd).
          e.stopPropagation()
        },
      },
    }),
    [enabled, onMove, onEnd],
  )

  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onEnd)
      document.removeEventListener('pointercancel', onEnd)
      document.body.style.userSelect = ''
      const s = stateRef.current
      if (s.raf != null) cancelAnimationFrame(s.raf)
      if (s.ghost) s.ghost.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { containerRef, itemProps }
}

// CSS.escape polyfill для значений в селекторах.
const cssEscape = (s: string): string => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s)
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c)
}
