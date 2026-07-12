import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavStore } from '@app/navigationStore'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { SettingsNav, type SectionId } from './SettingsNav'
import { InterfaceSection } from './sections/InterfaceSection'
import { LibrarySection } from './sections/LibrarySection'
import { TabsSection } from './sections/TabsSection'
import { ViewSection } from './sections/ViewSection'
import { OverlaySection } from './sections/OverlaySection'
import { PlaybackSection } from './sections/PlaybackSection'
import { HotkeysSection } from './sections/HotkeysSection'
import { DiscordSection } from './sections/DiscordSection'
import { OptimizationSection } from './sections/OptimizationSection'
import { TelemetrySection } from './sections/TelemetrySection'
import { AudioSection } from './sections/AudioSection'
import { CustomizationSection, BackgroundSection } from '@features/customization'
import { ScClientIdCard } from '@features/soundcloud'
import { GeniusTokenCard } from '@features/lyrics'
import { LastfmSection } from '@features/lastfm'
import { YandexSection } from '@features/yandex'
import { SpotifySection } from '@features/spotify'
import { YtmSection } from '@features/ytmusic'

/**
 * Модалка настроек `#settingsOverlay`.
 *
 * Иерархия классов из CSS:
 *   #settingsOverlay.open
 *     .settings-modal
 *       .settings-modal-close-abs (✕ в правом верхнем углу, абсолютно)
 *       .settings-modal-body
 *         .sm-cat-view (sidebar + content)
 *           .settings-modal-nav#smNav (185px, .s-nav-search + .s-nav-group + .s-nav-item)
 *           .settings-modal-content#smContent (.s-section.active с .sc-карточками)
 *
 * Поведение:
 *   - Открытие через `useNavStore.openSettings()` (sidebar gear)
 *   - Esc + backdrop click — закрытие
 *   - Анимация .open class (opacity .26s + scale/translate .32s) — CSS
 *   - smGrid (главный экран категорий) отключён в CSS правилом
 *     `.sm-grid-view{display:none!important}` — сразу cat-view.
 */
export const SettingsOverlay = () => {
  const open = useNavStore((s) => s.settingsOpen)
  const close = useNavStore((s) => s.closeSettings)
  const [section, setSection] = useState<SectionId>('system')
  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  // Текст поискового запроса, по которому открыли секцию — чтобы подсветить и
  // прокрутить к найденной настройке внутри. null → обычная навигация.
  const [highlight, setHighlight] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    } else {
      setOpening(false)
      setHighlight(null)
    }
  }, [open])

  // Esc → закрыть.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // При смене секции сбрасываем прокрутку контента наверх — иначе новая вкладка
  // открывается «пролистанной» на позиции предыдущей. Если открыли секцию через
  // поиск (highlight) — не трогаем: ниже свой скролл к найденной настройке.
  useEffect(() => {
    if (highlight) return
    contentRef.current?.scrollTo({ top: 0 })
  }, [section, highlight])

  // Подсветка + скролл к настройке, найденной поиском. После рендера секции ищем
  // первый текстовый узел, содержащий запрос, и подсвечиваем ИМЕННО совпавший
  // текст (а не блок) через CSS Custom Highlight API — без мутации DOM, чтобы не
  // ломать React. Фолбэк (если API недоступен) — класс на строке-подписи.
  useEffect(() => {
    if (!highlight) return
    const root = contentRef.current
    if (!root) return
    const q = highlight.toLowerCase()
    const labels = root.querySelectorAll<HTMLElement>(
      '.sl2, .sc-title, .s-cat-label, h3, .tele-toggle-title, .tele-data-name, .tele-gauge-label',
    )
    let node: Text | null = null
    let el: HTMLElement | null = null
    let idx = -1
    for (const cand of labels) {
      const walker = document.createTreeWalker(cand, NodeFilter.SHOW_TEXT)
      let n = walker.nextNode()
      while (n) {
        const i = (n.textContent ?? '').toLowerCase().indexOf(q)
        if (i >= 0) {
          node = n as Text
          el = cand
          idx = i
          break
        }
        n = walker.nextNode()
      }
      if (node) break
    }
    if (!node || !el) return

    const card = (el.closest('.sc, .tele-data-row, .tele-stat-card') as HTMLElement | null) ?? el
    card.scrollIntoView({ block: 'center', behavior: 'smooth' })

    const HL = 'settings-search'
    const highlights = (window as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS
      ?.highlights
    const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    if (highlights && HighlightCtor) {
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, idx + q.length)
      highlights.set(HL, new HighlightCtor(range))
      const tm = setTimeout(() => highlights.delete(HL), 2200)
      return () => {
        clearTimeout(tm)
        highlights.delete(HL)
      }
    }

    // Фолбэк: подсветить строку-подпись целиком.
    el.classList.add('s-hl')
    const target = el
    const tm = setTimeout(() => target.classList.remove('s-hl'), 1900)
    return () => {
      clearTimeout(tm)
      target.classList.remove('s-hl')
    }
  }, [highlight, section])

  if (!mounted) return null

  // Маппинг secId → component. Сохраняем имена SM_CATS:
  //   system → PlaybackSection (запуск/трей/окно)
  //   interface → InterfaceSection (тема/цвета/вид/шрифт/прозрачность/язык)
  //   medialib → CustomizationSection (медиа-библиотека: фон/обложка/виз/курсор)
  //   discord → DiscordSection (полная конфигурация Discord RPC + preview)
  const sectionMap: Record<SectionId, ReactNode> = {
    // Основное
    system: <PlaybackSection />,
    overlay: <OverlaySection />,
    efficiency: <OptimizationSection />,
    audio: <AudioSection />,
    hotkeys: <HotkeysSection />,
    // Оформление
    view: <ViewSection />,
    interface: <InterfaceSection />,
    library: <LibrarySection />,
    tabs: <TabsSection />,
    background: <BackgroundSection />,
    medialib: <CustomizationSection />,
    // Интеграции
    soundcloud: <ScClientIdCard />,
    ytmusic: <YtmSection />,
    genius: <GeniusTokenCard />,
    lastfm: <LastfmSection />,
    discord: <DiscordSection />,
    yandex: <YandexSection />,
    spotify: <SpotifySection />,
    // Телеметрия
    'tele-storage': <TelemetrySection />,
  }

  return createPortal(
    <div
      id="settingsOverlay"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div className="settings-modal">
        <div className="settings-modal-body">
          <div className="sm-cat-view">
            <SettingsNav
              active={section}
              onSelect={(id, query) => {
                setSection(id)
                setHighlight(query ?? null)
              }}
            />
            <div className="settings-modal-content" id="smContent" ref={contentRef}>
              {sectionMap[section]}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
