import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useUiPrefsStore } from '@features/settings'
import { useLibStore, usePlaylistStore } from '../model'

/**
 * Горизонтальный «скрабер» над трек-листом `#libTracklist`.
 *
 * Список скроллится вертикально (нативный скроллбар спрятан), а эта тонкая
 * горизонтальная полоса отражает и контролирует его позицию: тянешь бегунок
 * (или кликаешь по дорожке — прыжок), список листается. Позиция бегунка
 * пересчитывается на scroll/resize/изменение содержимого.
 *
 * Крепится к контейнеру по стабильному id (`libTracklist`) — он рендерится
 * соседним поддеревом в LibContent, поэтому ref сюда не протянуть.
 */

/** Фиксированная ширина бегунка — не зависит от числа треков, меняется только
 *  его позиция вдоль дорожки. */
const THUMB_W = 75

interface DragState {
  startX: number
  startLeft: number
  maxLeft: number
  maxScroll: number
}

export const LibScrollbar = () => {
  // Депсы, при которых меняется высота списка → нужен пере-замер геометрии.
  const mode = useLibStore((s) => s.mode)
  const plId = useLibStore((s) => s.plId)
  const folderPath = useLibStore((s) => s.folderPath)
  const searchQuery = useLibStore((s) => s.searchQuery)
  const tracksLen = useLibStore((s) => s.tracks.length)
  const plTrsLen = usePlaylistStore((s) =>
    plId ? s.playlists.find((p) => p.id === plId)?.trs.length ?? 0 : 0,
  )
  const density = useUiPrefsStore((s) => s.libDensity)
  const colAlbum = useUiPrefsStore((s) => s.libColAlbum)
  const colDate = useUiPrefsStore((s) => s.libColDate)

  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [geom, setGeom] = useState({ scrollable: false, thumbW: 0, left: 0 })

  useEffect(() => {
    const el = document.getElementById('libTracklist')
    const track = trackRef.current
    if (!el || !track) return
    let raf = 0

    const measure = () => {
      const sh = el.scrollHeight
      const ch = el.clientHeight
      const st = el.scrollTop
      const tw = track.clientWidth
      if (sh <= ch + 1 || tw <= 0) {
        setGeom((p) => (p.scrollable ? { scrollable: false, thumbW: 0, left: 0 } : p))
        return
      }
      const thumbW = Math.min(THUMB_W, tw)
      const maxLeft = tw - thumbW
      const left = maxLeft > 0 ? (st / (sh - ch)) * maxLeft : 0
      setGeom({ scrollable: true, thumbW, left })
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // resize контейнера/дорожки → ширина и видимая высота могли измениться.
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    ro.observe(track)
    // добавили/убрали строки (или сменился плейлист) → изменилась общая высота.
    const mo = new MutationObserver(schedule)
    mo.observe(el, { childList: true })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', measure)
      ro.disconnect()
      mo.disconnect()
    }
  }, [mode, plId, folderPath, searchQuery, tracksLen, plTrsLen, density, colAlbum, colDate])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!geom.scrollable) return
    e.preventDefault()
    const el = document.getElementById('libTracklist')
    const track = trackRef.current
    if (!el || !track) return
    const tw = track.clientWidth
    const maxLeft = tw - geom.thumbW
    const maxScroll = el.scrollHeight - el.clientHeight
    const x = e.clientX - track.getBoundingClientRect().left

    let startLeft: number
    if (x >= geom.left && x <= geom.left + geom.thumbW) {
      // Схватили сам бегунок — тащим от текущей позиции.
      startLeft = geom.left
    } else {
      // Клик мимо бегунка — прыжок: центр бегунка под курсор.
      startLeft = Math.min(Math.max(0, x - geom.thumbW / 2), maxLeft)
      el.scrollTop = maxLeft > 0 ? (startLeft / maxLeft) * maxScroll : 0
    }
    dragRef.current = { startX: e.clientX, startLeft, maxLeft, maxScroll }
    track.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const el = document.getElementById('libTracklist')
    if (!el) return
    const newLeft = Math.min(Math.max(0, d.startLeft + (e.clientX - d.startX)), d.maxLeft)
    el.scrollTop = d.maxLeft > 0 ? (newLeft / d.maxLeft) * d.maxScroll : 0
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    try {
      trackRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      // pointer уже отпущен
    }
  }

  return (
    <div className={`lib-scrubber${geom.scrollable ? ' is-on' : ''}`}>
      <div
        ref={trackRef}
        className="lib-scrubber-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {geom.scrollable && (
          <div
            className="lib-scrubber-thumb"
            style={{ width: geom.thumbW, transform: `translateX(${geom.left}px)` }}
          />
        )}
      </div>
    </div>
  )
}
