/**
 * Скачивание текущего трека / обложки.
 *
 * Нативную часть выполняют Tauri-команды `sc_download` / `local_download` /
 * `cover_download` (src-tauri/commands.rs); о ходе сообщает событие
 * `bloom-download-state` (state: downloading|done|cancelled|error).
 *
 * Три ветки:
 *  - SC-трек (`_sc`): резолвим progressive (mp3) CDN-URL и отдаём в Rust
 *    (HttpClient качает без CORS + SaveFileDialog). HLS-only → скачать нельзя.
 *  - локальный файл (`_localPath`): Rust копирует файл через SaveFileDialog.
 *  - загруженный трек (blob/IDB url): браузерный `<a download>`.
 */
import { invoke, onAppEvent } from '@shared/tauri'
import { toast, downloadBanner } from '@shared/ui'
import { t as i18nT } from '@shared/i18n'
import type { Track } from '@entities/track'
import { apiFetch, type ScMedia } from '@features/soundcloud'
import { ymStreamUrl } from '@features/yandex/api/ymClient'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const sanitize = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '_')

const trackFileBase = (t: Track): string =>
  sanitize((t.artist ? t.artist + ' - ' : '') + t.name)

// ── мост состояния скачивания (единый слушатель события) ────────────────────
// Один слушатель события + текущий контекст (что качаем).
type DlCtx = { kind: 'track' | 'cover'; name: string }
let _ctx: DlCtx | null = null
let _listenerReady: Promise<void> | null = null

const ensureListener = (): Promise<void> => {
  if (_listenerReady) return _listenerReady
  _listenerReady = onAppEvent('bloom-download-state', ({ state, message }) => {
    if (!_ctx) return
    const cover = _ctx.kind === 'cover'
    if (state === 'downloading') toast(cover ? 'Скачивание обложки…' : 'Скачивание…')
    else if (state === 'done') toast(cover ? '✓ Обложка сохранена' : '✓ Сохранено: ' + _ctx.name)
    else if (state === 'cancelled') {
      /* пользователь отменил диалог — молчим */
    } else if (state === 'error') toast(i18nT('toast.dlError', { msg: message || '' }))
  }).then(() => undefined)
  return _listenerReady
}

// ── SC: получить progressive CDN-URL ────────────────────────────────────────
const getProgressiveUrl = async (media: ScMedia | null): Promise<string> => {
  if (!media || !media.transcodings || !media.transcodings.length) throw new Error(i18nT('search.err.noStream'))
  const prog = media.transcodings.find((tc) => tc.format?.protocol === 'progressive')
  if (!prog) throw new Error(i18nT('search.err.hlsOnly'))
  const data = await apiFetch(prog.url)
  if (!data || !data.url) throw new Error('SC не вернул CDN ссылку')
  return data.url
}

const resolveScMedia = async (permalink: string): Promise<ScMedia> => {
  const data = await apiFetch('https://api-v2.soundcloud.com/resolve?url=' + encodeURIComponent(permalink))
  return data?.media as ScMedia
}

// ── Резолв прямой ссылки для скачивания (по площадке) ───────────────────────
// `referer` нужен SC (виртуальный origin → 403 без него); YM передаёт null.
type Downloadable = { url: string; referer: string | null }

/** SC: resolve permalink → progressive CDN-URL. Бросает при HLS-only. */
const resolveScDownloadable = async (t: Track): Promise<Downloadable> => {
  const media = (t.scMedia as ScMedia | undefined) ?? (await resolveScMedia(t.scPermalink || ''))
  const url = await getProgressiveUrl(media)
  return { url, referer: 'https://soundcloud.com/' }
}

/** YM: ym_stream_url → прямой CDN mp3 (Rust+rustls качает без прокси). */
const resolveYmDownloadable = async (t: Track): Promise<Downloadable> => {
  if (!t.ymTrackId) throw new Error(i18nT('search.err.noStream'))
  const url = await ymStreamUrl(t.ymTrackId)
  return { url, referer: null }
}

/** Резолв ссылки для трека площадки (SC/YM). Бросает, если трек не качается. */
const resolveDownloadable = (t: Track): Promise<Downloadable> => {
  if (t._sc) return resolveScDownloadable(t)
  if (t._ym) return resolveYmDownloadable(t)
  return Promise.reject(new Error(i18nT('toast.dlUnavailable')))
}

/** Скачать текущий трек (площадки SC/YM → диалог сохранения; локальные/blob). */
export const downloadTrack = async (t: Track | null): Promise<void> => {
  if (!t) return
  await ensureListener()

  // Треки площадок (SC/YM): резолвим прямой CDN-URL → Rust HttpClient
  // (виртуальный origin WebView2 → 403 на CORS, поэтому качает Rust).
  if (t._sc || t._ym) {
    _ctx = { kind: 'track', name: t.name }
    toast(i18nT('toast.dlGettingLink'))
    try {
      const { url, referer } = await resolveDownloadable(t)
      await invoke('sc_download', {
        url,
        filename: trackFileBase(t),
        coverUrl: t.cover || null,
        title: t.name || '',
        artist: t.artist || '',
        referer,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast(i18nT(t._sc ? 'toast.dlScError' : 'toast.dlError', { msg }))
    }
    return
  }

  // Локальный файл — Rust копирует через SaveFileDialog.
  if (t._localPath) {
    _ctx = { kind: 'track', name: t.name }
    await invoke('local_download', { localPath: t._localPath, filename: trackFileBase(t) })
    return
  }

  // Загруженный трек — браузерный download blob/IDB url.
  if (t.url) {
    const a = document.createElement('a')
    a.href = t.url
    a.download = t.name + '.mp3'
    a.click()
    return
  }
  toast(i18nT('toast.dlUnavailable'))
}

/** Скачать обложку текущего трека (coverOverride перекрывает обложку трека). */
export const downloadCover = async (
  t: Track | null,
  coverOverride: string | null,
): Promise<void> => {
  if (!t) return
  const coverSrc = coverOverride || t.cover || null
  if (!coverSrc) return
  await ensureListener()
  _ctx = { kind: 'cover', name: t.name }
  const filename = trackFileBase(t)
  if (coverSrc.startsWith('data:')) {
    await invoke('cover_download', { dataUrl: coverSrc, url: null, filename })
  } else {
    await invoke('cover_download', { dataUrl: null, url: coverSrc, filename })
  }
}

/**
 * Скачать все треки плейлиста площадок в выбранную папку (создаётся подпапка с
 * именем плейлиста). Качаются только SC/YM-треки; локальные/загруженные
 * пропускаются. Ссылки резолвятся покадрово — прямо перед скачиванием каждого
 * трека (подписанные CDN-URL живут минуты), затем `download_to_dir` пишет файл.
 */
export const downloadPlaylistTracks = async (name: string, tracks: Track[]): Promise<void> => {
  const platform = tracks.filter((t) => t._sc || t._ym)
  if (!platform.length) {
    toast(i18nT('toast.plDlNoTracks'))
    return
  }

  // Один диалог выбора папки; Rust создаёт подпапку и возвращает её путь.
  const dir = await invoke<string | null>('pick_playlist_dir', { folderName: name })
  if (!dir) return // пользователь отменил

  const total = platform.length
  downloadBanner.start(name, total)
  for (let i = 0; i < total; i++) {
    const t = platform[i]
    downloadBanner.setCurrent(i + 1, trackFileBase(t))

    // До 3 попыток с бэкоффом: SC лимитирует api-v2 при потоке резолвов —
    // под нагрузкой отдаёт 401/403, ротация client_id исчерпывается. Пауза
    // даёт лимиту «остыть». (CDN-троттлинг аудио/обложки ретраит сам Rust.)
    let success = false
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      if (attempt > 0) await sleep(1000 * attempt)
      try {
        const { url, referer } = await resolveDownloadable(t)
        await invoke('download_to_dir', {
          dir,
          url,
          filename: trackFileBase(t),
          coverUrl: t.cover || null,
          title: t.name || '',
          artist: t.artist || '',
          referer,
        })
        success = true
      } catch (e) {
        console.warn(`downloadPlaylistTracks: attempt ${attempt + 1} failed for`, t.name, e)
      }
    }
    downloadBanner.itemDone(success)

    // Вежливая пауза между треками — снижает риск 403 от SC API.
    if (i < total - 1) await sleep(250)
  }
  downloadBanner.finish()
}
