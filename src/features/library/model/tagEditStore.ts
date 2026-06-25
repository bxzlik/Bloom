import { create } from 'zustand'
import type { Track } from '@entities/track'

/**
 * Глобальный стор редактора тегов (drawer). Нужен там, где редактор должен
 * пережить размонтирование родителя — напр. из BigPicture: клик «редактировать
 * теги» закрывает фуллскрин (BigPicInner размонтируется) и открывает панель,
 * которую держит единый хост `<TagEditorHost/>` в App, а не сам BigPicture.
 */

interface TagEditState {
  track: Track | null
  open: (track: Track) => void
  close: () => void
}

export const useTagEditStore = create<TagEditState>((set) => ({
  track: null,
  open: (track) => set({ track }),
  close: () => set({ track: null }),
}))
