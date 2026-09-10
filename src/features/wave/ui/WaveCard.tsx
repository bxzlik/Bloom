import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import waveApi, { getWaveSource, setWaveSource } from '@/wave'
import { useYmAuthStore } from '@features/yandex'
import { usePopupOpenAnimation } from '@shared/hooks'
import { ScLogo, YmLogo, providerBrandColor } from '@entities/track'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { DislikesModal } from './DislikesModal'
import { WaveCollage } from './WaveCollage'

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

/** Точка открытия попапа: `right` = выравнивать по правому краю (кнопка «Настроить»). */
type MenuPos = { x: number; y: number; right?: boolean }

/**
 * Блок «Моя волна» на главной (#homeWaveCard / .home-wave-bar).
 *
 * Широкий баннер во всю ширину контента (паддинги .home-scroll гасятся
 * отрицательными полями, см. home.css): фон — полоса обложек того, что волна
 * играла бы сейчас (`WaveCollage`), поверх неё затемнение слева направо, слева
 * кнопка запуска + заголовок, справа снизу кнопка «Настроить».
 *
 * Настройка волны (источник + дизлайки) открывается кнопкой «Настроить» и по
 * ПКМ в любом месте блока. Переключатель источника SC/Яндекс показывается только
 * при логине в Яндекс: SC → движок Bloom (stations/related), Яндекс → нативный
 * rotor; выбор меняет и содержимое коллажа.
 */
export const WaveCard = () => {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [dislikesOpen, setDislikesOpen] = useState(false)
  // Координаты открытия (fixed) или null = закрыт. Попап рендерится порталом в
  // body — иначе его перекрывают блоки главной ниже (он заперт в стек-контексте
  // баннера). `clamped` — те же координаты после подгонки под окно (замер по
  // факту рендера, см. ниже); пока его нет, меню держим невидимым, чтобы не
  // мигнуло за краем экрана.
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const [clamped, setClamped] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const ymAuthed = useYmAuthStore((s) => s.authed)
  const [source, setSource] = useState<'sc' | 'ym'>(getWaveSource())
  // Разлогинились → источник 'ym' уже не валиден, показываем как 'sc'.
  const effSource = ymAuthed ? source : 'sc'

  usePopupOpenAnimation(menuRef, clamped)

  // ПКМ по любому месту блока волны — тот же попап, что и у кнопки «Настроить».
  // ГОЧА: попап и модалка дизлайков — порталы в body, но события React всплывают
  // по ДЕРЕВУ, а не по DOM, так что ПКМ внутри них тоже дошёл бы сюда. Отсекаем
  // по фактическому DOM-контейнеру карточки.
  const openMenu = (e: ReactMouseEvent) => {
    if (!rootRef.current?.contains(e.target as Node)) return
    e.preventDefault()
    e.stopPropagation()
    setClamped(null)
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  // Кнопка «Настроить»: попап падает ПОД кнопку и выравнивается по её правому
  // краю (ширину меню знаем только после рендера — отсюда флаг `right`).
  const openTune = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setClamped(null)
    setMenuPos({ x: r.right, y: r.bottom + 8, right: true })
  }

  const closeMenu = () => {
    setMenuPos(null)
    setClamped(null)
  }

  // Удерживаем меню в пределах окна (как у прочих контекстных меню).
  useLayoutEffect(() => {
    if (!menuPos || !menuRef.current) return
    const m = menuRef.current
    let x = menuPos.right ? menuPos.x - m.offsetWidth : menuPos.x
    let y = menuPos.y
    if (x + m.offsetWidth > window.innerWidth - 8) x = window.innerWidth - m.offsetWidth - 8
    if (y + m.offsetHeight > window.innerHeight - 8) y = window.innerHeight - m.offsetHeight - 8
    setClamped({ x: Math.max(8, x), y: Math.max(8, y) })
  }, [menuPos])

  // Закрытие при ресайзе/скролле — координаты fixed-попапа становятся неверными.
  useLayoutEffect(() => {
    if (!menuPos) return
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('keydown', onKey)
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
    <div ref={rootRef} className="home-wave-bar" id="homeWaveCard" onContextMenu={openMenu}>
      {/* Фон: полоса обложек + затемнение. Оба слоя в одной обёртке — маска
          снизу растворяет их в фон страницы одним куском. */}
      <div className="hwb-bg" aria-hidden="true">
        <WaveCollage source={effSource} />
        <span className="hwb-scrim" />
      </div>

      <div className="hwb-hero">
        <button
          className={`hwb-play${loading ? ' is-loading' : ''}`}
          id="homeWavePlayBtn"
          onClick={start}
          aria-label={t('wave.start')}
        >
          <Ico name="play" variant="bold" width={34} height={34} />
          <div className="hwb-spinner" aria-hidden="true" />
        </button>
        {/* Слова заголовка — отдельными строками (макет: «Моя» / «волна»).
            Ломаем по словам, а не по ширине: перенос не должен зависеть от
            языка и кегля. */}
        <h2 className="hwb-title">
          {t('wave.title')
            .split(/\s+/)
            .map((w, i) => (
              <span key={i}>{w}</span>
            ))}
        </h2>
      </div>

      <button className="hwb-tune" onClick={openTune}>
        <Ico name="tuning" width={18} height={18} />
        <span>{t('wave.tune')}</span>
      </button>

      <DislikesModal open={dislikesOpen} onClose={() => setDislikesOpen(false)} />
      {menuPos &&
        createPortal(
          <>
            {/* клик мимо (в т.ч. правый) — закрыть */}
            <div
              onClick={closeMenu}
              onContextMenu={(e) => {
                e.preventDefault()
                closeMenu()
              }}
              style={{ position: 'fixed', inset: 0, zIndex: 8000 }}
            />
            <div
              ref={menuRef}
              role="menu"
              className="wave-menu"
              style={{
                position: 'fixed',
                left: clamped?.x ?? menuPos.x,
                top: clamped?.y ?? menuPos.y,
                zIndex: 8001,
                // До замера координаты ещё «сырые» — прячем, чтобы меню не
                // мигнуло за краем окна.
                visibility: clamped ? 'visible' : 'hidden',
              }}
            >
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
                  closeMenu()
                  setDislikesOpen(true)
                }}
              >
                <Ico name="dislike" width={16} height={16} />
                <span>{t('wave.dislikes')}</span>
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
