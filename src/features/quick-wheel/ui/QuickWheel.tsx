import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayerStore, sendPlayerCommand } from '@features/player'
import { useNavStore } from '@app/navigationStore'

/**
 * «Круговое меню» (quick-wheel) — (#quick-wheel,
 * ~26767). Открывается удержанием **Tab** (вне input/textarea): 8 секторов в двух
 * кольцах + центральная play/pause.
 *
 * Управление:
 *   - Tab (удержание) → показать. Отпускание Tab → выполнить активный сектор.
 *   - Esc во время удержания → закрыть без действия.
 *   - Наведение мыши подсвечивает сектор; клик по сектору сразу выполняет.
 *
 * Действия проброшены на bloom-стор плеера (optimistic + sendPlayerCommand) и
 * навигацию (useNavStore), вместо старых глобальных toggleRep/nextTr/goNav.
 *
 * Стили — shared/styles/quick-wheel.css (перенесены без изменений).
 */

// — Геометрия колец —
const R = { i1: 56, i2: 128, o1: 133, o2: 202 }
const GAP = 1.5

const deg2rad = (d: number) => (d * Math.PI) / 180
const pt = (r: number, d: number): [number, number] => [r * Math.cos(deg2rad(d)), r * Math.sin(deg2rad(d))]

/** SVG-путь кольцевого сектора между радиусами r1..r2 и углами s..e (градусы). */
function arcPath(r1: number, r2: number, s: number, e: number): string {
  const p1 = pt(r2, s)
  const p2 = pt(r2, e)
  const p3 = pt(r1, e)
  const p4 = pt(r1, s)
  const lg = e - s > 180 ? 1 : 0
  return `M${p1[0]} ${p1[1]} A${r2} ${r2} 0 ${lg} 1 ${p2[0]} ${p2[1]} L${p3[0]} ${p3[1]} A${r1} ${r1} 0 ${lg} 0 ${p4[0]} ${p4[1]}Z`
}

/** Обёртка иконки `_svgi(d, innerMarkup)`. */
const svgIcon = (d: number, inner: string) =>
  `<svg width="${d}" height="${d}" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">${inner}</svg>`

interface Sector {
  id: string
  r1: number
  r2: number
  /** Центральный угол сектора (градусы). */
  cx: number
  icon: string
  action: () => void
}

// — Действия (bloom-эквиваленты старых toggleRep/nextTr/goNav) —
const repeat = () => {
  usePlayerStore.getState().cycleRepeat()
  sendPlayerCommand('repeat')
}
const next = () => sendPlayerCommand('next')
const shuffle = () => {
  usePlayerStore.getState().toggleShuffle()
  sendPlayerCommand('shuffle')
}
const prev = () => sendPlayerCommand('prev')
const playPause = () => {
  usePlayerStore.getState().togglePlay()
  sendPlayerCommand('playpause')
}

const SECTORS: Sector[] = [
  {
    id: 'inner-top',
    r1: R.i1,
    r2: R.i2,
    cx: -90,
    icon: svgIcon(
      20,
      '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
    ),
    action: repeat,
  },
  {
    id: 'inner-right',
    r1: R.i1,
    r2: R.i2,
    cx: 0,
    icon: svgIcon(
      20,
      '<polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"/>',
    ),
    action: next,
  },
  {
    id: 'inner-bottom',
    r1: R.i1,
    r2: R.i2,
    cx: 90,
    icon: svgIcon(
      20,
      '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" stroke-linecap="round"/><path d="m18 2 4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2" stroke-linecap="round"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8" stroke-linecap="round"/><path d="m18 14 4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/>',
    ),
    action: shuffle,
  },
  {
    id: 'inner-left',
    r1: R.i1,
    r2: R.i2,
    cx: 180,
    icon: svgIcon(
      20,
      '<polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"/>',
    ),
    action: prev,
  },
  {
    id: 'outer-top',
    r1: R.o1,
    r2: R.o2,
    cx: -90,
    icon: svgIcon(
      20,
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
    ),
    action: () => useNavStore.getState().openSettings(),
  },
  {
    id: 'outer-right',
    r1: R.o1,
    r2: R.o2,
    cx: 0,
    icon: svgIcon(20, '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    action: () => useNavStore.getState().goNav('search'),
  },
  {
    id: 'outer-bottom',
    r1: R.o1,
    r2: R.o2,
    cx: 90,
    icon: svgIcon(20, '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'),
    action: () => useNavStore.getState().goNav('lib'),
  },
  {
    id: 'outer-left',
    r1: R.o1,
    r2: R.o2,
    cx: 180,
    icon: svgIcon(
      20,
      '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    ),
    action: () => useNavStore.getState().goNav('home'),
  },
]

const PLAY_ICON = svgIcon(
  22,
  '<path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" fill="currentColor" stroke="none"/>',
)
const PAUSE_ICON = svgIcon(
  22,
  '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
)

export const QuickWheel = () => {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const playing = usePlayerStore((s) => s.playing)

  const wrapRef = useRef<HTMLDivElement>(null)
  const tabDownRef = useRef(false)
  const activeRef = useRef<string | null>(null)
  activeRef.current = activeId

  const hide = useCallback((exec: boolean) => {
    setOpen(false)
    if (exec && activeRef.current) {
      const s = SECTORS.find((x) => x.id === activeRef.current)
      s?.action()
    }
    setActiveId(null)
  }, [])

  // Глобальные Tab(удержание)/Esc — keydown/keyup capture-хендлеров.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        if (!tabDownRef.current) {
          tabDownRef.current = true
          setOpen(true)
        }
      }
      if (e.code === 'Escape' && tabDownRef.current) {
        e.preventDefault()
        tabDownRef.current = false
        hide(false)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab' && tabDownRef.current) {
        tabDownRef.current = false
        hide(true)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
    }
  }, [hide])

  // Наведение мыши → подсветка сектора.
  const onMove = useCallback((e: React.MouseEvent) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    let found: string | null = null
    for (const s of SECTORS) {
      if (dist < s.r1 || dist > s.r2) continue
      const s0 = s.cx - 45 + GAP / 2
      const s1 = s.cx + 45 - GAP / 2
      const a = ((angle % 360) + 360) % 360
      const n0 = ((s0 % 360) + 360) % 360
      const n1 = ((s1 % 360) + 360) % 360
      const inside = n0 <= n1 ? a >= n0 && a <= n1 : a >= n0 || a <= n1
      if (inside) {
        found = s.id
        break
      }
    }
    setActiveId(found)
  }, [])

  return (
    <div id="quick-wheel" className={open ? 'qw-open' : undefined} onMouseMove={open ? onMove : undefined}>
      <div id="qw-wrap" ref={wrapRef}>
        <svg id="qw-svg" viewBox="-210 -210 420 420" xmlns="http://www.w3.org/2000/svg">
          {SECTORS.map((s) => {
            const s0 = s.cx - 45 + GAP / 2
            const s1 = s.cx + 45 - GAP / 2
            return (
              <path
                key={s.id}
                d={arcPath(s.r1, s.r2, s0, s1)}
                className={`qw-sector${activeId === s.id ? ' qw-active' : ''}`}
                onClick={() => {
                  hide(false)
                  s.action()
                }}
              />
            )
          })}
        </svg>
        <div id="qw-labels">
          {SECTORS.map((s) => {
            const mid = (s.r1 + s.r2) / 2
            const mp = pt(mid, s.cx)
            return (
              <div
                key={s.id}
                className={`qw-icon-wrap${activeId === s.id ? ' qw-active' : ''}`}
                style={{ left: 210 + mp[0], top: 210 + mp[1] }}
                dangerouslySetInnerHTML={{ __html: s.icon }}
              />
            )
          })}
        </div>
        <button
          id="qw-center"
          onClick={() => {
            hide(false)
            playPause()
          }}
          dangerouslySetInnerHTML={{ __html: playing ? PAUSE_ICON : PLAY_ICON }}
        />
      </div>
    </div>
  )
}
