import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { ScLogo, YmLogo } from '@entities/track'
import { getProviders } from '@features/providers'
import { switchPlatform } from '../api/play'

/**
 * Дропдаун выбора площадки для ТЕКУЩЕГО трека — открывается по бейджу-кнопке в
 * транспорте плеера. Выбор другой площадки ищет тот же трек там и переключает
 * воспроизведение на её версию (`switchPlatform`).
 *
 * Анкорится над кнопкой (как SpeedPicker/DlMenu), рендер через портал в body,
 * open-анимация — общий `usePopupOpenAnimation`. Стиль — общий `.bloom-dl-popup`.
 */
/**
 * Лого площадки с пер-провайдерным масштабом: лого SoundCloud визуально мельче
 * (контент занимает ~половину viewBox по высоте) — рисуем крупнее, чтобы в ряду
 * с Яндексом смотрелось одинаково.
 */
export const providerLogo = (id: string, size: number) =>
  id === 'yandex'
    ? <YmLogo size={size} />
    : id === 'soundcloud'
      ? <ScLogo size={Math.round(size * 1.4)} />
      : null

export const SourcePicker = ({
  open,
  onClose,
  anchorRef,
  currentProviderId,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** Площадка текущего трека — помечается активной. */
  currentProviderId: string
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Сетевые провайдеры (без локального — на него не «переключаемся»).
  const providers = getProviders().filter((p) => p.id !== 'local')

  // Позиционирование по центру над анкором, flip вниз при нехватке места.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const btn = anchorRef.current
    const p = ref.current
    if (!btn || !p) return
    const r = btn.getBoundingClientRect()
    const mw = p.offsetWidth || 190
    let left = r.left + r.width / 2 - mw / 2
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8))
    const top = r.top - 4 < 60 ? r.bottom + 6 : r.top - p.offsetHeight - 6
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

  if (!open) return null

  return createPortal(
    <div
      ref={ref}
      id="bloom-src-popup"
      className={pos ? 'open' : ''}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: 'top center',
      }}
    >
      {/* Иконки площадок столбиком: текущая подсвечена акцентом, остальные — клик. */}
      <div className="bloom-dl-inner" style={{ gap: 4, minWidth: 0 }}>
        {providers.map((p) => {
          const active = p.id === currentProviderId
          return (
            <button
              key={p.id}
              type="button"
              aria-label={p.label}
              onClick={() => {
                onClose()
                if (!active) void switchPlatform(p.id)
              }}
              style={{
                width: 40,
                height: 40,
                justifyContent: 'center',
                padding: 0,
                color: active ? 'var(--accent)' : 'var(--text2)',
                background: active ? 'rgba(var(--accent-rgb),.16)' : undefined,
              }}
            >
              {providerLogo(p.id, 18)}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
