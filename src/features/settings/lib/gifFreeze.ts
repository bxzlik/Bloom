/**
 * Заморозка анимированного GIF в первый кадр через canvas. Нужно
 * «Оптимизации»: при расфокусе/сворачивании GIF-обложки/фон/виз продолжают
 * крутиться (CSS их не останавливает — это <img>/background) и греют GPU.
 */

/** GIF ли это (data:image/gif или *.gif). */
export const isGifUrl = (url: string | null | undefined): boolean =>
  !!url && (/^data:image\/gif/i.test(url) || /\.gif($|\?)/i.test(url))

/**
 * Снимок первого кадра GIF → PNG dataURL (или null при ошибке/недоступности).
 * Для http(s) сначала тянем blob→dataURL, чтобы canvas не «затаинтился» CORS
 *.
 */
export const snapshotGif = async (src: string): Promise<string | null> => {
  const draw = (loadSrc: string): Promise<string | null> =>
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

  if (/^https?:\/\//i.test(src)) {
    try {
      const blob = await fetch(src).then((r) => r.blob())
      const dataUrl = await new Promise<string | null>((resolve) => {
        const rd = new FileReader()
        rd.onload = (e) => resolve((e.target?.result as string) ?? null)
        rd.onerror = () => resolve(null)
        rd.readAsDataURL(blob)
      })
      return dataUrl ? draw(dataUrl) : null
    } catch {
      return null
    }
  }
  // data:/blob: — рисуем напрямую.
  return draw(src)
}
