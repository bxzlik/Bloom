import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavStore } from '@app/navigationStore'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { SettingsNav, type SectionId } from './SettingsNav'
import { InterfaceSection } from './sections/InterfaceSection'
import { ViewSection } from './sections/ViewSection'
import { PlaybackSection } from './sections/PlaybackSection'
import { HotkeysSection } from './sections/HotkeysSection'
import { DiscordSection } from './sections/DiscordSection'
import { OptimizationSection } from './sections/OptimizationSection'
import { DataSection } from './sections/DataSection'
import { TelemetrySection } from './sections/TelemetrySection'
import { AudioSection } from './sections/AudioSection'
import { CustomizationSection, BackgroundSection } from '@features/customization'
import { ScClientIdCard } from '@features/soundcloud'
import { GeniusTokenCard } from '@features/lyrics'
import { LastfmSection } from '@features/lastfm'
import { YandexSection } from '@features/yandex'

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

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    } else {
      setOpening(false)
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

  if (!mounted) return null

  // Маппинг secId → component. Сохраняем имена SM_CATS:
  //   system → PlaybackSection (запуск/трей/окно)
  //   interface → AppearanceSection (цвета)
  //   medialib → CustomizationSection (медиа-библиотека: фон/обложка/виз/курсор)
  //   discord → DiscordSection (полная конфигурация Discord RPC + preview)
  const sectionMap: Record<SectionId, ReactNode> = {
    // Основное
    system: <PlaybackSection />,
    efficiency: <OptimizationSection />,
    audio: <AudioSection />,
    hotkeys: <HotkeysSection />,
    data: <DataSection />,
    // Оформление
    view: <ViewSection />,
    interface: <InterfaceSection />,
    background: <BackgroundSection />,
    medialib: <CustomizationSection />,
    // Интеграции
    apikeys: (
      <div className="s-section active" id="ssec-apikeys">
        <ScClientIdCard />
        <GeniusTokenCard />
      </div>
    ),
    lastfm: <LastfmSection />,
    discord: <DiscordSection />,
    yandex: <YandexSection />,
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
            <SettingsNav active={section} onSelect={setSection} />
            <div className="settings-modal-content" id="smContent">
              {sectionMap[section]}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
