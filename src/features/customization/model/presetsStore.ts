import { create } from 'zustand'
import { toast } from '@shared/ui'
import { useCustomizationStore } from './customizationStore'

/**
 * Пресеты кастомизации — снимок 4-х
 * контекстов {bg, cover, viz, cursor}. localStorage[bloom_presets], лимит 20.
 * Сохранение берёт текущие выборы из customizationStore; применение —
 * вызывает его сеттеры (только заданные в пресете поля).
 */

export interface Preset {
  id: string
  name: string
  bg: string | null
  cover: string | null
  viz: string | null
  cursor: string | null
  ts: number
}

const LS_KEY = 'bloom_presets'
const MAX = 20

const load = (): Preset[] => {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

const save = (arr: Preset[]): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr))
  } catch {
    /* переполнение — игнор */
  }
}

interface PresetsState {
  presets: Preset[]
  /** Сохранить текущие выборы как пресет. Возвращает false если нечего/лимит. */
  savePreset: (name: string) => boolean
  applyPreset: (id: string) => void
  deletePreset: (id: string) => void
}

export const usePresetsStore = create<PresetsState>((set, get) => ({
  presets: load(),

  savePreset: (name) => {
    const c = useCustomizationStore.getState()
    const bg = c.bgUrl
    const cover = c.coverUrl
    const viz = c.vizUrl
    const cursor = c.cursorUrl
    if (!bg && !cover && !viz && !cursor) {
      toast('Нет активных настроек — выберите фон, обложку, визуализатор или курсор')
      return false
    }
    if (get().presets.length >= MAX) {
      toast(`Достигнут лимит ${MAX} пресетов — удалите старые`)
      return false
    }
    const nm = name.trim() || 'Пресет'
    const next = [...get().presets, { id: 'pr' + Date.now(), name: nm, bg, cover, viz, cursor, ts: Date.now() }]
    save(next)
    set({ presets: next })
    toast(`Пресет «${nm}» сохранён!`)
    return true
  },

  applyPreset: (id) => {
    const p = get().presets.find((x) => x.id === id)
    if (!p) return
    const c = useCustomizationStore.getState()
    // Применяем только заданные в пресете контексты.
    if (p.bg) c.setBg(p.bg)
    if (p.cover) c.setCover(p.cover)
    if (p.viz) c.setViz(p.viz)
    if (p.cursor) c.setCursor(p.cursor)
    const badges = [p.bg && 'Фон', p.cover && 'Обложка', p.viz && 'Визуал', p.cursor && 'Курсор'].filter(Boolean)
    toast(`Пресет «${p.name}» применён (${badges.join(', ')})`)
  },

  deletePreset: (id) => {
    const next = get().presets.filter((x) => x.id !== id)
    save(next)
    set({ presets: next })
    toast('Пресет удалён')
  },
}))
