import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { useT } from '@shared/i18n'
import { EQ_LABELS, EQ_MAX_DB, EQ_PRESETS, EQ_PRESET_LABELS, useEqStore } from '../model/eqStore'

/**
 * Панель эквалайзера (по макету): ряд пресетов (+ кастомные) и перетаскиваемая
 * кривая на 6 полос. Открывается кнопкой EQ в плеере. Портал в body + анкор +
 * open-анимация — как SpeedPicker/DlMenu. Значения пишутся в `useEqStore`,
 * применяет звук `audioEffects`.
 */

const W = 320
const CURVE_H = 130
const PAD_X = 18
const PAD_Y = 20

const innerW = W - PAD_X * 2
const centerY = CURVE_H / 2
const amp = CURVE_H / 2 - PAD_Y

const bandX = (i: number, n: number): number => PAD_X + (i * innerW) / (n - 1)
const gainToY = (db: number): number => centerY - (db / EQ_MAX_DB) * amp
const yToGain = (y: number): number => {
  const db = ((centerY - y) / amp) * EQ_MAX_DB
  return Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, db))
}

export const EqPanel = ({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
}) => {
  const t = useT()
  const gains = useEqStore((s) => s.gains)
  const activePreset = useEqStore((s) => s.activePreset)
  const custom = useEqStore((s) => s.custom)
  const setGain = useEqStore((s) => s.setGain)
  const applyPreset = useEqStore((s) => s.applyPreset)
  const saveCustom = useEqStore((s) => s.saveCustom)
  const deleteCustom = useEqStore((s) => s.deleteCustom)

  const ref = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const presetsRef = useRef<HTMLDivElement>(null)
  const dragBand = useRef<number | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const n = gains.length

  const confirmAdd = () => {
    const nm = draft.trim()
    if (nm) saveCustom(nm)
    setAdding(false)
    setDraft('')
  }
  const cancelAdd = () => {
    setAdding(false)
    setDraft('')
  }

  // Горизонтальная прокрутка ряда пресетов колесом с зажатым Alt.
  const onPresetsWheel = (e: React.WheelEvent) => {
    if (!e.altKey) return
    const el = presetsRef.current
    if (!el) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  // Позиционирование над анкором (центр), flip вниз при нехватке места.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const btn = anchorRef.current
    const p = ref.current
    if (!btn || !p) return
    const r = btn.getBoundingClientRect()
    const pw = p.offsetWidth || W
    let left = r.left + r.width / 2 - pw / 2
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
    const top = r.top - p.offsetHeight - 8 < 8 ? r.bottom + 8 : r.top - p.offsetHeight - 8
    setPos({ left, top })
  }, [open, anchorRef])

  usePopupOpenAnimation(ref, pos)

  // Click outside / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  // Перетаскивание точки полосы.
  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    dragBand.current = i
    const move = (ev: PointerEvent) => {
      if (dragBand.current == null) return
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const y = ((ev.clientY - rect.top) / rect.height) * CURVE_H
      setGain(dragBand.current, yToGain(y))
    }
    const up = () => {
      dragBand.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!open) return null

  const xs = gains.map((_, i) => bandX(i, n))
  const ys = gains.map((g) => gainToY(g))
  const linePts = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  const areaPts = `${PAD_X},${CURVE_H} ${linePts} ${PAD_X + innerW},${CURVE_H}`

  const presetNames = [...Object.keys(EQ_PRESETS), ...Object.keys(custom)]

  return createPortal(
    <div
      ref={ref}
      id="eqPanel"
      className="open"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: 'bottom center',
        width: W,
      }}
    >
      {/* Пресеты */}
      <div className="eq-presets" ref={presetsRef} onWheel={onPresetsWheel}>
        {adding ? (
          <div className="eq-add-edit">
            <input
              className="eq-name-input"
              autoFocus
              value={draft}
              placeholder={t('player.eq.namePlaceholder')}
              maxLength={24}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmAdd()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  cancelAdd()
                }
              }}
            />
            <button className="eq-confirm" onClick={confirmAdd}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </button>
          </div>
        ) : (
          <button className="eq-add" onClick={() => setAdding(true)}>
            +
          </button>
        )}
        {presetNames.map((name) => {
          const isCustom = custom[name] != null
          if (isCustom) {
            return (
              <span
                key={name}
                className={`eq-chip eq-chip-custom${activePreset === name ? ' active' : ''}`}
                onClick={() => applyPreset(name)}
              >
                {name}
                <span
                  className="eq-chip-x"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteCustom(name)
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </span>
              </span>
            )
          }
          return (
            <button
              key={name}
              className={`eq-chip${activePreset === name ? ' active' : ''}`}
              onClick={() => applyPreset(name)}
            >
              {EQ_PRESET_LABELS[name] ? t(EQ_PRESET_LABELS[name]!) : name}
            </button>
          )
        })}
      </div>

      {/* Кривая */}
      <svg ref={svgRef} className="eq-curve" viewBox={`0 0 ${W} ${CURVE_H}`} width="100%" height={CURVE_H}>
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {/* нулевая линия */}
        <line x1={PAD_X} y1={centerY} x2={PAD_X + innerW} y2={centerY} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        <polygon points={areaPts} fill="url(#eqFill)" />
        <polyline points={linePts} fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={ys[i]}
            r={6}
            fill="#fff"
            style={{ cursor: 'ns-resize' }}
            onPointerDown={onPointerDown(i)}
          />
        ))}
      </svg>

      {/* Подписи частот */}
      <div className="eq-labels">
        {EQ_LABELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>,
    document.body,
  )
}
