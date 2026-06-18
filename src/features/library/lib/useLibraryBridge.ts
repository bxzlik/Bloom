import { useEffect } from 'react'
import { useTauriEvent } from '@shared/hooks'
import type { LocalTrackInfo } from '@shared/tauri'
import type { Track } from '@entities/track'
import { useLibStore } from '../model'
import { folderGet } from '../api'
import { idbLoadAll } from './idb'
import { blobMgr } from './handleFiles'
import { cascadePurgeTrackRefs } from './cascadePurge'

/**
 * Конвертирует LocalTrackInfo (Rust folder_watcher) в унифицированный Track.
 */
const fromLocal = (t: LocalTrackInfo): Track => ({
  id: t.id,
  name: t.name,
  artist: t.artist,
  album: t.album,
  year: t.year,
  publisher: t.publisher,
  genres: t.genres,
  _folder: t._folder,
  _localPath: t._localPath,
  dur: '—',
  cover: null,
})

/**
 * Заливает данные библиотеки:
 * - При монтировании: IDB-rehydrate загруженных пользователем треков + список папок из Rust.
 * - Подписки на 4 события folder_watcher (см. shared/tauri/events.ts).
 *
 * Подключается ОДИН раз в LibPage.
 */
export const useLibraryBridge = () => {
  const setFolders = useLibStore((s) => s.setFolders)
  const addTracks = useLibStore((s) => s.addTracks)
  const removeFolderTracks = useLibStore((s) => s.removeFolderTracks)
  const removeTrack = useLibStore((s) => s.removeTrack)

  // IDB rehydrate — загружаем сохранённые пользователем треки и
  // пере-генерируем blob URL'ы (они сессионные, поэтому каждый старт заново).
  useEffect(() => {
    let cancelled = false
    idbLoadAll()
      .then((rows) => {
        if (cancelled || !rows.length) return
        const tracks: Track[] = rows.map(({ track, file }) =>
          // Загруженные — blob URL; площадочные (SC/Yandex) meta-only — без url
          // (стрим резолвится source-resolver'ом по _sc/scMedia).
          file ? { ...track, url: blobMgr.create(track.id, file) } : { ...track, url: null },
        )
        addTracks(tracks)
      })
      .catch((e) => console.warn('idbLoadAll failed', e))
    return () => {
      cancelled = true
    }
  }, [addTracks])

  // Список папок из Rust (folder_watcher).
  useEffect(() => {
    let cancelled = false
    folderGet()
      .then((paths) => {
        if (!cancelled) setFolders(paths)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [setFolders])

  useTauriEvent('bloom-folder-list', (paths) => setFolders(paths))
  useTauriEvent('bloom-folder-tracks', (batch) => addTracks(batch.map(fromLocal), { prepend: true }))
  useTauriEvent('bloom-folder-removed', (path) => {
    // Собираем id треков папки ДО удаления, чтобы каскадно почистить ссылки.
    const lp = path.toLowerCase()
    const ids = useLibStore
      .getState()
      .tracks.filter((t) => t._folder?.toLowerCase() === lp)
      .map((t) => t.id)
    removeFolderTracks(path)
    cascadePurgeTrackRefs(ids)
  })
  useTauriEvent('bloom-folder-track-removed', (id) => {
    removeTrack(id)
    cascadePurgeTrackRefs([id])
  })
}
