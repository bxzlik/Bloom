/**
 * Офлайн-загрузка треков для локального прослушивания.
 *
 * Резолв прямой ссылки трека площадки переиспользует `resolveDownloadable`
 * из player/lib/download.ts (SC/YM → прямой CDN-mp3; YTM/Spotify → SC-двойник).
 * Дальше вместо диалога сохранения Rust кладёт файл в офлайн-кеш профиля
 * (`offline_download`) и возвращает путь; связь `id → путь` держит `offline`-стор.
 */
import { toast, notify, downloadBanner } from '@shared/ui'
import { t as i18nT } from '@shared/i18n'
import type { Track } from '@entities/track'
// Глубокий путь (не barrel @features/player): player/ui/DlMenu импортирует
// офлайн-фичу обратно — импорт через barrel создал бы цикл.
import { resolveDownloadable, trackFileBase, isDownloadable } from '@features/player/lib/download'
import { offlineDownload, offlineRemove } from '../api'
import { offline } from '../model/store'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Скачать один трек в офлайн-кеш (только треки площадок; локальные уже офлайн). */
export const downloadTrackOffline = async (t: Track | null): Promise<void> => {
  if (!t || offline.isOffline(t.id)) return
  if (!isDownloadable(t)) {
    toast(i18nT('toast.offlineUnavailable'))
    return
  }
  toast(i18nT('toast.offlineStart'))
  try {
    const { url, referer } = await resolveDownloadable(t)
    const path = await offlineDownload({
      id: t.id,
      url,
      filename: trackFileBase(t),
      coverUrl: t.cover || null,
      title: t.name || '',
      artist: t.artist || '',
      referer,
    })
    offline.add(t.id, path)
    toast(i18nT('toast.offlineSaved', { name: t.name }))
    notify({ kind: 'success', titleKey: 'notif.offline.title', body: t.name })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    toast(i18nT('toast.offlineError', { msg }))
    notify({ kind: 'error', titleKey: 'notif.offlineError.title', body: msg || t.name })
  }
}

/** Убрать из офлайн-кеша все офлайн-треки плейлиста (одним действием). */
export const removePlaylistOffline = async (tracks: Track[]): Promise<void> => {
  const offlineTracks = tracks.filter((t) => offline.isOffline(t.id))
  if (!offlineTracks.length) return
  for (const tr of offlineTracks) {
    try {
      await offlineRemove(tr.id)
      offline.remove(tr.id)
    } catch (e) {
      console.warn('removePlaylistOffline failed for', tr.name, e)
    }
  }
  toast(i18nT('toast.offlineRemoved'))
}

/** Убрать трек из офлайн-кеша (файл + запись). */
export const removeTrackOffline = async (id: string): Promise<void> => {
  try {
    await offlineRemove(id)
    offline.remove(id)
    toast(i18nT('toast.offlineRemoved'))
  } catch (e) {
    console.warn('offlineRemove failed', e)
  }
}

/** Тоггл офлайн-статуса трека (скачать / удалить). */
export const toggleTrackOffline = (t: Track | null): void => {
  if (!t) return
  if (offline.isOffline(t.id)) void removeTrackOffline(t.id)
  else void downloadTrackOffline(t)
}

/**
 * Скачать в офлайн все треки плейлиста (только площадок; уже офлайн и локальные
 * пропускаются). Прогресс — общий `downloadBanner`, как у экспорта плейлиста.
 * Ссылки резолвятся покадрово (подписанные CDN-URL живут минуты), с ретраями
 * от rate-limit площадки.
 */
export const downloadPlaylistOffline = async (name: string, tracks: Track[]): Promise<void> => {
  const pending = tracks.filter((t) => isDownloadable(t) && !offline.isOffline(t.id))
  if (!pending.length) {
    toast(i18nT('toast.plOfflineNoTracks'))
    return
  }

  const total = pending.length
  downloadBanner.start(name, total)
  for (let i = 0; i < total; i++) {
    const tr = pending[i]
    downloadBanner.setCurrent(i + 1, trackFileBase(tr))

    let success = false
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      if (attempt > 0) await sleep(1000 * attempt)
      try {
        const { url, referer } = await resolveDownloadable(tr)
        const path = await offlineDownload({
          id: tr.id,
          url,
          filename: trackFileBase(tr),
          coverUrl: tr.cover || null,
          title: tr.name || '',
          artist: tr.artist || '',
          referer,
        })
        offline.add(tr.id, path)
        success = true
      } catch (e) {
        console.warn(`downloadPlaylistOffline: attempt ${attempt + 1} failed for`, tr.name, e)
      }
    }
    downloadBanner.itemDone(success)

    if (i < total - 1) await sleep(250)
  }
  downloadBanner.finish()
}
