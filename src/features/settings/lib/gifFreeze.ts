import { invoke } from '@shared/tauri'

/**
 * Заморозка анимированного GIF в первый кадр через canvas. Нужно
 * «Оптимизации»: при расфокусе/сворачивании GIF-обложки/фон/виз продолжают
 * крутиться (CSS их не останавливает — это <img>/background) и греют GPU.
 *
 * Чтобы заморозка была мгновенной, а возврат к «живой» гифке после фокуса не
 * упирался в повторную сетевую загрузку, каждую гифку кэшируем один раз:
 *  - `live` — локальный data-URL самой гифки (для удалённых тянем байты через
 *    Rust, в обход CORS WebView2; для data:/blob это сам src);
 *  - `snapshot` — PNG первого кадра.
 * Дальше и заморозка (snapshot), и восстановление (live) идут из памяти.
 */

/** GIF ли это (data:image/gif или *.gif). */
export const isGifUrl = (url: string | null | undefined): boolean =>
  !!url && (/^data:image\/gif/i.test(url) || /\.gif($|\?)/i.test(url))

interface Cached {
  /** Локальный data-URL гифки (без сети при восстановлении). */
  live: string
  /** PNG первого кадра (или null, если снять не удалось). */
  snapshot: string | null
}

const cache = new Map<string, Cached>()
const inflight = new Map<string, Promise<Cached | null>>()

/** Нарисовать первый кадр локального изображения (data:/blob:) в PNG dataURL. */
const drawFrame = (loadSrc: string): Promise<string | null> =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const cv = document.createElement('canvas')
        cv.width = img.naturalWidth || img.width || 0
        cv.height = img.naturalHeight || img.height || 0
        if (!cv.width || !cv.height) return resolve(null)
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height)
        resolve(cv.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = loadSrc
  })

/** Привести src к локальному data-URL: http(s) тянем через Rust, иначе как есть. */
const toLocal = async (src: string): Promise<string | null> => {
  if (/^https?:\/\//i.test(src)) {
    try {
      return await invoke<string>('fetch_image_data_url', { url: src })
    } catch {
      return null
    }
  }
  // data:/blob: — уже локальные.
  return src
}

/**
 * Прогреть кэш гифки (загрузить локально + снять первый кадр). Идемпотентно:
 * повторные/параллельные вызовы дедуплицируются. Возвращает запись кэша.
 */
export const warmGif = (src: string): Promise<Cached | null> => {
  const hit = cache.get(src)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(src)
  if (pending) return pending
  const p = (async (): Promise<Cached | null> => {
    try {
      const live = await toLocal(src)
      if (!live) return null
      const snapshot = isGifUrl(src) ? await drawFrame(live) : live
      const entry: Cached = { live, snapshot }
      cache.set(src, entry)
      return entry
    } catch {
      return null
    } finally {
      inflight.delete(src)
    }
  })()
  inflight.set(src, p)
  return p
}

/**
 * Снимок первого кадра GIF → PNG dataURL (или null при ошибке/недоступности).
 * Из кэша — мгновенно; первый раз прогревает.
 */
export const snapshotGif = async (src: string): Promise<string | null> =>
  (await warmGif(src))?.snapshot ?? null

/**
 * Локальный data-URL гифки из кэша (или null, если ещё не прогрета). Нужно для
 * восстановления «живой» гифки без повторной сетевой загрузки.
 */
export const localGifSrc = (src: string): string | null => cache.get(src)?.live ?? null

/**
 * Привести любой src к локальному (data:/blob:) для чтения пикселей на canvas
 * без CORS-тейнта: http(s) тянем через Rust и кэшируем, остальное — как есть.
 * При неудаче возвращает исходный src. Нужно извлечению цвета из обложки.
 */
export const resolveLocalSrc = async (src: string): Promise<string> => {
  if (!/^https?:\/\//i.test(src)) return src
  const entry = await warmGif(src)
  return entry?.live ?? src
}
