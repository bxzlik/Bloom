import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { useT } from '@shared/i18n'
import {
  SPEEDS,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  speedLabel,
  useSpeedStore,
} from '../model/speedStore'

/** Засечки под полосой — каждые 0.25×. Совпавшие с пресетами рисуем крупнее. */
const TICKS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/**
 * Пикер скорости воспроизведения — `#speedPicker`.
 *
 * Раскладка: три пресет-карточки (0.75× / 1× / 1.25×) + полоса произвольной
 * скорости (SPEED_MIN…SPEED_MAX, шаг SPEED_STEP) + тумблер «Сохранять тон»
 * (выключенный даёт классический slowed/nightcore — питч едет вместе с темпом).
 *
 * Рендер через `createPortal` в `body` — иначе backdrop-filter предков ломает
 * `position:fixed`. Open-анимация — общий `usePopupOpenAnimation`
 * (WAAPI scale 0.94→1), как у `.ctx` и меню «три точки». Класс `.open` нужен
 * только ради CSS `display:flex` (`#speedPicker{display:none}`); keyframe
 * `libMenuIn` гасится хуком. Закрытие — мгновенный unmount.
 */
export const SpeedPicker = ({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
}) => {
  const t = useT()
  const rate = useSpeedStore((s) => s.rate)
  const setRate = useSpeedStore((s) => s.setRate)
  const nightcore = useSpeedStore((s) => s.nightcore)
  const setNightcore = useSpeedStore((s) => s.setNightcore)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Позиционирование над анкором (по центру), flip вниз при нехватке места.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const btn = anchorRef.current
    const p = ref.current
    if (!btn || !p) return
    const r = btn.getBoundingClientRect()
    const pw = p.offsetWidth || 260
    let left = r.left + r.width / 2 - pw / 2
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
    const top = r.top - 4 < 60 ? r.bottom + 6 : r.top - p.offsetHeight - 6
    setPos({ left, top })
  }, [open, anchorRef])

  // Open-анимация (та же, что у .ctx / меню «три точки»).
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

  // Позиция бегунка в % — для заливки полосы (linear-gradient по --sp-p).
  const pct = ((rate - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100

  return createPortal(
    <div
      ref={ref}
      id="speedPicker"
      className="open"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: 'top center',
      }}
    >
      <div className="sp-presets">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`sp-card${rate === s ? ' active' : ''}`}
            onClick={() => setRate(s)}
          >
            <span className="sp-val">{speedLabel(s)}</span>
          </button>
        ))}
      </div>

      <div className="sp-slider">
        <div className="sp-slider-head">
          <span className="sp-slider-title">{t('player.speed.custom')}</span>
          <button
            type="button"
            className={`sp-cur${rate === 1 ? '' : ' on'}`}
            aria-label={t('player.speed.reset')}
            onClick={() => setRate(1)}
          >
            {speedLabel(rate)}
          </button>
        </div>
        <div className="sp-track">
          <input
            type="range"
            className="sp-range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            value={rate}
            aria-label={t('player.speed.custom')}
            style={{ ['--sp-p' as string]: `${pct}%` }}
            onChange={(e) => setRate(Number(e.target.value))}
          />
          {/* Засечки. Контейнер поджат на пол-бегунка с каждой стороны, иначе
              крайние риски не сходятся с центром thumb'а. */}
          <div className="sp-ticks">
            {TICKS.map((v) => (
              <span
                key={v}
                className={`sp-tick${(SPEEDS as readonly number[]).includes(v) ? ' major' : ''}`}
                style={{ left: `${((v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="sp-scale">
          <span>{speedLabel(SPEED_MIN)}</span>
          <span>{speedLabel(SPEED_MAX)}</span>
        </div>
      </div>

      <label className="sp-pitch">
        <span className="sp-pitch-text">
          <span className="sp-pitch-title">{t('player.speed.nightcore')}</span>
          <span className="sp-pitch-sub">{t('player.speed.nightcoreSub')}</span>
        </span>
        <span className="tele-sw sp-sw">
          <input
            type="checkbox"
            checked={nightcore}
            onChange={(e) => setNightcore(e.target.checked)}
          />
          <span className="tele-sw-track" />
        </span>
      </label>
    </div>,
    document.body,
  )
}
