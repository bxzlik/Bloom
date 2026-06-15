/**
 * Сжимает обложку до 300×300 JPEG 80%.
 * Возвращает data: URL — компактный и удобный для <img src="...">.
 *
 * с (compressCover): сохраняет пропорции, fit:cover в квадрат,
 * качество 0.8 → размер обычно 15-40KB вместо 500KB+.
 */
export const compressCover = async (
  source: Blob | string,
  size = 300,
  quality = 0.8,
): Promise<string> => {
  const img = await loadImage(source)

  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) throw new Error('cover image has no dimensions')

  const scale = Math.max(size / w, size / h)
  const drawW = w * scale
  const drawH = h * scale
  const offX = (size - drawW) / 2
  const offY = (size - drawH) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas context unavailable')
  ctx.drawImage(img, offX, offY, drawW, drawH)

  // Освобождаем blob URL (если использовали).
  if (typeof source !== 'string') URL.revokeObjectURL(img.src)

  return canvas.toDataURL('image/jpeg', quality)
}

const loadImage = (source: Blob | string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('failed to load cover image'))
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source)
  })
