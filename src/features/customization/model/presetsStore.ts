import { create } from 'zustand'
import { invoke } from '@shared/tauri'
import { toast } from '@shared/ui'
import { t } from '@shared/i18n'
import { useCustomizationStore } from './customizationStore'
import { useMediaLibStore } from './mediaLibStore'

/**
 * Пресеты кастомизации — снимок 5-ти контекстов {bg, cover, viz, cursor, slider}.
 * localStorage[bloom_presets], лимит 20.
 *
 * Поля пресета хранят **id картинки из медиа-библиотеки** (`ml…`), а не копию
 * данных — чтобы не дублировать base64 в localStorage и чтобы удаление фото из
 * библиотеки сквозь чистило пресеты (см. purgeImage). Резолвер толерантен к
 * legacy/orphan: строка `data:`/`http…` трактуется как инлайн-картинка.
 * Экспорт разворачивает id → данные (файл самодостаточный); импорт кладёт
 * картинки в библиотеку и проставляет id.
 */

export interface Preset {
  id: string
  name: string
  bg: string | null
  cover: string | null
  viz: string | null
  cursor: string | null
  slider: string | null
  ts: number
}

const LS_KEY = 'bloom_presets'

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

const EXPORT_KIND = 'bloom-presets'

const genId = (): string => 'pr' + Date.now() + Math.random().toString(36).slice(2)

/** Имя файла из имени пресета: убираем запрещённые в путях символы. */
const safeFileName = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || 'preset'

/** Поле пресета — инлайн-картинка (legacy/orphan), а не id библиотеки. */
const isInline = (s: string): boolean => /^(data:|https?:\/\/)/i.test(s)

/**
 * Резолвит поле пресета в данные картинки: инлайн → как есть; иначе ищет по id
 * в библиотеке. `null`, если поле пустое или id не найден.
 */
export const resolvePresetImg = (field: string | null, items: { id: string; data: string }[]): string | null => {
  if (!field) return null
  if (isInline(field)) return field
  return items.find((it) => it.id === field)?.data ?? null
}

/** Пресет без единой картинки. */
const isEmptyPreset = (p: Preset): boolean => !p.bg && !p.cover && !p.viz && !p.cursor && !p.slider

/** Записать список пресетов в `.bloompresets` через нативный диалог. Поля id
 *  разворачиваются в данные картинки — чтобы файл был самодостаточным. */
const writePresetsFile = async (presets: Preset[], defaultName: string): Promise<void> => {
  const items = useMediaLibStore.getState().items
  const expanded = presets.map((p) => ({
    ...p,
    bg: resolvePresetImg(p.bg, items),
    cover: resolvePresetImg(p.cover, items),
    viz: resolvePresetImg(p.viz, items),
    cursor: resolvePresetImg(p.cursor, items),
    slider: resolvePresetImg(p.slider, items),
  }))
  const payload = { kind: EXPORT_KIND, version: 1, exportedAt: Date.now(), presets: expanded }
  const content = JSON.stringify(payload, null, 2)
  try {
    const ok = await invoke<boolean>('export_presets_file', { content, defaultName })
    if (ok) toast(t('presets.toast.exported', { n: presets.length }))
  } catch (e) {
    console.warn('export_presets_file failed', e)
    toast(t('presets.toast.exportFail'))
  }
}

interface PresetsState {
  presets: Preset[]
  /** Сохранить текущие выборы как пресет. Возвращает false если нечего/лимит. */
  savePreset: (name: string) => boolean
  applyPreset: (id: string) => void
  deletePreset: (id: string) => void
  /** Выгрузить все пресеты в `.bloompresets` (нативный диалог; картинки встроены). */
  exportPresets: () => Promise<void>
  /** Выгрузить один пресет в `.bloompresets`. */
  exportPreset: (id: string) => Promise<void>
  /** Импорт из `.bloompresets` (нативный диалог): дописать пресеты (с учётом
   *  лимита) + добавить их картинки в медиа-библиотеку. */
  importPresets: () => Promise<void>
  /** Каскад при удалении картинки из библиотеки: обнулить ссылки на неё во всех
   *  пресетах (по id ИЛИ legacy-инлайн data); пустые пресеты удалить. */
  purgeImage: (libId: string, data: string) => void
  /** Миграция legacy-пресетов: инлайн-данные → id, если в библиотеке есть
   *  совпадение по data. Не деструктивно (orphan'ы остаются инлайн). */
  migrateInlineToIds: () => void
}

export const usePresetsStore = create<PresetsState>((set, get) => ({
  presets: load(),

  savePreset: (name) => {
    const c = useCustomizationStore.getState()
    const items = useMediaLibStore.getState().items
    // Применённые данные → id библиотеки (или инлайн, если картинки там нет).
    const ref = (url: string | null): string | null => (url ? items.find((it) => it.data === url)?.id ?? url : null)
    const bg = ref(c.bgUrl)
    const cover = ref(c.coverUrl)
    const viz = ref(c.vizUrl)
    const cursor = ref(c.cursorUrl)
    const slider = ref(c.sliderUrl)
    if (!bg && !cover && !viz && !cursor && !slider) {
      toast(t('presets.toast.noActive'))
      return false
    }
    const nm = name.trim() || t('presets.default')
    const next = [...get().presets, { id: genId(), name: nm, bg, cover, viz, cursor, slider, ts: Date.now() }]
    save(next)
    set({ presets: next })
    toast(t('presets.toast.saved', { name: nm }))
    return true
  },

  applyPreset: (id) => {
    const p = get().presets.find((x) => x.id === id)
    if (!p) return
    const items = useMediaLibStore.getState().items
    const c = useCustomizationStore.getState()
    // Резолвим id → данные и применяем только заданные/найденные контексты.
    const bg = resolvePresetImg(p.bg, items)
    const cover = resolvePresetImg(p.cover, items)
    const viz = resolvePresetImg(p.viz, items)
    const cursor = resolvePresetImg(p.cursor, items)
    const slider = resolvePresetImg(p.slider, items)
    if (bg) c.setBg(bg)
    if (cover) c.setCover(cover)
    if (viz) c.setViz(viz)
    if (cursor) c.setCursor(cursor)
    if (slider) c.setSlider(slider)
    const badges = [p.bg && t('settings.custom.badge.bg'), p.cover && t('settings.custom.badge.cover'), p.viz && t('settings.custom.badge.viz'), p.cursor && t('settings.custom.badge.cursor'), p.slider && t('settings.custom.badge.slider')].filter(Boolean)
    toast(t('presets.toast.applied', { name: p.name, badges: badges.join(', ') }))
  },

  deletePreset: (id) => {
    const next = get().presets.filter((x) => x.id !== id)
    save(next)
    set({ presets: next })
    toast(t('theme.toast.deleted'))
  },

  exportPresets: async () => {
    const presets = get().presets
    if (presets.length === 0) {
      toast(t('presets.toast.exportEmpty'))
      return
    }
    await writePresetsFile(presets, `bloom-presets-${new Date().toISOString().slice(0, 10)}.bloompresets`)
  },

  exportPreset: async (id) => {
    const p = get().presets.find((x) => x.id === id)
    if (!p) return
    await writePresetsFile([p], `${safeFileName(p.name)}.bloompresets`)
  },

  importPresets: async () => {
    let content: string | null
    try {
      content = await invoke<string | null>('import_presets_file')
    } catch (e) {
      console.warn('import_presets_file failed', e)
      toast(t('presets.toast.importBad'))
      return
    }
    if (content == null) return // диалог отменён
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      toast(t('presets.toast.importBad'))
      return
    }
    // Принимаем как обёртку {kind,presets}, так и голый массив пресетов.
    const raw =
      parsed && typeof parsed === 'object' && 'presets' in parsed
        ? (parsed as { presets: unknown }).presets
        : parsed
    if (!Array.isArray(raw)) {
      toast(t('presets.toast.importBad'))
      return
    }
    const valid: Preset[] = []
    for (const x of raw) {
      if (!x || typeof x !== 'object') continue
      const o = x as Record<string, unknown>
      const pick = (k: string): string | null => (typeof o[k] === 'string' ? (o[k] as string) : null)
      const bg = pick('bg')
      const cover = pick('cover')
      const viz = pick('viz')
      const cursor = pick('cursor')
      const slider = pick('slider')
      if (!bg && !cover && !viz && !cursor && !slider) continue
      const nm = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : t('presets.default')
      valid.push({ id: genId(), name: nm, bg, cover, viz, cursor, slider, ts: Date.now() })
    }
    if (valid.length === 0) {
      toast(t('presets.toast.importEmpty'))
      return
    }
    const cur = get().presets
    // Картинки импортированных пресетов — в библиотеку; получаем map data→id.
    const imgs: { data: string; name?: string }[] = []
    for (const p of valid) {
      for (const d of [p.bg, p.cover, p.viz, p.slider, p.cursor]) if (d) imgs.push({ data: d, name: p.name })
    }
    const { map, added } = useMediaLibStore.getState().ensureImages(imgs)
    // Поля файла (данные) → id библиотеки.
    const remap = (f: string | null): string | null => (f ? map.get(f) ?? f : null)
    const remapped = valid.map((p) => ({
      ...p,
      bg: remap(p.bg),
      cover: remap(p.cover),
      viz: remap(p.viz),
      cursor: remap(p.cursor),
      slider: remap(p.slider),
    }))
    const next = [...cur, ...remapped]
    save(next)
    set({ presets: next })
    toast(t('presets.toast.imported', { n: remapped.length }))
    if (added > 0) toast(t('presets.toast.mediaAdded', { m: added }))
  },

  purgeImage: (libId, data) => {
    const cur = get().presets
    let changed = false
    const next: Preset[] = []
    for (const p of cur) {
      const scrub = (f: string | null): string | null => (f === libId || f === data ? null : f)
      const np: Preset = { ...p, bg: scrub(p.bg), cover: scrub(p.cover), viz: scrub(p.viz), cursor: scrub(p.cursor), slider: scrub(p.slider) }
      if (np.bg !== p.bg || np.cover !== p.cover || np.viz !== p.viz || np.cursor !== p.cursor || np.slider !== p.slider) changed = true
      if (isEmptyPreset(np)) {
        changed = true // пустой пресет — удаляем
        continue
      }
      next.push(np)
    }
    if (changed) {
      save(next)
      set({ presets: next })
    }
  },

  migrateInlineToIds: () => {
    const items = useMediaLibStore.getState().items
    if (items.length === 0) return
    const byData = new Map(items.map((it) => [it.data, it.id]))
    const cur = get().presets
    let changed = false
    const next = cur.map((p) => {
      const conv = (f: string | null): string | null => (f && isInline(f) && byData.has(f) ? byData.get(f)! : f)
      const np: Preset = { ...p, bg: conv(p.bg), cover: conv(p.cover), viz: conv(p.viz), cursor: conv(p.cursor), slider: conv(p.slider) }
      if (np.bg !== p.bg || np.cover !== p.cover || np.viz !== p.viz || np.cursor !== p.cursor || np.slider !== p.slider) changed = true
      return np
    })
    if (changed) {
      save(next)
      set({ presets: next })
    }
  },
}))
