import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ScLogo, YmLogo, SpLogo, YtmLogo, providerBrandColor } from '@entities/track'
import { useT, useLocale, dictionaries, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Идентификаторы секций SM_CATS.
 * Каждой секции соответствует один компонент в `sections/`.
 */
export type SectionId =
  // Основное
  | 'system'
  | 'overlay'
  | 'audio'
  | 'efficiency'
  | 'hotkeys'
  | 'tele-storage'
  // Оформление
  | 'view'
  | 'interface'
  | 'tabs'
  | 'background'
  | 'medialib'
  // Интеграции
  | 'soundcloud'
  | 'ytmusic'
  | 'genius'
  | 'lastfm'
  | 'discord'
  | 'yandex'
  | 'spotify'

interface SectionDef {
  id: SectionId
  /** Ключ перевода метки; для брендов (SoundCloud, Last.fm…) — не задаётся. */
  labelKey?: TranslationKey
  /** Литеральная метка-бренд (не переводится). */
  brand?: string
  icon: ReactNode
  dot?: boolean
}

interface GroupDef {
  labelKey: TranslationKey
  sections: SectionDef[]
}

/**
 * Бренд-цвета интеграций без музыкального бейджа (Last.fm/Genius/Discord) — для
 * подсветки активной вкладки. Музыкальные площадки берут цвет из
 * `providerBrandColor` (общий с бейджами).
 */
const NAV_EXTRA_BRAND: Partial<Record<SectionId, string>> = {
  lastfm: '#D51007',
  genius: '#FFFF64',
  discord: '#5865F2',
}

/** SM_CATS. SVG-иконки скопированы оттуда же. */
const GROUPS: GroupDef[] = [
  {
    labelKey: 'settings.nav.group.main',
    sections: [
      {
        id: 'system',
        labelKey: 'settings.nav.system',
        icon: <Ico name="monitor" width={13} height={13} />,
      },
      {
        id: 'overlay',
        labelKey: 'settings.nav.overlay',
        icon: <Ico name="widget" width={13} height={13} />,
      },
      {
        id: 'audio',
        labelKey: 'settings.nav.audio',
        icon: <Ico name="eq" width={13} height={13} />,
      },
      {
        id: 'efficiency',
        labelKey: 'settings.nav.efficiency',
        icon: <Ico name="cpu" width={13} height={13} />,
      },
      {
        id: 'hotkeys',
        labelKey: 'settings.nav.hotkeys',
        icon: <Ico name="keyboard" width={13} height={13} />,
      },
      {
        id: 'tele-storage',
        labelKey: 'settings.nav.storage',
        icon: <Ico name="database" width={13} height={13} />,
      },
    ],
  },
  {
    labelKey: 'settings.nav.group.appearance',
    sections: [
      {
        id: 'view',
        labelKey: 'settings.nav.player',
        icon: <Ico name="note" width={13} height={13} />,
      },
      {
        id: 'interface',
        labelKey: 'settings.nav.interface',
        icon: <Ico name="sidebar" width={13} height={13} />,
      },
      {
        id: 'tabs',
        labelKey: 'settings.nav.tabs',
        icon: <Ico name="windowFrame" width={13} height={13} />,
      },
      {
        id: 'background',
        labelKey: 'settings.nav.background',
        icon: <Ico name="gallery" width={13} height={13} />,
      },
      {
        id: 'medialib',
        labelKey: 'settings.nav.customization',
        icon: <Ico name="album" width={13} height={13} />,
      },
    ],
  },
  {
    labelKey: 'settings.nav.group.integrations',
    sections: [
      {
        id: 'soundcloud',
        brand: 'SoundCloud',
        icon: <ScLogo size={13} />,
      },
      {
        id: 'ytmusic',
        brand: 'YouTube Music',
        icon: <YtmLogo size={13} />,
      },
      {
        id: 'spotify',
        brand: 'Spotify',
        icon: <SpLogo size={13} />,
      },
      {
        id: 'yandex',
        labelKey: 'settings.nav.yandex',
        icon: <YmLogo size={13} />,
      },
      {
        id: 'lastfm',
        brand: 'Last.fm',
        icon: (
          <svg width="14" height="9" viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
            <path d="M62 110 C28 110 8 88 8 68 C8 44 28 24 62 24 C82 24 96 32 106 44 C116 32 132 24 154 24 C176 24 192 36 198 54 L178 60 C174 48 166 42 154 42 C136 42 124 56 124 68 C124 80 136 94 154 94 C166 94 174 88 178 76 L198 82 C192 100 176 112 154 112 C132 112 116 104 106 92 C96 104 82 110 62 110 Z M62 42 C44 42 28 54 28 68 C28 82 44 94 62 94 C80 94 96 82 96 68 C96 54 80 42 62 42 Z" fill="currentColor" />
          </svg>
        ),
      },
      {
        id: 'genius',
        brand: 'Genius',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
          </svg>
        ),
      },
      {
        id: 'discord',
        brand: 'Discord RPC',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="9" cy="12" r="1" />
            <circle cx="15" cy="12" r="1" />
            <path d="M7.5 7.5c3.5-1 5.5-1 9 0" />
            <path d="M7 16.5c3.5 1 6.5 1 10 0" />
            <path d="M15.5 17c0 1 1.5 3 2 3 1.5 0 2.833-1.667 3.5-3 .667-1.333.5-5.833-1.5-11.5-1.457-1.015-3-1.5-4.5-1.5l-1 2.5" />
            <path d="M8.5 17c0 1-1.4 3-1.9 3-1.5 0-2.833-1.667-3.5-3-.667-1.333-.5-5.833 1.5-11.5 1.457-1.015 3-1.5 4.5-1.5l1 2.5" />
          </svg>
        ),
      },
    ],
  },
]

/**
 * Правила «в какой секции искать по содержимому». Поиск в шапке навигации ищет
 * не только по названиям вкладок, но и по подписям всех настроек внутри — для
 * этого сопоставляем каждой секции префиксы i18n-ключей, которые она рендерит.
 *
 * `exclude` нужен там, где секции делят общий namespace: например ключи
 * `settings.interface.sidebar*`/`titlebar*`/`nav*` физически лежат в разделе
 * «Вкладки» (перенесены из «Интерфейса»), а overlay-настройки в
 * `settings.view.ov*` — в разделе «Оверлей», а не «Плеер».
 */
const SEARCH_RULES: Record<SectionId, { include: string[]; exclude?: string[] }> = {
  system: { include: ['settings.system.', 'settings.about.'] },
  overlay: { include: ['settings.view.ov'] },
  audio: { include: ['settings.audio.'] },
  efficiency: { include: ['settings.efficiency.'] },
  hotkeys: { include: ['settings.hotkeys.'] },
  'tele-storage': { include: ['settings.storage.'] },
  view: { include: ['settings.view.'], exclude: ['settings.view.ov'] },
  interface: {
    include: ['settings.interface.'],
    exclude: ['settings.interface.sidebar', 'settings.interface.titlebar', 'settings.interface.nav'],
  },
  tabs: {
    include: [
      'settings.tabs.',
      'settings.interface.sidebar',
      'settings.interface.titlebar',
      'settings.interface.nav',
    ],
  },
  background: { include: ['settings.background.'] },
  medialib: { include: ['settings.custom.'] },
  soundcloud: { include: ['settings.sc.'] },
  ytmusic: { include: ['settings.ytm.'] },
  genius: { include: ['settings.genius.'] },
  lastfm: { include: ['settings.lastfm.'] },
  discord: { include: ['settings.discord.'] },
  yandex: { include: ['settings.ym.'] },
  spotify: { include: ['settings.sp.'] },
}

export const SettingsNav = ({
  active,
  onSelect,
}: {
  active: SectionId
  onSelect: (id: SectionId, query?: string) => void
}) => {
  const t = useT()
  const locale = useLocale()
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()

  // Метка секции: переводимый ключ либо литеральный бренд.
  const secLabel = (s: SectionDef): string => (s.labelKey ? t(s.labelKey) : s.brand ?? s.id)

  // Индекс содержимого секций для поиска: на каждую секцию — конкатенация всех
  // переведённых подписей её настроек (по правилам SEARCH_RULES). Пересобираем
  // только при смене языка.
  const contentIndex = useMemo(() => {
    const dict = dictionaries[locale]
    const keys = Object.keys(dict) as TranslationKey[]
    const idx = {} as Record<SectionId, string>
    for (const id of Object.keys(SEARCH_RULES) as SectionId[]) {
      const { include, exclude } = SEARCH_RULES[id]
      idx[id] = keys
        .filter((k) => include.some((p) => k.startsWith(p)) && !exclude?.some((p) => k.startsWith(p)))
        .map((k) => dict[k])
        .join('\n')
        .toLowerCase()
    }
    return idx
  }, [locale])

  // Секция видна в результатах, если запрос совпал с её меткой ИЛИ с подписью
  // любой настройки внутри неё.
  const secMatches = (s: SectionDef): boolean =>
    secLabel(s).toLowerCase().includes(q) || (contentIndex[s.id]?.includes(q) ?? false)

  return (
    <div className="settings-modal-nav" id="smNav">
      <div className="s-nav-search" style={{ marginBottom: 6 }}>
        <Ico name="search" width={13} height={13} />
        <input
          type="text"
          placeholder={t('settings.nav.search')}
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {GROUPS.map((grp) => {
        const visible = q ? grp.sections.filter(secMatches) : grp.sections
        if (visible.length === 0) return null
        // Fragment, не <div>! Иначе flex gap:2px на родителе не применяется
        // между sibling-items внутри группы. В старом smBuildNav() тоже
        // вставляет всё плоско в `#smNav` (без wrapper).
        return (
          <Fragment key={grp.labelKey}>
            <div className="s-nav-group">{t(grp.labelKey)}</div>
            {visible.map((sec) => {
              const isActive = active === sec.id
              // Активная вкладка интеграции — иконка ВСЕГДА в бренд-цвете (не зависит
              // от тоггла «акцентные бейджи»); иначе наследует цвет вкладки.
              const brandC = isActive
                ? providerBrandColor(sec.id) ?? NAV_EXTRA_BRAND[sec.id]
                : undefined
              return (
                <div
                  key={sec.id}
                  className={`s-nav-item${isActive ? ' active' : ''}`}
                  onClick={() => onSelect(sec.id, q || undefined)}
                >
                  <div className="s-nav-icon" style={brandC ? { color: brandC } : undefined}>
                    {sec.icon}
                  </div>
                  <span>{secLabel(sec)}</span>
                  <div className="s-nav-dot" />
                </div>
              )
            })}
          </Fragment>
        )
      })}
    </div>
  )
}
