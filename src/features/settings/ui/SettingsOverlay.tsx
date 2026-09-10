import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavStore } from '@app/navigationStore'
import { SideSheet } from '@shared/ui'
import { SettingsNav, type SectionId } from './SettingsNav'
import {
  defaultSubTab,
  type IfaceTab,
  type PageTab,
  type TabsTab,
  type ViewTab,
} from './subTabs'
import { InterfaceSection } from './sections/InterfaceSection'
import { PagesSection } from './sections/PagesSection'
import { TabsSection } from './sections/TabsSection'
import { ViewSection } from './sections/ViewSection'
import { OverlaySection } from './sections/OverlaySection'
import { PlaybackSection } from './sections/PlaybackSection'
import { HotkeysSection } from './sections/HotkeysSection'
import { DiscordSection } from './sections/DiscordSection'
import { OptimizationSection } from './sections/OptimizationSection'
import { TelemetrySection } from './sections/TelemetrySection'
import { AudioSection } from './sections/AudioSection'
import { CustomizationSection } from '@features/customization'
import { ScClientIdCard } from '@features/soundcloud'
import { LastfmSection } from '@features/lastfm'
import { YandexSection } from '@features/yandex'
import { YtmSection } from '@features/ytmusic'

/**
 * Настройки — боковая панель «в полокна» (SideSheet, слева, широкая).
 *
 * Каркас — общий с drawer'ами (см. shared/styles/side-sheet.css): панель
 * впритык к левой кромке, приложение уходит в перспективу вправо. Обёртка
 * `#settingsOverlay` осталась ВНУТРИ панели, хотя оверлеем больше не является:
 * на этот id завязаны цвета карточек, --card-solid и ховеры в overrides-main.css
 * и transparency.css. Её оверлейные свойства гасятся в settings.css
 * (блок «Настройки внутри боковой панели»).
 *
 * Иерархия классов из CSS:
 *   #settingsOverlay.open
 *     .settings-modal
 *       .settings-modal-body
 *         .sm-cat-view (колонка: навигация сверху, контент снизу)
 *           .sm-topnav#smNav (.sm-gtabs — группы, .sm-ptabs — секции,
 *                             .s-ptabs — подвкладки раздела)
 *           .settings-modal-content#smContent (.s-section.active с .sc-карточками)
 *
 * Поведение:
 *   - Открытие через `useNavStore.openSettings()` (sidebar gear)
 *   - Esc (свой обработчик, с preventDefault) + клик по ушедшему приложению
 *   - Выезд и демонтаж — на SideSheet
 */
export const SettingsOverlay = () => {
  const open = useNavStore((s) => s.settingsOpen)
  const close = useNavStore((s) => s.closeSettings)
  const [section, setSection] = useState<SectionId>('system')
  // Подвкладка раздела («Плеер» → Очередь и текст и т.п.) живёт здесь, а ряд
  // рисует SettingsNav: внутри раздела он прокручивался и анимировался вместе
  // с карточками (см. subTabs.ts). Запоминаем по разделу — возврат открывает ту
  // вкладку, на которой раздел оставили.
  const [subTabs, setSubTabs] = useState<Partial<Record<SectionId, string>>>({})
  const sub = subTabs[section] ?? defaultSubTab(section)
  const contentRef = useRef<HTMLDivElement>(null)

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

  // При смене секции (и подвкладки) сбрасываем прокрутку контента наверх — иначе
  // новая вкладка открывается «пролистанной» на позиции предыдущей.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [section, sub])

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
    // Оформление (разделы с подвкладками получают активную пропом из шапки)
    view: <ViewSection tab={sub as ViewTab} />,
    interface: <InterfaceSection tab={sub as IfaceTab} />,
    pages: <PagesSection tab={sub as PageTab} />,
    tabs: <TabsSection tab={sub as TabsTab} />,
    medialib: <CustomizationSection />,
    // Интеграции
    soundcloud: <ScClientIdCard />,
    ytmusic: <YtmSection />,
    lastfm: <LastfmSection />,
    discord: <DiscordSection />,
    yandex: <YandexSection />,
    // Телеметрия
    'tele-storage': <TelemetrySection />,
  }

  return (
    <SideSheet open={open} onClose={close} side="left" wide escClose={false}>
      <div id="settingsOverlay" className="open sm-in-sheet">
        <div className="settings-modal">
          <div className="settings-modal-body">
            <div className="sm-cat-view">
              <SettingsNav
                active={section}
                onSelect={setSection}
                activeSub={sub}
                onSelectSub={(id) => setSubTabs((prev) => ({ ...prev, [section]: id }))}
              />
              <div className="settings-modal-content" id="smContent" ref={contentRef}>
                {sectionMap[section]}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SideSheet>
  )
}
