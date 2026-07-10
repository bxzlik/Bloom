import { useEffect } from 'react'
import { useTauriEvent } from '@shared/hooks'
import type { FolderScanResult } from '@shared/tauri'
import type { Track } from '@entities/track'
import { useLibStore } from '../model'
import { folderGet, folderScanAll, fileScanAll } from '../api'
import { idbLoadAll } from './idb'
import { blobMgr } from './handleFiles'
import { fromLocal } from './fromLocal'
import { cascadePurgeTrackRefs } from './cascadePurge'

/**
 * Применяет результат скана папок: upsert треков + чистка тех, чьи файлы
 * исчезли. Общий путь для первичной загрузки и ручного «Обновить».
 */
export const applyFolderScan = (res: FolderScanResult): void => {
  const st = useLibStore.getState()
  const tracks = res.tracks.map(fromLocal)
  const gone = st.pruneFolderTracks(
    res.folders,
    tracks.map((tr) => tr.id),
  )
  if (tracks.length) st.addTracks(tracks, { prepend: true })
  if (gone.length) cascadePurgeTrackRefs(gone)
}

/**
 * Заливает данные библиотеки:
 * - При монтировании: IDB-rehydrate загруженных пользователем треков, список
 *   папок и скан их содержимого.
 * - Подписки на события folder_watcher (см. shared/tauri/events.ts).
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

  // Список папок из Rust (folder_watcher). Включая недоступные — их видно в
  // сайдбаре, даже если диск сейчас отключён.
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

  // Треки папок. Тянем ОТВЕТОМ команды, а не событием: Rust сканировал из
  // setup() и его emit улетал раньше, чем React успевал подписаться.
  useEffect(() => {
    let cancelled = false
    folderScanAll()
      .then((res) => {
        if (!cancelled) applyFolderScan(res)
      })
      .catch((e) => console.warn('folderScanAll failed', e))
    return () => {
      cancelled = true
    }
  }, [])

  // Одиночные треки (плюсик / перетаскивание) — тем же путём, из files.json.
  useEffect(() => {
    let cancelled = false
    fileScanAll()
      .then((list) => {
        if (!cancelled && list.length) addTracks(list.map(fromLocal), { prepend: true })
      })
      .catch((e) => console.warn('fileScanAll failed', e))
    return () => {
      cancelled = true
    }
  }, [addTracks])

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
