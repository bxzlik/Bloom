import { create } from 'zustand'

/**
 * Inline-редактирование плейлиста прямо в шапке (`LibContent`-hero), вместо
 * модалки. Любая точка входа (карандаш в шапке, пункт «Изменить» в `PlMenu`
 * из сайдбара/грида) зовёт `startEdit(id)` — обычно вместе с `selectPlaylist(id)`,
 * чтобы открыть страницу плейлиста, — а `LibContent` рендерит inline-форму, когда
 * `editingId` совпадает с текущим открытым плейлистом.
 *
 * `isNew` — плейлист только что создан «мгновенным» созданием (см.
 * `createPlaylistInline`): если пользователь отменит редактирование, а плейлист
 * так и остался пустым, его удаляют как брошенный.
 */
interface PlEditState {
  editingId: string | null
  isNew: boolean
  startEdit: (id: string, isNew?: boolean) => void
  stop: () => void
}

export const usePlEditStore = create<PlEditState>((set) => ({
  editingId: null,
  isNew: false,
  startEdit: (id, isNew = false) => set({ editingId: id, isNew }),
  stop: () => set({ editingId: null, isNew: false }),
}))
