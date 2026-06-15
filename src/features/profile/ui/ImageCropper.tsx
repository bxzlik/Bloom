import { useEffect, useRef, useState } from 'react'

/**
 * Canvas-кроппер для аватара (круг) и баннера (прямоугольник по аспекту).
 * `_crop*`: drag-пан + zoom-слайдер,
 * cover-масштаб заполняет рамку, min-слайдер позволяет вписать целиком.
 * Apply рендерит обрезок в отдельный canvas → PNG data-URL.
 */

interface CropState {
  img: HTMLImageElement | null
  offsetX: number
  offsetY: number
  scale: number
  coverScale: number
  dragging: boolean
  lastX: number
  lastY: number
  canvasW: number
  canvasH: number
  frameW: number
  frameH: number
}

export const ImageCropper = ({
  dataUrl,
  type,
  bannerAspect,
  onApply,
  onBack,
}: {
  dataUrl: string
  type: 'avatar' | 'banner'
  /** Высота/ширина рамки баннера (для type==='banner'). */
  bannerAspect: number | null
  onApply: (dataUrl: string) => void
  onBack: () => void
}) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const crop = useRef<CropState>({
    img: null, offsetX: 0, offsetY: 0, scale: 1, coverScale: 1,
    dragging: false, lastX: 0, lastY: 0, canvasW: 0, canvasH: 0, frameW: 0, frameH: 0,
  })
  const [zoomLabel, setZoomLabel] = useState('Масштаб  100%')

  const resize = () => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const W = wrap.clientWidth || 500
    const H = wrap.clientHeight || 320
    canvas.width = W
    canvas.height = H
    const c = crop.current
    c.canvasW = W
    c.canvasH = H
    if (type === 'avatar') {
      const d = Math.round(Math.min(W, H) * 0.62)
      c.frameW = d
      c.frameH = d
    } else {
      const aspect = bannerAspect || 220 / 700
      c.frameW = Math.round(W * 0.88)
      c.frameH = Math.round(c.frameW * aspect)
    }
  }

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { canvasW: W, canvasH: H, img, offsetX, offsetY, scale, frameW, frameH } = crop.current
    if (!img) return
    ctx.clearRect(0, 0, W, H)
    const iW = img.naturalWidth * scale
    const iH = img.naturalHeight * scale
    const iX = (W - iW) / 2 + offsetX
    const iY = (H - iH) / 2 + offsetY
    ctx.drawImage(img, iX, iY, iW, iH)
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    if (type === 'avatar') {
      ctx.beginPath()
      ctx.rect(0, 0, W, H)
      ctx.arc(W / 2, H / 2, frameW / 2, 0, Math.PI * 2, true)
      ctx.fill('evenodd')
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(W / 2, H / 2, frameW / 2, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      const fx = (W - frameW) / 2
      const fy = (H - frameH) / 2
      ctx.fillRect(0, 0, W, fy)
      ctx.fillRect(0, fy + frameH, W, H - fy - frameH)
      ctx.fillRect(0, fy, fx, frameH)
      ctx.fillRect(fx + frameW, fy, W - fx - frameW, frameH)
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 2
      ctx.strokeRect(fx, fy, frameW, frameH)
      const cs = 12
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3
      ;([[fx, fy], [fx + frameW, fy], [fx, fy + frameH], [fx + frameW, fy + frameH]] as const).forEach(
        ([cx, cy], i) => {
          const sx = i % 2 === 0 ? 1 : -1
          const sy = i < 2 ? 1 : -1
          ctx.beginPath()
          ctx.moveTo(cx, cy + sy * cs)
          ctx.lineTo(cx, cy)
          ctx.lineTo(cx + sx * cs, cy)
          ctx.stroke()
        },
      )
    }
    ctx.restore()
  }

  // Загрузка изображения + инициализация масштабов.
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      crop.current.img = img
      crop.current.offsetX = 0
      crop.current.offsetY = 0
      requestAnimationFrame(() => {
        resize()
        const c = crop.current
        const coverScale = Math.max(c.frameW / img.naturalWidth, c.frameH / img.naturalHeight)
        c.coverScale = coverScale
        c.scale = coverScale
        const fitScale = Math.min(c.canvasW / img.naturalWidth, c.canvasH / img.naturalHeight) * 0.9
        const minSlider = Math.max(5, Math.round((fitScale / coverScale) * 100))
        const slider = sliderRef.current
        if (slider) {
          slider.min = String(minSlider)
          slider.max = '300'
          slider.value = '100'
        }
        setZoomLabel('Масштаб  100%')
        draw()
      })
    }
    img.src = dataUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUrl, type])

  // Drag-пан (mouse + touch) + ResizeObserver. DOMContentLoaded-хука.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const c = crop.current
    const onDown = (e: MouseEvent) => {
      if (!c.img) return
      c.dragging = true
      c.lastX = e.clientX
      c.lastY = e.clientY
      e.preventDefault()
    }
    const onMove = (e: MouseEvent) => {
      if (!c.dragging) return
      c.offsetX += e.clientX - c.lastX
      c.offsetY += e.clientY - c.lastY
      c.lastX = e.clientX
      c.lastY = e.clientY
      draw()
    }
    const onUp = () => {
      c.dragging = false
    }
    const onTouchStart = (e: TouchEvent) => {
      if (!c.img || e.touches.length !== 1) return
      c.dragging = true
      c.lastX = e.touches[0]!.clientX
      c.lastY = e.touches[0]!.clientY
      e.preventDefault()
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!c.dragging || e.touches.length !== 1) return
      c.offsetX += e.touches[0]!.clientX - c.lastX
      c.offsetY += e.touches[0]!.clientY - c.lastY
      c.lastX = e.touches[0]!.clientX
      c.lastY = e.touches[0]!.clientY
      draw()
      e.preventDefault()
    }
    const onTouchEnd = () => {
      c.dragging = false
    }
    wrap.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    wrap.addEventListener('touchstart', onTouchStart, { passive: false })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    const ro = new ResizeObserver(() => {
      if (crop.current.img) {
        resize()
        draw()
      }
    })
    ro.observe(wrap)
    return () => {
      wrap.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      wrap.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onZoom = (val: string) => {
    const c = crop.current
    c.scale = c.coverScale * (Number(val) / 100)
    setZoomLabel(`Масштаб  ${Math.round(Number(val))}%`)
    draw()
  }

  const apply = () => {
    const c = crop.current
    if (!c.img) return
    const { img, offsetX, offsetY, scale, canvasW: W, canvasH: H, frameW, frameH } = c
    const out = document.createElement('canvas')
    const fx = (W - frameW) / 2
    const fy = (H - frameH) / 2
    out.width = frameW
    out.height = frameH
    const octx = out.getContext('2d')
    if (!octx) return
    if (type === 'avatar') {
      octx.beginPath()
      octx.arc(frameW / 2, frameH / 2, frameW / 2, 0, Math.PI * 2)
      octx.clip()
    }
    const iW = img.naturalWidth * scale
    const iH = img.naturalHeight * scale
    const iX = (W - iW) / 2 + offsetX
    const iY = (H - iH) / 2 + offsetY
    octx.drawImage(img, iX - fx, iY - fy, iW, iH)
    onApply(out.toDataURL('image/png'))
  }

  return (
    <div id="peditCropView" className="active">
      <div className="crop-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} />
      </div>
      <div className="crop-controls">
        <div className="crop-zoom-row">
          <span className="crop-zoom-label">{zoomLabel}</span>
          <input
            type="range"
            className="crop-zoom-slider"
            ref={sliderRef}
            min={50}
            max={300}
            defaultValue={100}
            onInput={(e) => onZoom((e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="crop-actions">
          <button className="crop-btn-back" onClick={onBack}>Назад</button>
          <button className="crop-btn-apply" onClick={apply}>Применить</button>
        </div>
      </div>
    </div>
  )
}
