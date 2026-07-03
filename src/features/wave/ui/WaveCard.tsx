import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import waveApi, { getWaveSource, setWaveSource } from '@/wave'
import { useYmAuthStore } from '@features/yandex'
import { usePlayerStore } from '@features/player/model/store'
import { extractCoverHsl, useThemeStore } from '@features/settings'
import { usePopupOpenAnimation } from '@shared/hooks'
import { ScLogo, YmLogo, providerBrandColor } from '@entities/track'
import { useBadgePrefs } from '@shared/lib/badgePrefs'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { DislikesModal } from './DislikesModal'

/**
 * Палитра свечения «Моей волны» (3 орба: тёмный внешний → мид → горячее ядро)
 * как CSS-переменные. Строится вокруг одного тона: по умолчанию — акцент темы,
 * при играющем треке — доминантный тон его обложки.
 */
type WavePalette = { '--wave-1': string; '--wave-2': string; '--wave-3': string }
type Hsl = { h: number; s: number; l: number }

/** hex (#rgb/#rrggbb) → HSL (h 0–360, s/l 0–1). Невалидный → тёплый дефолт. */
const hexToHsl = (hex: string): Hsl => {
  let x = (hex || '').trim().replace('#', '')
  if (x.length === 3) x = x.split('').map((c) => c + c).join('')
  if (x.length !== 6 || /[^0-9a-f]/i.test(x)) return { h: 24, s: 1, l: 0.5 }
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

/**
 * Один тон → 3 цвета пламени (внешний флейр → тело → светлое ядро). Тон близко
 * к исходному (акцент/обложка), сатурация не задирается — цвет верный. Если
 * акцент ахроматичный (белый/серый), тон не выдумываем: свечение нейтральное.
 */
const paletteFromHsl = ({ h, s, l }: Hsl): WavePalette => {
  const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
  const achromatic = s < 0.08
  const S = achromatic ? 0 : Math.round(clamp(s * 100, 30, 85))
  const hue = (d: number): number => (achromatic ? 0 : (((h + d) % 360) + 360) % 360)
  const Lo = Math.round(clamp(l * 100 - 2, 34, 54)) // внешний флейр
  const Lb = Math.round(clamp(l * 100 + 6, 42, 62)) // тело
  const Lc = Math.round(clamp(l * 100 + 22, 60, 82)) // ядро — светлое/выбеленное
  return {
    '--wave-1': `hsl(${hue(-24)} ${S}% ${Lo}%)`,
    '--wave-2': `hsl(${hue(0)} ${S}% ${Lb}%)`,
    '--wave-3': `hsl(${hue(16)} ${achromatic ? 0 : Math.round(S * 0.85)}% ${Lc}%)`,
  }
}

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
  // Бренд-режим иконок (настройка «акцентные бейджи» выключена).
  const brand = !useBadgePrefs((s) => s.accentBadges)

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
            <div
              ref={menuRef}
              role="menu"
              style={{
                transformOrigin: 'top center',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minWidth: 220,
                padding: 10,
                background: 'color-mix(in srgb,var(--block-color),var(--text) 1%)',
                border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 'calc(var(--radius)*.7)',
                boxShadow: '0 20px 60px rgba(0,0,0,.85),0 6px 20px rgba(0,0,0,.5),0 0 0 0.5px rgba(255,255,255,.04)',
              }}
            >
              {ymAuthed && (
                <div
                  role="radiogroup"
                  aria-label={t('wave.pickSource')}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 4,
                    padding: 3,
                    background: 'rgba(255,255,255,.05)',
                    borderRadius: 'calc(var(--radius)*.6)',
                  }}
                >
                  {(['sc', 'ym'] as const).map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={effSource === s}
                      aria-label={s === 'sc' ? 'SoundCloud' : t('settings.nav.yandex')}
                      onClick={(e) => {
                        e.stopPropagation()
                        pickSource(s)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        // Лёгкое серое выделение вместо акцентного цвета.
                        background: effSource === s ? 'rgba(255,255,255,.12)' : 'none',
                        color: 'var(--text)',
                        padding: '9px 8px',
                        borderRadius: 'calc(var(--radius)*.45)',
                        cursor: 'pointer',
                        transition: '.15s',
                      }}
                    >
                      {/* Бейдж — только лого, без подписи. */}
                      <span
                        style={{
                          display: 'flex',
                          color: brand ? providerBrandColor(s === 'sc' ? 'soundcloud' : 'yandex') : undefined,
                        }}
                      >
                        {s === 'sc' ? <ScLogo size={17} /> : <YmLogo size={16} />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuPos(null)
                  setDislikesOpen(true)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  border: 'none',
                  background: 'rgba(255,255,255,.05)',
                  color: 'var(--text)',
                  padding: '10px 12px',
                  borderRadius: 'calc(var(--radius)*.5)',
                  cursor: 'pointer',
                  transition: '.15s',
                  fontFamily: 'var(--font)',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'left',
                }}
              >
                <Ico name="dislike" width={17} height={17} />
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
