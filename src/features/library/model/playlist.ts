/**
 * Плейлист.
 *
 * localStorage 'bloom_playlists' содержит массив этих объектов.
 * Полный набор полей (cover/desc опциональны).
 */

/**
 * Источник «Обновить треки»: внешняя коллекция, привязанная к плейлисту.
 * Их может быть сколько угодно и с разных площадок.
 *
 * - `url` — ссылка на плейлист/альбом/профиль (лайки) любой площадки;
 *   при обновлении резолвится через `resolveUrlAny` (как импорт по ссылке).
 * - `scLikes` — легаси-вариант «лайки SC-пользователя по user-id» (у него нет
 *   сохранённого URL; создавался из «Лайки как плейлист» на странице артиста).
 */
export type PlSourceRef =
  | { kind: 'url'; url: string; title?: string }
  | { kind: 'scLikes'; userId: string; title?: string }

export interface Playlist {
  id: string
  name: string
  /** Track IDs. Порядок сохраняется. */
  trs: string[]
  desc?: string
  /** data URL обложки (сжатая до 300px JPEG через compressCover). */
  cover?: string
  /** Источники «Обновить треки» (несколько, любые площадки). */
  sources?: PlSourceRef[]
  /** @deprecated мигрирует в `sources` при загрузке стора (старый формат). */
  scSource?: string
  /** @deprecated мигрирует в `sources` при загрузке стора (старый формат). */
  scLikes?: string
}

/**
 * Миграция легаси-полей `scSource`/`scLikes` в массив `sources`.
 * Идемпотентна: уже мигрированный плейлист возвращается как есть.
 */
export const migratePlSources = (p: Playlist): Playlist => {
  if (!p.scSource && !p.scLikes) return p
  const sources: PlSourceRef[] = [...(p.sources ?? [])]
  if (p.scSource && !sources.some((s) => s.kind === 'url' && s.url === p.scSource)) {
    sources.push({ kind: 'url', url: p.scSource })
  }
  if (p.scLikes && !sources.some((s) => s.kind === 'scLikes' && s.userId === p.scLikes)) {
    sources.push({ kind: 'scLikes', userId: p.scLikes })
  }
  const { scSource: _s, scLikes: _l, ...rest } = p
  return { ...rest, sources }
}

/** Генератор id: 'pl' + Date.now(). */
export const newPlaylistId = (): string => 'pl' + Date.now().toString(36)
