import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { ScLogo, YmLogo, YtmLogo, providerBrandColor } from '@entities/track'
import { useBadgePrefs } from '@shared/lib/badgePrefs'
import { placeSrcPopup } from '@shared/lib/srcPopupPos'
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
    : id === 'ytmusic'
      ? <YtmLogo size={size} />
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
  // Зеркальная раскладка (активный пункт первым, список вниз) — когда попап не
  // помещается вверх от кнопки. См. `placeSrcPopup`.
  const [flip, setFlip] = useState(false)
  const flipRef = useRef(false)
  flipRef.current = flip

  // Сетевые провайдеры (без локального — на него не «переключаемся»).
  const providers = getProviders().filter((p) => p.id !== 'local')
  // Бренд-режим иконок (если настройка «акцентные бейджи» выключена).
  const brand = !useBadgePrefs((s) => s.accentBadges)

  // Позиционирование: активный пункт ложится ровно на кнопку-анкер (попап
  // «вырастает» из иконки), при нехватке места вверх раскладка зеркалится.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const btn = anchorRef.current
    const p = ref.current
    if (!btn || !p) return
    const r = placeSrcPopup(p, btn.getBoundingClientRect(), flipRef.current)
    setFlip(r.flip)
    setPos({ left: r.left, top: r.top })
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

  // Базовый порядок площадок фиксирован (реестр); активная просто изымается из
  // списка и рисуется отдельной строкой внизу. При смене площадки прежняя
  // возвращается на своё исходное место, а новая уезжает вниз.
  const activeProvider = providers.find((p) => p.id === currentProviderId) ?? null
  const rest = providers.filter((p) => p.id !== currentProviderId)

  const srcBtn = (p: { id: string; label: string }, active: boolean) => {
    const color = brand
      ? providerBrandColor(p.id) ?? (active ? 'var(--accent)' : 'var(--text2)')
      : active ? 'var(--accent)' : 'var(--text2)'
    return (
      <button
        key={p.id}
        type="button"
        aria-label={p.label}
        aria-current={active || undefined}
        onClick={() => {
          onClose()
          if (!active) void switchPlatform(p.id)
        }}
        style={{ color, cursor: active ? 'default' : 'pointer' }}
      >
        {providerLogo(p.id, 18)}
      </button>
    )
  }

  return createPortal(
    <div
      ref={ref}
      id="bloom-src-popup"
      className={pos ? 'open' : ''}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: flip ? 'top center' : 'bottom center',
      }}
    >
      {/* Иконки площадок столбиком, без подписей. Текущая площадка отделена
          разделителем и стоит с той стороны, где попап касается кнопки-анкера
          (снизу при раскрытии вверх, сверху при зеркальной раскладке) — линия и
          есть индикатор выбора, подсветки фоном нет.
          В бренд-режиме (настройка accentBadges выключена) иконки в фирменных цветах. */}
      <div className="bloom-dl-inner bloom-srcp srcp-cc">
        {flip && activeProvider && srcBtn(activeProvider, true)}
        {flip && activeProvider && <div className="bloom-srcp-div" />}
        {rest.map((p) => srcBtn(p, false))}
        {!flip && activeProvider && <div className="bloom-srcp-div" />}
        {!flip && activeProvider && srcBtn(activeProvider, true)}
      </div>
    </div>,
    document.body,
  )
}
