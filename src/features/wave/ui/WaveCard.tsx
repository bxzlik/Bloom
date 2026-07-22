import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import waveApi, { getWaveSource, setWaveSource } from '@/wave'
import { useYmAuthStore } from '@features/yandex'
import { usePlayerStore } from '@features/player/model/store'
import { extractCoverHsl, useThemeStore } from '@features/settings'
import { usePopupOpenAnimation } from '@shared/hooks'
import { ScLogo, YmLogo, providerBrandColor } from '@entities/track'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { DislikesModal } from './DislikesModal'

/**
 * Палитра свечения «Моей волны» как CSS-переменные. Все три орба красятся в
 * ОДИН цвет: по умолчанию — акцент темы, при играющем треке — тон его обложки.
 */
type WavePalette = { '--wave-1': string; '--wave-2': string; '--wave-3': string }
type Hsl = { h: number; s: number; l: number }

/**
 * Один тон → ОДИН цвет пламени на все три орба. Объём даёт не разница оттенков,
 * а разная прозрачность стопов в CSS, поэтому шар читается как единый цвет.
 * Ахроматичный тон (белый/серый) не выдумываем — свечение нейтральное.
 */
const hexToHsl = (hex: string): Hsl => {
  let x = (hex || '').trim().replace('#', '')
  if (x.length === 3) x = x.split('').map((c) => c + c).join('')
  if (x.length !== 6 || /[^0-9a-f]/i.test(x)) return { h: 0, s: 0, l: 1 }
  const r = parseInt(x.slice(0, 2), 16) / 255
  const g = parseInt(x.slice(2, 4), 16) / 255
  const b = parseInt(x.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s, l }
}

const paletteFromHsl = ({ h, s, l }: Hsl): WavePalette => {
  const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
  if (s < 0.08) return WHITE_PALETTE
  const S = Math.round(clamp(s * 100, 30, 85))
  const H = (((h % 360) + 360) % 360)
  const L = Math.round(clamp(l * 100 + 6, 46, 66))
  const color = `hsl(${H} ${S}% ${L}%)`
  return { '--wave-1': color, '--wave-2': color, '--wave-3': color }
}

/** Ахроматичный акцент (белый/серый) → белое свечение, тон не выдумываем. */
const WHITE_PALETTE: WavePalette = { '--wave-1': '#fff', '--wave-2': '#fff', '--wave-3': '#fff' }

/**
 * Площадки-источники «Моей волны» для попапа настройки. `provider` — ключ для
 * бренд-цвета: выбранная площадка красит САМО лого, подложки/заливки нет.
 */
const WAVE_SOURCES = [
  { id: 'sc', provider: 'soundcloud', size: 21, Logo: ScLogo },
  { id: 'ym', provider: 'yandex', size: 20, Logo: YmLogo },
] as const satisfies ReadonlyArray<{
  id: 'sc' | 'ym'
  provider: string
  size: number
  Logo: (p: { size: number }) => ReactElement
}>

/**
 * Аура-пламя (SVG). Вынесена в мемо-компонент БЕЗ пропсов: цвета приходят через
 * CSS-переменные --wave-* на родителе, поэтому от палитры не зависит. Мемо не
 * даёт ре-рендерам WaveCard (смена палитры при прогрузке обложки и т.п.)
 * перерисовывать SVG и сбрасывать SMIL-анимацию — она крутится непрерывно.
 */
const WaveAura = memo(function WaveAura() {
  return (
    <div className="hwb-aura" aria-hidden="true">
      {/* Турбулентное пламя: цветные радиальные градиенты искажаются фрактальным
          шумом (feDisplacementMap) → живые огненные язычки. */}
      <svg className="hwb-fire" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="hwbOuter" cx="50%" cy="50%" r="55%">
            <stop offset="0%" className="hwb-s-outer0" />
            <stop offset="60%" className="hwb-s-outer1" />
            <stop offset="100%" className="hwb-s-trans" />
          </radialGradient>
          <radialGradient id="hwbBody" cx="50%" cy="52%" r="52%">
            <stop offset="0%" className="hwb-s-body0" />
            <stop offset="65%" className="hwb-s-body1" />
            <stop offset="100%" className="hwb-s-trans" />
          </radialGradient>
          <radialGradient id="hwbCore" cx="50%" cy="55%" r="50%">
            <stop offset="0%" className="hwb-s-core0" />
            <stop offset="55%" className="hwb-s-core1" />
            <stop offset="100%" className="hwb-s-trans" />
          </radialGradient>
          <filter id="hwbDistort" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            {/* Всё движение — на CSS (вращение .hwb-fire-g + пульс .hwb-fire).
                SMIL не используем: он перезапускается при инвалидации фильтра
                (смена --wave-* при прогрузке обложки) → «сброс через 5с». */}
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.015" numOctaves="2" seed="4" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="72" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g className="hwb-fire-g" filter="url(#hwbDistort)">
          <circle cx="200" cy="188" r="150" fill="url(#hwbOuter)" />
          <circle cx="200" cy="196" r="112" fill="url(#hwbBody)" />
          <circle cx="200" cy="206" r="66" fill="url(#hwbCore)" />
        </g>
      </svg>
    </div>
  )
})

/**
 * Карточка «Моя волна» на главной (#homeWaveCard / .home-wave-bar).
 *: прозрачный бар с двумя анимированными волнами-линиями,
 * большая кнопка play (запуск персональной волны) и заголовок.
 *
 * Переключатель источника SC/Яндекс показывается только при
 * логине в Яндекс: SC → движок Bloom (stations/related), Яндекс → нативный rotor.
 *
 * Отложено (зависит от немигрированных фич): аватары сидов.
 */
export const WaveCard = () => {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [dislikesOpen, setDislikesOpen] = useState(false)
  // Координаты открытого попапа (fixed) или null = закрыт. Попап рендерится
  // порталом в body — иначе его перекрывают блоки главной ниже (он заперт в
  // стек-контексте .hwb-hero, z-index:2). `cx` — центр кнопки по X (попап
  // центрируется под ней через translateX(-50%) на внешней обёртке).
  const [menuPos, setMenuPos] = useState<{ top: number; cx: number } | null>(null)
  const tuneBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const ymAuthed = useYmAuthStore((s) => s.authed)
  const [source, setSource] = useState<'sc' | 'ym'>(getWaveSource())
  // Разлогинились → источник 'ym' уже не валиден, показываем как 'sc'.
  const effSource = ymAuthed ? source : 'sc'
  // Цвет свечения: по умолчанию — акцент темы, при играющем треке — тон обложки.
  const artwork = usePlayerStore((s) => s.artwork)
  const accent = useThemeStore((s) => s.accent)
  const [palette, setPalette] = useState<WavePalette>(() => paletteFromHsl(hexToHsl(accent)))
  useEffect(() => {
    const fallback = paletteFromHsl(hexToHsl(accent))
    if (!artwork) {
      setPalette(fallback)
      return
    }
    let cancelled = false
    void extractCoverHsl(artwork).then((hsl) => {
      if (!cancelled) setPalette(hsl ? paletteFromHsl(hsl) : fallback)
    })
    return () => {
      cancelled = true
    }
  }, [artwork, accent])

  usePopupOpenAnimation(menuRef, menuPos)

  const toggleMenu = () => {
    if (menuPos) {
      setMenuPos(null)
      return
    }
    const r = tuneBtnRef.current?.getBoundingClientRect()
    if (!r) return
    setMenuPos({ top: r.bottom + 8, cx: r.left + r.width / 2 })
  }

  // Закрытие при ресайзе/скролле — координаты fixed-попапа становятся неверными.
  useLayoutEffect(() => {
    if (!menuPos) return
    const close = () => setMenuPos(null)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menuPos])

  const pickSource = (s: 'sc' | 'ym') => {
    setWaveSource(s)
    setSource(s)
  }

  const start = async () => {
    if (loading) return
    setLoading(true)
    try {
      await waveApi.startPersonal()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home-wave-bar" id="homeWaveCard" style={palette as CSSProperties}>
      <WaveAura />
      <div className="hwb-hero">
        <div className="hwb-hero-main">
          <button
            className={`hwb-play${loading ? ' is-loading' : ''}`}
            id="homeWavePlayBtn"
            onClick={start}
            aria-label={t('wave.start')}
          >
            <Ico name="play" width={56} height={56} />
            <div className="hwb-spinner" aria-hidden="true" />
          </button>
          <div className="hwb-title">{t('wave.title')}</div>
        </div>
        <button
          ref={tuneBtnRef}
          className="hwb-tune"
          onClick={(e) => {
            e.stopPropagation()
            toggleMenu()
          }}
          aria-haspopup="menu"
          aria-expanded={menuPos !== null}
        >
          <Ico name="tuning" width={14} height={14} />
          <span>{t('wave.tune')}</span>
        </button>
      </div>
      <DislikesModal open={dislikesOpen} onClose={() => setDislikesOpen(false)} />
      {menuPos &&
        createPortal(
          <>
            {/* клик мимо — закрыть */}
            <div
              onClick={() => setMenuPos(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 8000 }}
            />
            {/* Внешняя обёртка центрирует попап под кнопкой (translateX(-50%)).
                Анимация масштаба живёт на внутреннем menuRef, чтобы WAAPI не
                затирал этот перенос. */}
            <div
              style={{
                position: 'fixed',
                top: menuPos.top,
                left: menuPos.cx,
                zIndex: 8001,
                transform: 'translateX(-50%)',
              }}
            >
            <div ref={menuRef} role="menu" className="wave-menu">
              {ymAuthed && (
                <div role="radiogroup" aria-label={t('wave.pickSource')} className="wave-src-row">
                  {WAVE_SOURCES.map((s) => (
                    <button
                      key={s.id}
                      role="radio"
                      aria-checked={effSource === s.id}
                      aria-label={s.id === 'sc' ? 'SoundCloud' : t('settings.nav.yandex')}
                      className={`wave-src${effSource === s.id ? ' is-on' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        pickSource(s.id)
                      }}
                      // Лого выбранной площадки — всегда её брендовый цвет
                      // (не акцент темы: у белого акцента лого стало бы белым).
                      style={{ '--src-fg': providerBrandColor(s.provider) } as CSSProperties}
                    >
                      {/* Бейдж — только лого, без подписи. */}
                      <s.Logo size={s.size} />
                    </button>
                  ))}
                </div>
              )}
              <button
                role="menuitem"
                className="wave-dislikes"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuPos(null)
                  setDislikesOpen(true)
                }}
              >
                <Ico name="dislike" width={16} height={16} />
                <span>{t('wave.dislikes')}</span>
              </button>
            </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
