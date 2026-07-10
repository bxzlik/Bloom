import { t as i18nT } from '@shared/i18n'
import { toast } from '@shared/ui'
import { useLibStore } from '../model'
import { idbDeleteTrack } from './idb'
import { cascadePurgeTrackRefs } from './cascadePurge'
import { fromLocal } from './fromLocal'
import { fileAdd, fileRemove } from '../api'

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
 * Импорт одиночных треков — плюсик в «Все треки» и перетаскивание в окно.
 *
 * Работает так же, как папки: Rust запоминает путь к файлу (в режиме «В Bloom»
 * сперва копирует его к себе), читает теги через lofty и отдаёт готовые треки.
 * Байты через IPC не гоняются, в IndexedDB ничего не кладётся.
 *
 * `paths` не задан — откроется системный диалог выбора файлов.
 * Возвращает число реально добавленных треков (дубли и не-аудио Rust отсеет).
 */
export const importTracks = async (paths?: string[]): Promise<number> => {
  const added = await fileAdd(paths)
  if (added === null) return 0 // диалог отменили
  if (!added.length) {
    // Файлы выбрали, но ничего не добавилось — объясняем, иначе клик выглядит
    // проигнорированным.
    toast(i18nT('lib.import.nothingAdded'))
    return 0
  }
  // Новые треки — наверх «Все треки».
  useLibStore.getState().addTracks(added.map(fromLocal), { prepend: true })
  return added.length
}

/**
 * Удалить трек библиотеки, который принадлежит пользователю: одиночный локальный
 * файл, либо легаси-трек, чьи байты лежат в IndexedDB, либо сохранённый трек
 * площадки. Треки из отслеживаемых папок так не удаляют — ими управляет папка.
 */
export const deleteUploadedTrack = async (trackId: string): Promise<void> => {
  const track = useLibStore.getState().tracks.find((t) => t.id === trackId)

  blobMgr.revoke(trackId)
  useLibStore.getState().removeTrack(trackId)
  // Чистим ссылки из плейлистов/лайков/истории, иначе остаются «висячие» id
  // (счётчики показывают, вид — нет).
  cascadePurgeTrackRefs([trackId])

  // Одиночный локальный трек: путь убирается из files.json, а копию,
  // сделанную режимом «В Bloom», Rust стирает с диска.
  if (track?._localPath && !track._folder) {
    await fileRemove(track._localPath).catch((e) => console.warn('fileRemove failed', e))
    return
  }

  // Легаси: треки, загруженные старым импортом, хранят байты в IndexedDB.
  try {
    await idbDeleteTrack(trackId)
  } catch (e) {
    console.warn('idbDeleteTrack failed', e)
  }
}
