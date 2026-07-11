import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ScLogo, YmLogo, SpLogo, YtmLogo, providerBrandColor } from '@entities/track'
import { useT, useLocale, dictionaries, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { useLastfmStore } from '@features/lastfm'
import { useSpAuthStore } from '@features/spotify'
import { useYmAuthStore } from '@features/yandex'
import { useGeniusStore } from '@features/lyrics'
import { useSettingsStore } from '../model'

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
  | 'library'
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
        id: 'library',
        labelKey: 'settings.nav.library',
        icon: <Ico name="library" width={13} height={13} />,
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
          <svg width="13" height="13" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M308.214,337.861l-5.663-13.064L253.93,209.107c-16.056-40.931-56.085-68.601-101.198-68.601c-61.043,0-110.576,51.706-110.576,115.524c0,63.756,49.533,115.493,110.576,115.493c42.618,0,79.604-25.164,98.062-62.007l19.668,47.329c-27.876,35.526-70.298,58.155-117.729,58.155C68.645,415.002,0.5,343.886,0.5,256.031c0-87.834,68.145-159.033,152.231-159.033c63.446,0,114.696,35.361,140.741,98.093c1.946,4.865,27.516,67.255,49.834,120.369c13.788,32.856,25.537,54.678,63.776,56.023c37.441,1.325,63.249-22.484,63.249-52.648c0-29.45-19.7-36.542-52.825-48.042c-59.543-20.486-90.308-41.065-90.308-90.401c0-48.115,31.303-80.205,82.295-80.205c33.137,0,57.162,15.424,73.756,46.169l-32.618,17.37c-12.235-17.909-25.765-25-42.97-25c-23.934,0-40.94,17.381-40.94,40.465c0,32.805,28.095,37.742,67.348,51.179c52.866,17.981,77.431,38.529,77.431,89.801c0,53.86-44.232,93.093-102.006,93.01C356.256,412.942,327.861,385.769,308.214,337.861z" />
          </svg>
        ),
      },
      {
        id: 'genius',
        brand: 'Genius',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.897 1.235c-.36.001-.722.013-1.08.017-.218-.028-.371.225-.352.416-.035 1.012.023 2.025-.016 3.036-.037.841-.555 1.596-1.224 2.08-.5.345-1.118.435-1.671.663.121.78.434 1.556 1.057 2.07 1.189 1.053 3.224.86 4.17-.426.945-1.071.453-2.573.603-3.854.286-.48.937-.132 1.317-.49-.34-1.249-.81-2.529-1.725-3.472a11.125 11.125 0 00-1.08-.04zm-10.42.006C.53 2.992-.386 5.797.154 8.361c.384 2.052 1.682 3.893 3.45 4.997.134-.23.23-.476.09-.73-.95-2.814-.138-6.119 1.986-8.19.014-.986.043-1.976-.003-2.961l-.188-.214c-1.003-.051-2.008 0-3.01-.022zm17.88.055l-.205.356c.265.938.6 1.862.72 2.834.58 3.546-.402 7.313-2.614 10.14-1.816 2.353-4.441 4.074-7.334 4.773-2.66.66-5.514.45-8.064-.543-.068.079-.207.237-.275.318 2.664 2.629 6.543 3.969 10.259 3.498 3.075-.327 5.995-1.865 8.023-4.195 1.935-2.187 3.083-5.07 3.125-7.992.122-3.384-1.207-6.819-3.636-9.19z" />
          </svg>
        ),
      },
      {
        id: 'discord',
        brand: 'Discord RPC',
        icon: (
          <svg width="14" height="11" viewBox="0 0 126.644 96" fill="currentColor">
            <path d="M81.15,0c-1.2376,2.1973-2.3489,4.4704-3.3591,6.794-9.5975-1.4396-19.3718-1.4396-28.9945,0-.985-2.3236-2.1216-4.5967-3.3591-6.794-9.0166,1.5407-17.8059,4.2431-26.1405,8.0568C2.779,32.5304-1.6914,56.3725.5312,79.8863c9.6732,7.1476,20.5083,12.603,32.0505,16.0884,2.6014-3.4854,4.8998-7.1981,6.8698-11.0623-3.738-1.3891-7.3497-3.1318-10.8098-5.1523.9092-.6567,1.7932-1.3386,2.6519-1.9953,20.281,9.547,43.7696,9.547,64.0758,0,.8587.7072,1.7427,1.3891,2.6519,1.9953-3.4601,2.0457-7.0718,3.7632-10.835,5.1776,1.97,3.8642,4.2683,7.5769,6.8698,11.0623,11.5419-3.4854,22.3769-8.9156,32.0509-16.0631,2.626-27.2771-4.496-50.9172-18.817-71.8548C98.9811,4.2684,90.1918,1.5659,81.1752.0505l-.0252-.0505ZM42.2802,65.4144c-6.2383,0-11.4159-5.6575-11.4159-12.6535s4.9755-12.6788,11.3907-12.6788,11.5169,5.708,11.4159,12.6788c-.101,6.9708-5.026,12.6535-11.3907,12.6535ZM84.3576,65.4144c-6.2637,0-11.3907-5.6575-11.3907-12.6535s4.9755-12.6788,11.3907-12.6788,11.4917,5.708,11.3906,12.6788c-.101,6.9708-5.026,12.6535-11.3906,12.6535Z" />
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
    exclude: [
      'settings.interface.sidebar',
      'settings.interface.titlebar',
      'settings.interface.nav',
      'settings.interface.cat.library',
      'settings.interface.libView',
      'settings.interface.libDensity',
      'settings.interface.libCols',
    ],
  },
  library: {
    include: [
      'settings.library.',
      'settings.interface.libView',
      'settings.interface.libDensity',
      'settings.interface.libCols',
    ],
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

  // Живой «зелёный индикатор» подключённых интеграций. Публичные площадки
  // (SoundCloud/YTM) работают без авторизации — всегда активны; остальные —
  // по факту логина/креденшелов/включённости (реактивно из их сторов).
  const lfmActive = useLastfmStore((s) => !!s.sk)
  const spActive = useSpAuthStore((s) => s.enabled)
  const ymActive = useYmAuthStore((s) => s.authed)
  const geniusActive = useGeniusStore((s) => !!s.token)
  const discordActive = useSettingsStore((s) => s.discord_rpc)
  const activeIntegrations: Partial<Record<SectionId, boolean>> = {
    soundcloud: true,
    ytmusic: true,
    spotify: spActive,
    yandex: ymActive,
    lastfm: lfmActive,
    genius: geniusActive,
    discord: discordActive,
  }

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
                  {activeIntegrations[sec.id] && <div className="s-nav-live" />}
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
