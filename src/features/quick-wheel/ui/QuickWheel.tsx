import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayerStore, sendPlayerCommand } from '@features/player'
import { useNavStore } from '@app/navigationStore'
import { Ico, type IconName } from '@shared/ui/icons/solar'

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

interface Sector {
  id: string
  r1: number
  r2: number
  /** Центральный угол сектора (градусы). */
  cx: number
  icon: IconName
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
  { id: 'inner-top', r1: R.i1, r2: R.i2, cx: -90, icon: 'repeat', action: repeat },
  { id: 'inner-right', r1: R.i1, r2: R.i2, cx: 0, icon: 'next', action: next },
  { id: 'inner-bottom', r1: R.i1, r2: R.i2, cx: 90, icon: 'shuffle', action: shuffle },
  { id: 'inner-left', r1: R.i1, r2: R.i2, cx: 180, icon: 'prev', action: prev },
  { id: 'outer-top', r1: R.o1, r2: R.o2, cx: -90, icon: 'settings', action: () => useNavStore.getState().openSettings() },
  { id: 'outer-right', r1: R.o1, r2: R.o2, cx: 0, icon: 'search', action: () => useNavStore.getState().goNav('search') },
  { id: 'outer-bottom', r1: R.o1, r2: R.o2, cx: 90, icon: 'library', action: () => useNavStore.getState().goNav('lib') },
  { id: 'outer-left', r1: R.o1, r2: R.o2, cx: 180, icon: 'home', action: () => useNavStore.getState().goNav('home') },
]

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
              >
                <Ico name={s.icon} width={20} height={20} />
              </div>
            )
          })}
        </div>
        <button
          id="qw-center"
          onClick={() => {
            hide(false)
            playPause()
          }}
        >
          <Ico name={playing ? 'pause' : 'play'} width={22} height={22} />
        </button>
      </div>
    </div>
  )
}
