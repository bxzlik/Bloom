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
  /** Время создания (ms). У плейлистов старше этого поля берётся из id — см. `plCreatedAt`. */
  createdAt?: number
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

/**
 * Дата создания плейлиста в ms — либо `createdAt`, либо восстановленная из id.
 *
 * Поле появилось позже самого плейлиста, но id всё это время был меткой времени
 * (`newPlaylistId`), так что у заведённых раньше дата всё-таки есть. Значения вне
 * разумного окна (чужой формат id, мусор) отбрасываем — лучше не показать строку,
 * чем показать 1970-й.
 */
export const plCreatedAt = (p: Playlist): number | null => {
  if (p.createdAt && p.createdAt > 0) return p.createdAt
  if (!/^pl[0-9a-z]+$/.test(p.id)) return null
  const ts = parseInt(p.id.slice(2), 36)
  // 2020-01-01 … «завтра»: id-метка из будущего означала бы не время, а что-то ещё.
  if (!Number.isFinite(ts) || ts < 1577836800000 || ts > Date.now() + 86400000) return null
  return ts
}
