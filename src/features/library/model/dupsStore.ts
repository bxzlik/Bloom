import { create } from 'zustand'

/**
 * Состояние инлайн-режима «Найти дубли». Не модалка: когда `active`, треклист
 * библиотеки (`LibTracklist`) показывает только дубли выбранного плейлиста,
 * сгруппированные, с пометкой «оставить» и кнопками удаления.
 *
 * `plId === null` — дубли по всей библиотеке; иначе — внутри плейлиста.
 * Включается из PlMenu («Найти дубли»). Авто-выход при уходе с этого плейлиста
 * (см. эффект в LibTracklist).
 */
interface DupsState {
  active: boolean
  /** null = вся библиотека; строка = id плейлиста. */
  plId: string | null
  enter: (plId?: string | null) => void
  exit: () => void
}

export const useDupsStore = create<DupsState>((set) => ({
  active: false,
  plId: null,
  enter: (plId = null) => set({ active: true, plId: plId ?? null }),
  exit: () => set({ active: false, plId: null }),
}))
