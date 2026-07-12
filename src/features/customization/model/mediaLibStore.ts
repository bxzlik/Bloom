import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from '@shared/ui'
import { t } from '@shared/i18n'
import { loadItems, saveItems, type MediaItem } from '../lib/mediaIdb'
import { usePresetsStore } from './presetsStore'
import { useCustomizationStore } from './customizationStore'

/**
 * Библиотека картинок кастомизации.
 * IDB-backed (см. mediaIdb). Источник для контекстов Фон/Обложка/
 * Визуализатор/Курсор и пресетов.
 */

interface MediaLibState {
  items: MediaItem[]
  loaded: boolean
  /** Загрузить из IDB (вызывается bootstrap'ом). */
  load: () => Promise<void>
  /** Добавить файлы (dataURL через FileReader). Соблюдает лимит. */
  addFiles: (files: FileList | File[]) => Promise<void>
  /** Добавить по http(s)-URL. */
  addUrl: (url: string) => void
  /** Гарантировать наличие картинок (dataURL/URL) в библиотеке — при импорте
   *  пресетов. Дедуп по data. Возвращает map `data→id` для всех, что присутствуют
   *  после операции, и число реально добавленных. */
  ensureImages: (images: { data: string; name?: string }[]) => { map: Map<string, string>; added: number }
  /** Удалить по id (с каскадной чисткой ссылок в пресетах/применённом). */
  remove: (id: string) => void
  /** Стереть всю библиотеку загруженных картинок (полностью, как поштучный
   *  remove): если картинка была применена как фон/обложка/курсор — контекст
   *  тоже снимается. */
  clearAll: () => void
  /** Переупорядочить по списку id (drag-reorder). */
  reorder: (ids: string[]) => void
}

const genId = (): string => 'ml' + Date.now() + Math.random().toString(36).slice(2)

export const useMediaLibStore = create<MediaLibState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    const items = await loadItems()
    set({ items, loaded: true })
  },

  addFiles: async (files) => {
    const arr = Array.from(files)
    let items = get().items.slice()
    let added = 0
    for (const f of arr) {
      const data = await new Promise<string | null>((resolve) => {
        const rd = new FileReader()
        rd.onload = (e) => resolve((e.target?.result as string) ?? null)
        rd.onerror = () => resolve(null)
        rd.readAsDataURL(f)
      })
      if (!data) continue
      items = [...items, { id: genId(), name: f.name, data, type: f.type, addedAt: Date.now() }]
      added++
    }
    if (added > 0) {
      set({ items })
      void saveItems(items)
      toast(t('medialib.toast.filesAdded', { n: added }))
    }
  },

  addUrl: (url) => {
    const u = url.trim()
    if (!u || !/^https?:\/\/.+/i.test(u)) {
      toast(t('medialib.toast.badUrl'))
      return
    }
    const items = get().items
    const clean = u.split('?')[0]!.toLowerCase()
    const namePart = u.split('/').pop()?.split('?')[0] || 'image'
    const next = [
      ...items,
      { id: genId(), name: namePart, data: u, type: clean.endsWith('.gif') ? 'image/gif' : 'url', addedAt: Date.now() },
    ]
    set({ items: next })
    void saveItems(next)
    toast(t('medialib.toast.added'))
  },

  ensureImages: (images) => {
    let items = get().items.slice()
    const byData = new Map(items.map((x) => [x.data, x.id]))
    const map = new Map<string, string>()
    let added = 0
    for (const im of images) {
      if (!im.data) continue
      const existing = byData.get(im.data)
      if (existing) {
        map.set(im.data, existing)
        continue
      }
      const isUrl = /^https?:\/\//i.test(im.data)
      const isGif = /^data:image\/gif/i.test(im.data) || /\.gif($|\?)/i.test(im.data)
      const type = isUrl ? (isGif ? 'image/gif' : 'url') : im.data.split(';')[0]?.replace('data:', '') || 'image'
      const id = genId()
      items = [...items, { id, name: im.name || 'preset', data: im.data, type, addedAt: Date.now() }]
      byData.set(im.data, id)
      map.set(im.data, id)
      added++
    }
    if (added > 0) {
      set({ items })
      void saveItems(items)
    }
    return { map, added }
  },

  remove: (id) => {
    const item = get().items.find((x) => x.id === id)
    const next = get().items.filter((x) => x.id !== id)
    set({ items: next })
    void saveItems(next)
    if (!item) return
    // Каскад: убрать ссылки на эту картинку из пресетов и из применённых
    // контекстов. Сторы тянем лениво (циклический импорт безопасен).
    usePresetsStore.getState().purgeImage(id, item.data)
    const c = useCustomizationStore.getState()
    if (c.bgUrl === item.data) c.setBg(null)
    if (c.coverUrl === item.data) c.setCover(null)
    if (c.vizUrl === item.data) c.setViz(null)
    if (c.cursorUrl === item.data) c.setCursor(null)
    if (c.sliderUrl === item.data) c.setSlider(null)
  },

  clearAll: () => {
    const items = get().items
    if (items.length === 0) return
    set({ items: [] })
    void saveItems([])
    // Полный каскад — как в remove(), но для всех разом: чистим ссылки в
    // пресетах и снимаем применённые контексты, если они указывали на
    // удаляемую картинку (это же стирает и копию в _appimg_*).
    const presets = usePresetsStore.getState()
    const c = useCustomizationStore.getState()
    const applied = new Set(items.map((x) => x.data))
    for (const it of items) presets.purgeImage(it.id, it.data)
    if (c.bgUrl && applied.has(c.bgUrl)) c.setBg(null)
    if (c.coverUrl && applied.has(c.coverUrl)) c.setCover(null)
    if (c.vizUrl && applied.has(c.vizUrl)) c.setViz(null)
    if (c.cursorUrl && applied.has(c.cursorUrl)) c.setCursor(null)
    if (c.sliderUrl && applied.has(c.sliderUrl)) c.setSlider(null)
  },

  reorder: (ids) => {
    const byId = new Map(get().items.map((x) => [x.id, x]))
    const next: MediaItem[] = []
    const seen = new Set<string>()
    for (const id of ids) {
      const it = byId.get(id)
      if (it) {
        next.push(it)
        seen.add(id)
      }
    }
    for (const it of get().items) if (!seen.has(it.id)) next.push(it)
    set({ items: next })
    void saveItems(next)
  },
}))

/** Загрузить библиотеку при маунте. Подключается в App. */
export const useMediaLibBootstrap = (): void => {
  useEffect(() => {
    void useMediaLibStore.getState().load().then(() => {
      // Библиотека готова — мигрируем legacy-пресеты (инлайн-данные → id).
      usePresetsStore.getState().migrateInlineToIds()
    })
  }, [])
}
