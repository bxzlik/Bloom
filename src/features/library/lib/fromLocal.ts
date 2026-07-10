import { t as i18nT } from '@shared/i18n'
import { localCoverUrl } from '@shared/lib/localFile'
import type { LocalTrackInfo } from '@shared/tauri'
import type { Track } from '@entities/track'

/**
 * Конвертирует LocalTrackInfo (Rust folder_watcher) в унифицированный Track.
 * Одинаково для треков отслеживаемых папок и одиночных файлов.
 *
 * Rust отдаёт пустую строку там, где метаданных нет — подставляем UI-значения.
 */
export const fromLocal = (t: LocalTrackInfo): Track => ({
  id: t.id,
  name: t.name,
  artist: t.artist || i18nT('common.unknownArtist'),
  album: t.album,
  year: t.year,
  publisher: t.publisher,
  genres: t.genres,
  // У одиночных треков папки нет — Rust шлёт пустую строку.
  _folder: t._folder || undefined,
  _localPath: t._localPath,
  dur: t.dur || '—',
  // Байты обложки не гоняем через IPC — <img> заберёт их у bloom-file сам.
  cover: t.hasCover ? localCoverUrl(t._localPath) : null,
})
