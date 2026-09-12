import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from '@shared/ui'
import { t } from '@shared/i18n'
import {
  loadUserFonts,
  putUserFont,
  deleteUserFont,
  injectUserFonts,
  readFontFile,
  userFontValue,
  MAX_FONT_BYTES,
  type UserFont,
} from '../lib/userFonts'
import { setUserFontFamilies, DEFAULT_FONT, fontFamilyOf } from '../lib/fonts'
import { useThemeStore } from './themeStore'

/**
 * Свои шрифты пользователя (см. lib/userFonts.ts — там хранилище и @font-face).
 * Стор держит список и держит в актуальном состоянии две вещи за его пределами:
 * тег со стилями и реестр семейств в fonts.ts (его спрашивает normalizeFont).
 */

interface UserFontsState {
  items: UserFont[]
  loaded: boolean
  /** Поднять из IDB и вписать @font-face (вызывает bootstrap). */
  load: () => Promise<void>
  /** Загрузить файлы шрифтов. Не подошедшие — с объяснением в тосте. */
  addFiles: (files: FileList | File[]) => Promise<void>
  /** Удалить шрифт; если он был выбран — интерфейс возвращается на Inter. */
  remove: (id: string) => Promise<void>
}

const sync = (items: UserFont[]): void => {
  injectUserFonts(items)
  setUserFontFamilies(items.map((f) => f.family))
}

export const useUserFontsStore = create<UserFontsState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    const items = await loadUserFonts()
    sync(items)
    set({ items, loaded: true })
  },

  addFiles: async (files) => {
    const arr = Array.from(files)
    if (arr.length === 0) return
    let items = get().items.slice()
    let added = 0
    let last: UserFont | null = null
    const errs = new Set<'format' | 'size' | 'read'>()
    for (const f of arr) {
      const res = await readFontFile(f)
      if ('err' in res) {
        errs.add(res.err)
        continue
      }
      // Тот же файл во второй раз — не плодим одинаковые плитки, просто
      // считаем уже загруженный шрифт «последним» (его и применим).
      const dup = items.find((x) => x.name === res.font.name && x.bytes === res.font.bytes)
      if (dup) {
        if (arr.length === 1) useThemeStore.getState().setFontFamily(userFontValue(dup.family))
        continue
      }
      items = [...items, res.font]
      last = res.font
      added++
      await putUserFont(res.font, items)
    }
    if (added > 0) {
      sync(items)
      set({ items })
      // Один файл — сразу применяем: человек грузил шрифт, чтобы им пользоваться.
      if (added === 1 && last) useThemeStore.getState().setFontFamily(userFontValue(last.family))
      else toast(t('settings.interface.font.toast.added', { n: added }))
    }
    if (errs.has('format')) toast(t('settings.interface.font.toast.badFormat'))
    if (errs.has('size')) toast(t('settings.interface.font.toast.tooBig', { mb: Math.round(MAX_FONT_BYTES / 1024 / 1024) }))
    if (errs.has('read')) toast(t('settings.interface.font.toast.readErr'))
  },

  remove: async (id) => {
    const font = get().items.find((f) => f.id === id)
    if (!font) return
    const items = get().items.filter((f) => f.id !== id)
    sync(items)
    set({ items })
    await deleteUserFont(id, items)
    // Удалён выбранный — вернуть Inter: иначе интерфейс молча уехал бы на
    // случайный запасной шрифт из стека.
    const theme = useThemeStore.getState()
    if (fontFamilyOf(theme.fontFamily) === font.family) theme.setFontFamily(DEFAULT_FONT)
  },
}))

/** Поднять свои шрифты при старте. Подключается в App. */
export const useUserFontsBootstrap = (): void => {
  useEffect(() => {
    void useUserFontsStore.getState().load()
  }, [])
}
