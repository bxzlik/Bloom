/**
 * Применение кастомизации к DOM.
 * Чистые императивные функции — оркестрирует customizationStore.
 */

const isGif = (url: string): boolean => /\.gif($|\?)/i.test(url)

/**
 * Кастомный курсор. Chromium молча
 * игнорирует курсоры >32×32 — даунскейлим через canvas. GIF в Chromium как
 * курсор не анимируется → растеризуем первый кадр (это нормально).
 */
export const applyCustomCursor = (url: string | null): void => {
  let st = document.getElementById('customCursorStyle') as HTMLStyleElement | null
  if (!st) {
    st = document.createElement('style')
    st.id = 'customCursorStyle'
    document.head.appendChild(st)
  }
  if (!url) {
    st.textContent = ''
    return
  }
  const cssFor = (src: string) => `body, body *{cursor:url("${src}") 0 0, auto !important;}`
  const img = new Image()
  img.onload = () => {
    try {
      const MAX = 32
      const r = Math.min(MAX / img.width, MAX / img.height, 1)
      const w = Math.max(1, Math.round(img.width * r))
      const h = Math.max(1, Math.round(img.height * r))
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const ctx = cv.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)
      st!.textContent = cssFor(cv.toDataURL('image/png'))
    } catch {
      st!.textContent = cssFor(url)
    }
  }
  img.onerror = () => {
    st!.textContent = cssFor(url)
  }
  img.src = url
}

/**
 * Фоновый слой `#bgl`. `url` — итоговый фон
 * (manualBg ИЛИ обложка трека при coverAsBg; резолвится в сторе). `blur` px.
 * Затемнение — отдельной `applyBgDim` (через CSS-переменную).
 */
export const applyBackground = (url: string | null, blur: number): void => {
  const bgl = document.getElementById('bgl')
  if (!bgl) return
  if (url) {
    const gif = isGif(url)
    bgl.classList.remove('no-bg')
    bgl.style.backgroundImage = `url(${url})`
    bgl.style.filter = blur > 0 ? `blur(${gif ? Math.min(blur, 8) : blur}px)` : ''
    bgl.classList.toggle('gif-bg', gif)
  } else {
    bgl.style.backgroundImage = ''
    bgl.style.filter = ''
    bgl.classList.remove('gif-bg')
    bgl.classList.add('no-bg')
  }
}

/** Затемнение фона: CSS-переменная `--bg-dim` (0..1). */
export const applyBgDim = (dimPct: number): void => {
  document.documentElement.style.setProperty('--bg-dim', (dimPct / 100).toFixed(2))
}
