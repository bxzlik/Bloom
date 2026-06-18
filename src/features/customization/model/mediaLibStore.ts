import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from '@shared/ui'
import { t } from '@shared/i18n'
import { loadItems, saveItems, MEDIA_LIMIT, type MediaItem } from '../lib/mediaIdb'

/**
 * Библиотека картинок кастомизации.
 * IDB-backed (см. mediaIdb). Лимит 50. Источник для контекстов Фон/Обложка/
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
  /** Удалить по id. */
  remove: (id: string) => void
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
      if (items.length >= MEDIA_LIMIT) {
        toast(t('medialib.toast.fileLimit', { n: MEDIA_LIMIT }))
        break
      }
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
    if (items.length >= MEDIA_LIMIT) {
      toast(t('medialib.toast.itemLimit', { n: MEDIA_LIMIT }))
      return
    }
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

  remove: (id) => {
    const next = get().items.filter((x) => x.id !== id)
    set({ items: next })
    void saveItems(next)
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
    void useMediaLibStore.getState().load()
  }, [])
}
