import { create } from 'zustand'

/**
 * Multi-select tracks в библиотечном tracklist'е. `_sel`/
 * `_selMode`/`_lastSelIdx`.
 *
 * Поведение:
 *   - Plain click → play (через существующий onClick LibTracklist). Если
 *     selMode активен → click переключает выделение, не играет.
 *   - Ctrl/Cmd+click → enterSelMode + toggle (если уже в selMode → toggle).
 *   - Shift+click → range от anchor (lastIdx) до текущего idx.
 *   - При смене libMode / plId / folderPath → сбрасываем (см. LibPage useEffect).
 */
export interface SelectionState {
  /** Множество id выделенных треков. */
  selected: Set<string>
  /** Индекс последнего «опорного» трека (anchor для Shift+range). null если selMode выключен. */
  lastIdx: number | null
  /** Активен ли режим выделения (size>0 ИЛИ только что вошли). */
  selMode: boolean
  /**
   * «Залипший» режим — включён кнопкой редактирования в шапке. Пока он true,
   * selMode держится даже при пустом выделении (иначе шапка мигала бы обратно
   * на «Играть все» после каждой массовой операции).
   */
  sticky: boolean

  /** Войти в режим — добавить id, поставить anchor, включить selMode. */
  enter: (id: string, idx: number) => void
  /** Toggle одного id (Ctrl-click). Anchor обновляется. */
  toggle: (id: string, idx: number) => void
  /** Range-выделение от anchor до idx (Shift-click). Требует список текущих видимых треков. */
  range: (toIdx: number, viewIds: string[]) => void
  /** Выделить все из переданного списка id. */
  selectAll: (ids: string[]) => void
  /** Включить/выключить залипший режим (кнопка «редактировать треки» в шапке). */
  setSticky: (on: boolean) => void
  /** Снять выделение, но остаться в режиме если он залипший (после bulk-операции). */
  deselect: () => void
  /** Очистить выделение + selMode (полный выход, в т.ч. из залипшего). */
  clear: () => void
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selected: new Set(),
  lastIdx: null,
  selMode: false,
  sticky: false,

  enter: (id, idx) => {
    const next = new Set<string>([id])
    set({ selected: next, lastIdx: idx, selMode: true })
  },

  toggle: (id, idx) => {
    const next = new Set(get().selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ selected: next, lastIdx: idx, selMode: get().sticky || next.size > 0 })
  },

  range: (toIdx, viewIds) => {
    const { lastIdx, selected } = get()
    if (lastIdx == null) return
    const a = Math.min(lastIdx, toIdx)
    const b = Math.max(lastIdx, toIdx)
    const next = new Set(selected)
    for (let i = a; i <= b; i++) {
      const id = viewIds[i]
      if (id) next.add(id)
    }
    set({ selected: next, selMode: get().sticky || next.size > 0 })
  },

  selectAll: (ids) => {
    set({ selected: new Set(ids), selMode: get().sticky || ids.length > 0 })
  },

  setSticky: (on) => {
    if (on) set({ sticky: true, selMode: true })
    else set({ selected: new Set(), lastIdx: null, selMode: false, sticky: false })
  },

  deselect: () => {
    set({ selected: new Set(), lastIdx: null, selMode: get().sticky })
  },

  clear: () => {
    set({ selected: new Set(), lastIdx: null, selMode: false, sticky: false })
  },
}))
