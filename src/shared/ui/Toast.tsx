import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@shared/lib/cn'

export interface ToastApi {
  show: (text: string, durationMs?: number) => void
}

export interface UseToastReturn extends ToastApi {
  /** Отрендеренный JSX тоста — вставить в дерево окна. */
  view: React.ReactNode
}

/**
 * Тост МИНИ/TRAY-окон — `.toast` (tray-popup.html:82): сверху по
 * центру, чёрная плашка, 11px, 180ms, 1300мс. Используется ТОЛЬКО в мини-окнах
 * (NowPlayingInfo), где нет глобального `#toast`. Main-окно использует
 * `toast()`/`<GlobalToast/>` (другой стиль — снизу, плашка карточки; см.
 * GlobalToast.tsx). Контейнер должен быть `relative` (тост — `absolute`).
 */
export const useToast = (): UseToastReturn => {
  const [text, setText] = useState('')
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | null>(null)

  const show = useCallback((t: string, durationMs = 1300) => {
    setText(t)
    setVisible(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setVisible(false), durationMs)
  }, [])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const view = (
    <div
      className={cn(
        'pointer-events-none absolute left-1/2 top-[14px] -translate-x-1/2',
        'rounded-[7px] bg-black/85 px-3 py-1.5 text-[11px] font-semibold text-(--color-text)',
        'whitespace-nowrap z-50 transition-opacity duration-[180ms]',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {text}
    </div>
  )

  return { show, view }
}
