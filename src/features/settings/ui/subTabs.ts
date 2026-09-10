import type { TranslationKey } from '@shared/i18n'
import type { IconName } from '@shared/ui/icons/solar'
import type { SectionId } from './SettingsNav'

/**
 * Подвкладки разделов настроек — третий ряд шапки панели.
 *
 * Раньше каждый раздел держал свой `useState` и рисовал полосу `.s-ptabs`
 * ПЕРВЫМ элементом контента. Из-за этого ряд жил внутри `.s-section`: уезжал
 * вместе с прокруткой карточек и проигрывал `sSecIn` при каждой смене раздела —
 * то есть анимировался «страницей», хотя по смыслу он часть навигации.
 *
 * Теперь набор вкладок объявлен здесь, активная живёт в `SettingsOverlay`
 * (по одной на раздел — возврат открывает ту, на которой раздел оставили),
 * рисует ряд `SettingsNav`, а раздел получает готовый `tab` пропом.
 */
export interface SubTabDef<T extends string = string> {
  id: T
  labelKey: TranslationKey
  icon: IconName
}

/** «Интерфейс»: сам интерфейс и всё про боковые панели. */
export type IfaceTab = 'interface' | 'panels'
/** «Плеер»: плеер, очередь и текст, мини-плеер, анимации. */
export type ViewTab = 'player' | 'queue' | 'mini' | 'anim'
/** «Страницы»: главная и библиотека. */
export type PageTab = 'home' | 'library'
/** «Вкладки»: сайдбар и тайтлбар. */
export type TabsTab = 'sidebar' | 'titlebar'

export const SUB_TABS = {
  interface: [
    { id: 'interface', labelKey: 'settings.interface.title', icon: 'palette' },
    { id: 'panels', labelKey: 'settings.interface.cat.panels', icon: 'sidebar' },
  ],
  view: [
    { id: 'player', labelKey: 'settings.view.cat.player', icon: 'note' },
    { id: 'queue', labelKey: 'settings.view.cat.queueLyrics', icon: 'lyrics' },
    { id: 'mini', labelKey: 'settings.view.cat.miniPlayer', icon: 'widget' },
    { id: 'anim', labelKey: 'settings.view.cat.anim', icon: 'stars' },
  ],
  pages: [
    { id: 'home', labelKey: 'nav.home', icon: 'home' },
    { id: 'library', labelKey: 'settings.nav.library', icon: 'library' },
  ],
  tabs: [
    { id: 'sidebar', labelKey: 'settings.tabs.cat.sidebar', icon: 'sidebar' },
    { id: 'titlebar', labelKey: 'settings.tabs.cat.titlebar', icon: 'windowFrame' },
  ],
} as const satisfies Partial<Record<SectionId, readonly SubTabDef[]>>

/** Вкладки раздела (пусто — у раздела подвкладок нет). */
export const subTabsOf = (sec: SectionId): readonly SubTabDef[] =>
  (SUB_TABS as Partial<Record<SectionId, readonly SubTabDef[]>>)[sec] ?? []

/** Вкладка раздела по умолчанию — первая. */
export const defaultSubTab = (sec: SectionId): string => subTabsOf(sec)[0]?.id ?? ''
