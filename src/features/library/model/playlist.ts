/**
 * Плейлист.
 *
 * localStorage 'bloom_playlists' содержит массив этих объектов.
 * Полный набор полей (cover/desc опциональны).
 */
export interface Playlist {
  id: string
  name: string
  /** Track IDs. Порядок сохраняется. */
  trs: string[]
  desc?: string
  /** data URL обложки (сжатая до 300px JPEG через compressCover). */
  cover?: string
  /** SC permalink-источник — для «Обновить треки». */
  scSource?: string
  /** SC user-id источника лайков — для «Обновить треки» плейлиста-лайков. */
  scLikes?: string
}

/** Генератор id: 'pl' + Date.now(). */
export const newPlaylistId = (): string => 'pl' + Date.now().toString(36)
