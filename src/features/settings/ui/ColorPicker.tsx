import { useEffect, useRef, useState } from 'react'
import { useColorPickerStore } from '../model/colorPickerStore'

/**
 * Кастомный HSV color-picker (`openCP`).
 *
 * Единственный экземпляр висит в App; открывается через `openColorPicker(...)`
 * (см. colorPickerStore). Saturation-box (мышь = s/v) + hue-полоса + hex-инпут;
 * изменения эмитятся живо через `onChange`.
 */

// ── HSV ↔ HEX ──────────────────────────────────────
function hsv2hex(h: number, s: number, v: number): string {
  let r = 0,
    g = 0,
    b = 0
  const i = Math.floor(h / 60) % 6
  const f = h / 60 - Math.floor(h / 60)
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    default: r = v; g = p; b = q; break
  }
  return (
    '#' +
    [r, g, b]
      .map((x) => Math.round(x * 255).toString(16).padStart(2, '0'))
      .join('')
  )
}

function hex2hsv(hexIn: string): { h: number; s: number; v: number } {
  let hex = (hexIn + '').replace(/[^0-9a-fA-F]/g, '')
  if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('')
  if (hex.length !== 6) return { h: 0, s: 0, v: 0 }
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const v = max
  const s = max ? (max - min) / max : 0
  let h = 0
  if (max !== min) {
    if (max === r) h = 60 * (((g - b) / (max - min)) % 6)
    else if (max === g) h = 60 * ((b - r) / (max - min) + 2)
    else h = 60 * ((r - g) / (max - min) + 4)
    if (h < 0) h += 360
  }
  return { h, s, v }
}

/** Нормализует входной цвет (hex/rgb) к `#rrggbb`. */
function normHex(input: string): string {
  let hex = (input || '#888888').trim().replace(/\s/g, '')
  if (hex.startsWith('rgb')) {
    try {
      const m = hex.match(/\d+/g)!
      hex =
        '#' +
        [m[0], m[1], m[2]]
          .map((x) => parseInt(x).toString(16).padStart(2, '0'))
          .join('')
    } catch {
      hex = '#888888'
    }
  }
  if (!hex.startsWith('#')) hex = '#' + hex
  return hex
}

const POP_W = 228
const POP_H = 265

export const ColorPicker = () => {
  const open = useColorPickerStore((s) => s.open)
  const anchor = useColorPickerStore((s) => s.anchor)
  const color = useColorPickerStore((s) => s.color)
  const close = useColorPickerStore((s) => s.close)

  const [hsv, setHsvState] = useState({ h: 0, s: 1, v: 1 })
  const [hexText, setHexText] = useState('#888888')
  const hsvRef = useRef(hsv)
  const dragRef = useRef<'sat' | 'hue' | null>(null)
  const satBoxRef = useRef<HTMLDivElement>(null)
  const hueTrackRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef<((hex: string) => void) | null>(null)
  const hexFocusRef = useRef(false)

  // Применяет HSV: обновляет state+ref, синкает hex-инпут и эмитит цвет наружу.
  const applyHsv = (next: { h: number; s: number; v: number }, emit = true) => {
    hsvRef.current = next
    setHsvState(next)
    const hex = hsv2hex(next.h, next.s, next.v)
    if (!hexFocusRef.current) setHexText(hex)
    if (emit) onChangeRef.current?.(hex)
  }

  // Инициализация HSV при каждом открытии (anchor — новый объект на каждый вызов).
  useEffect(() => {
    if (!open) return
    onChangeRef.current = useColorPickerStore.getState().onChange
    const h = normHex(color)
    applyHsv(hex2hsv(h.replace('#', '')), false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor, color])

  // Глобальные mousemove/up для drag по sat/hue.
  useEffect(() => {
    if (!open) return
    const onMove = (e: MouseEvent) => {
      const mode = dragRef.current
      if (!mode) return
      if (mode === 'sat' && satBoxRef.current) {
        const r = satBoxRef.current.getBoundingClientRect()
        const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
        const v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
        applyHsv({ ...hsvRef.current, s, v })
      } else if (mode === 'hue' && hueTrackRef.current) {
        const r = hueTrackRef.current.getBoundingClientRect()
        const h = Math.max(0, Math.min(360, ((e.clientX - r.left) / r.width) * 360))
        applyHsv({ ...hsvRef.current, h })
      }
    }
    const onUp = () => {
      dragRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Закрытие по клику вне попапа.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.('#cpPopup') || t?.closest?.('.cin-swatch') || t?.closest?.('.pedit-disc-custom')) return
      close()
    }
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 10)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, close])

  if (!open || !anchor) return null

  // Позиционирование под swatch с клампом по краям окна.
  let left = anchor.left
  let top = anchor.bottom + 6
  if (left + POP_W > window.innerWidth - 8) left = window.innerWidth - POP_W - 8
  if (top + POP_H > window.innerHeight - 8) top = anchor.top - POP_H - 6
  left = Math.max(8, left)
  top = Math.max(8, top)

  const hex = hsv2hex(hsv.h, hsv.s, hsv.v)
  const pure = hsv2hex(hsv.h, 1, 1)

  const onHexInput = (val: string) => {
    setHexText(val)
    let v = val.trim()
    if (!v.startsWith('#')) v = '#' + v
    if (/^#[0-9a-fA-F]{6}$/.test(v)) applyHsv(hex2hsv(v.replace('#', '')))
  }

  return (
    <div id="cpPopup" className="open" style={{ left, top }}>
      <div
        id="cpSatBox"
        ref={satBoxRef}
        style={{ background: pure }}
        onMouseDown={(e) => {
          // Палитра — div без фокуса: клик по ней НЕ блюрит hex-инпут, поэтому
          // снимаем флаг вручную, иначе текст кода застынет при перетаскивании.
          hexFocusRef.current = false
          dragRef.current = 'sat'
          const r = e.currentTarget.getBoundingClientRect()
          const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
          const v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
          applyHsv({ ...hsvRef.current, s, v })
          e.preventDefault()
        }}
      >
        <div id="cpSatHandle" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div id="cpHueWrap">
        <div
          id="cpHueTrack"
          ref={hueTrackRef}
          onMouseDown={(e) => {
            hexFocusRef.current = false
            dragRef.current = 'hue'
            const r = e.currentTarget.getBoundingClientRect()
            const h = Math.max(0, Math.min(360, ((e.clientX - r.left) / r.width) * 360))
            applyHsv({ ...hsvRef.current, h })
            e.preventDefault()
          }}
        >
          <div id="cpHueHandle" style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }} />
        </div>
      </div>
      <div id="cpHexRow">
        <div id="cpPreview" style={{ background: hex }} />
        <input
          id="cpHexInput"
          type="text"
          placeholder="#888888"
          maxLength={7}
          value={hexText}
          onFocus={() => (hexFocusRef.current = true)}
          onBlur={() => {
            hexFocusRef.current = false
            // Снимаем недописанный/невалидный ввод обратно к реальному коду цвета.
            const cur = hsvRef.current
            setHexText(hsv2hex(cur.h, cur.s, cur.v))
          }}
          onChange={(e) => onHexInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') close()
          }}
        />
      </div>
    </div>
  )
}
