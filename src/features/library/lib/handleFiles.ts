import type { Track } from '@entities/track'
import { t as i18nT } from '@shared/i18n'
import { useLibStore } from '../model'
import { idbSaveTrack, idbUpdateMeta, idbDeleteTrack } from './idb'
import { readTags } from './readTags'
import { cascadePurgeTrackRefs } from './cascadePurge'

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|ogg|opus|wav|webm)$/i
export const isAudioFile = (f: File): boolean =>
  f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)

/**
 * Парсинг «Artist - Title» из имени файла.
 */
const parseName = (filename: string): { name: string; artist: string } => {
  const raw = filename.replace(/\.[^.]+$/, '')
  const d = raw.indexOf(' - ')
  if (d > -1) {
    return {
      artist: raw.slice(0, d).trim() || i18nT('common.unknownArtist'),
      name: raw.slice(d + 3).trim() || raw,
    }
  }
  return { name: raw, artist: i18nT('common.unknownArtist') }
}

const genId = (): string =>
  'tr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/**
 * Реестр blob-URL по trackId. При удалении трека / закрытии — освобождаем
 * через URL.revokeObjectURL чтобы не утекала память.
 */
class BlobMgr {
  private urls = new Map<string, string>()

  create(trackId: string, file: Blob): string {
    const prev = this.urls.get(trackId)
    if (prev) URL.revokeObjectURL(prev)
    const url = URL.createObjectURL(file)
    this.urls.set(trackId, url)
    return url
  }

  revoke(trackId: string): void {
    const url = this.urls.get(trackId)
    if (url) {
      URL.revokeObjectURL(url)
      this.urls.delete(trackId)
    }
  }

  has(trackId: string): boolean {
    return this.urls.has(trackId)
  }
}

export const blobMgr = new BlobMgr()

/**
 * Загрузить файлы в библиотеку. с handleFiles из:
 * 1) для каждого файла создаём базовый Track (имя/артист из filename)
 * 2) добавляем в стор сразу (UI отзывчив)
 * 3) сохраняем в IndexedDB (persistence через F5)
 * 4) асинхронно читаем ID3 теги → улучшаем мета (real title/artist/album/cover/dur)
 *    → обновляем стор + IDB
 *
 * Не-аудио файлы пропускаются молча.
 */
export const handleFiles = (files: FileList | File[]): number => {
  const now = Date.now()
  const arr = Array.from(files).filter(isAudioFile)
  if (!arr.length) return 0

  const newTracks: Track[] = arr.map((f) => {
    const id = genId()
    const { name, artist } = parseName(f.name)
    const url = blobMgr.create(id, f)
    return {
      id,
      name,
      artist,
      dur: '—',
      cover: null,
      fav: false,
      addedAt: now,
      genres: [],
      album: '',
      year: '',
      publisher: '',
      url,
    }
  })

  // Загруженные файлы — наверх «Все треки» (любой новый трек добавляется вверх).
  useLibStore.getState().addTracks(newTracks, { prepend: true })

  // Persist + дочитать теги в фоне.
  void Promise.all(
    newTracks.map(async (t, i) => {
      const file = arr[i]
      try {
        await idbSaveTrack(t, file)
      } catch (e) {
        console.warn('idbSaveTrack failed', e)
      }
      try {
        const enriched = await readTags(file)
        if (Object.keys(enriched).length === 0) return
        // Сливаем (теги имеют приоритет над filename-парсингом).
        const updated: Track = { ...t, ...enriched }
        useLibStore.getState().addTracks([updated])
        await idbUpdateMeta(updated)
      } catch (e) {
        console.warn('readTags failed', e)
      }
    }),
  )

  return newTracks.length
}

/**
 * Удалить загруженный трек из библиотеки + IDB. Освобождает blob URL.
 * Не трогает folder_watcher треки (у них нет файла в IDB).
 */
export const deleteUploadedTrack = async (trackId: string): Promise<void> => {
  blobMgr.revoke(trackId)
  useLibStore.getState().removeTrack(trackId)
  // Чистим ссылки из плейлистов/лайков/истории, иначе остаются «висячие» id
  // (счётчики показывают, вид — нет). __bloomFolderTrackRemoved.
  cascadePurgeTrackRefs([trackId])
  try {
    await idbDeleteTrack(trackId)
  } catch (e) {
    console.warn('idbDeleteTrack failed', e)
  }
}
