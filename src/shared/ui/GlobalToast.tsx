import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useT } from '@shared/i18n'

/**
 * Глобальный toast main-окна — `showToast`/`#toast`:
 * сверху по центру (`#toast` CSS в shared/styles/search-misc.css), плашка цвета
 * карточки с иконкой-видом и полосой обратного отсчёта, 2000мс (5000мс с
 * действием-undo).
 *
 * Один `<GlobalToast/>` в App + императивный `toast()` — зовётся откуда угодно
 * (компоненты main-окна, не-React код «Волны»/host-мост). Мини/tray-окна
 * используют свой `.toast` через хук `useToast` (другой стиль — см. Toast.tsx).
 */
export type ToastKind = 'info' | 'success' | 'warn' | 'error'

export interface ToastAction {
  /** Текст кнопки (по умолчанию «Отменить»). */
  label?: string
  /** Действие по клику (отмена). */
  fn: () => void
  /** Вызывается, если toast истёк по таймеру без клика. */
  onExpire?: () => void
}

interface GlobalToastState {
  text: string
  action: ToastAction | null
  kind: ToastKind
  /** Монотонный счётчик — каждый show() инкрементит, чтобы повтор того же текста тоже сработал. */
  seq: number
  show: (text: string, action?: ToastAction | null, kind?: ToastKind) => void
}

const useGlobalToastStore = create<GlobalToastState>((set) => ({
  text: '',
  action: null,
  kind: 'info',
  seq: 0,
  show: (text, action, kind) =>
    set((s) => ({ text, action: action ?? null, kind: kind ?? 'info', seq: s.seq + 1 })),
}))

/** Показать toast из любого места (включая не-React код). */
export const toast = (text: string, action?: ToastAction | null, kind?: ToastKind): void =>
  useGlobalToastStore.getState().show(text, action, kind)

/** Рендерится один раз в App. `#toast` спозиционирован fixed — место в дереве не важно. */
export const GlobalToast = () => {
  const t = useT()
  const text = useGlobalToastStore((s) => s.text)
  const action = useGlobalToastStore((s) => s.action)
  const kind = useGlobalToastStore((s) => s.kind)
  const seq = useGlobalToastStore((s) => s.seq)
  const [visible, setVisible] = useState(false)
  const [dur, setDur] = useState(2000)
  const timer = useRef<number | null>(null)
  const actionRef = useRef<ToastAction | null>(null)
  actionRef.current = action

  useEffect(() => {
    if (!seq) return
    setVisible(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    const d = actionRef.current ? 5000 : 2000
    setDur(d)
    timer.current = window.setTimeout(() => {
      setVisible(false)
      actionRef.current?.onExpire?.() // истёк по таймеру (не undo)
    }, d)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [seq])

  const onUndo = () => {
    const a = actionRef.current
    if (timer.current !== null) window.clearTimeout(timer.current) // отменяем onExpire
    setVisible(false)
    a?.fn()
  }

  return (
    <div
      id="toast"
      className={`toast-${kind}${action ? ' has-action' : ''}${visible ? ' show' : ''}`}
    >
      <span className="toast-ico">{KIND_ICON[kind]}</span>
      <span className="toast-text">{text}</span>
      {action && (
        <button className="toast-undo" onClick={onUndo}>
          {action.label || t('common.undo')}
        </button>
      )}
      {/* Полоса обратного отсчёта — перезапускается через key={seq}. */}
      <i key={seq} className="toast-bar" style={{ animationDuration: `${dur}ms` }} />
    </div>
  )
}

const iconProps = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  info: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="7.5" x2="12" y2="7.5" />
    </svg>
  ),
  success: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9" />
    </svg>
  ),
  warn: (
    <svg {...iconProps}>
      <path d="M12 3.5L21.5 20H2.5L12 3.5z" />
      <line x1="12" y1="10" x2="12" y2="14.5" />
      <line x1="12" y1="17.5" x2="12" y2="17.5" />
    </svg>
  ),
  error: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16.5" x2="12" y2="16.5" />
    </svg>
  ),
}
