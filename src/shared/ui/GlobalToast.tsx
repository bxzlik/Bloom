import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useT } from '@shared/i18n'

/**
 * Глобальный toast main-окна — `showToast`/`#toast`:
 * снизу по центру над плеером (`#toast` CSS в shared/styles/search-misc.css),
 * плашка цвета карточки с рамкой, 2000мс (5000мс с действием-undo).
 *
 * Один `<GlobalToast/>` в App + императивный `toast()` — зовётся откуда угодно
 * (компоненты main-окна, не-React код «Волны»/host-мост). Мини/tray-окна
 * используют свой `.toast` через хук `useToast` (другой стиль — см. Toast.tsx).
 */
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
  /** Монотонный счётчик — каждый show() инкрементит, чтобы повтор того же текста тоже сработал. */
  seq: number
  show: (text: string, action?: ToastAction) => void
}

const useGlobalToastStore = create<GlobalToastState>((set) => ({
  text: '',
  action: null,
  seq: 0,
  show: (text, action) => set((s) => ({ text, action: action ?? null, seq: s.seq + 1 })),
}))

/** Показать toast из любого места (включая не-React код). */
export const toast = (text: string, action?: ToastAction): void =>
  useGlobalToastStore.getState().show(text, action)

/** Рендерится один раз в App. `#toast` спозиционирован fixed — место в дереве не важно. */
export const GlobalToast = () => {
  const t = useT()
  const text = useGlobalToastStore((s) => s.text)
  const action = useGlobalToastStore((s) => s.action)
  const seq = useGlobalToastStore((s) => s.seq)
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | null>(null)
  const actionRef = useRef<ToastAction | null>(null)
  actionRef.current = action

  useEffect(() => {
    if (!seq) return
    setVisible(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    const dur = actionRef.current ? 5000 : 2000
    timer.current = window.setTimeout(() => {
      setVisible(false)
      actionRef.current?.onExpire?.() // истёк по таймеру (не undo)
    }, dur)
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
      className={action && visible ? 'has-action' : undefined}
      style={{ opacity: visible ? 1 : 0 }}
    >
      <span>{text}</span>
      {action && (
        <button className="toast-undo" onClick={onUndo}>
          {action.label || t('common.undo')}
        </button>
      )}
    </div>
  )
}
