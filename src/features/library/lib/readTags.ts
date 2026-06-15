import { parseBlob } from 'music-metadata'
import type { Track } from '@entities/track'
import { compressCover } from './compressCover'

/**
 * Читает ID3/Vorbis/M4A теги через `music-metadata` и возвращает частичный
 * Track с заполненными name/artist/album/year/publisher/genres/dur/cover.
 * Поля без данных в тегах остаются undefined — вызывающая сторона делает
 * merge с исходным треком (с уже выставленными по filename name/artist).
 *
 * При ошибке возвращает пустой объект — трек просто не получит улучшений.
 */
export const readTags = async (file: Blob): Promise<Partial<Track>> => {
  try {
    const meta = await parseBlob(file)
    const c = meta.common
    const result: Partial<Track> = {}

    if (c.title) result.name = c.title
    if (c.artist) result.artist = c.artist
    else if (c.artists?.length) result.artist = c.artists.join(', ')
    if (c.album) result.album = c.album
    if (c.year) result.year = String(c.year)
    if (c.label?.length) result.publisher = c.label[0]
    if (c.genre?.length) result.genres = c.genre

    const dur = meta.format.duration
    if (dur && dur > 0) {
      const total = Math.floor(dur)
      const m = Math.floor(total / 60)
      const s = total % 60
      result.dur = `${m}:${String(s).padStart(2, '0')}`
    }

    const pic = c.picture?.[0]
    if (pic && pic.data) {
      const blob = new Blob([pic.data as Uint8Array], {
        type: pic.format || 'image/jpeg',
      })
      try {
        result.cover = await compressCover(blob)
      } catch {
        // Если canvas/Image не справились — оставляем без обложки.
      }
    }

    return result
  } catch {
    return {}
  }
}
