import { useEffect, useRef, type ReactNode } from 'react'
import { ScLogo, YmLogo, YtmLogo, providerBrandColor } from '@entities/track'
import { useT, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { useLastfmStore } from '@features/lastfm'
import { useYmAuthStore } from '@features/yandex'
import { useSettingsStore } from '../model'
import { SectionTabs, useInk, inkVars } from './controls/SectionTabs'
import { subTabsOf } from './subTabs'

/**
 * Навигация настроек — до трёх рядов в шапке панели (см. side-sheet.css).
 *
 *   Основное · Оформление · Интеграции   ← группы, под активной едет линия
 *   [Система] Оверлей Аудио Эффективность…  ← секции группы, под активной едет пилюля
 *   [Плеер] Очередь и текст Мини-плеер…     ← подвкладки раздела (если они есть)
 *
 * Третий ряд рисуется здесь, а не внутри раздела: лёжа в `.s-section`, он
 * прокручивался вместе с карточками и проигрывал анимацию появления страницы
 * при каждой смене раздела (см. subTabs.ts).
 *
 * Все индикаторы («чернила») — абсолютные элементы, позицию которых меряем по
 * активной кнопке и гоняем через transform+width, поэтому переключение вкладки
 * плавно перевозит их на новое место, а не перекрашивает.
 */

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
  | 'interface'
  | 'view'
  | 'pages'
  | 'tabs'
  | 'medialib'
  // Интеграции
  | 'soundcloud'
  | 'ytmusic'
  | 'lastfm'
  | 'discord'
  | 'yandex'

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
 * Бренд-цвета интеграций без музыкального бейджа (Last.fm/Discord) — для
 * подсветки активной вкладки. Музыкальные площадки берут цвет из
 * `providerBrandColor` (общий с бейджами).
 */
const NAV_EXTRA_BRAND: Partial<Record<SectionId, string>> = {
  lastfm: '#D51007',
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
        id: 'interface',
        labelKey: 'settings.nav.interface',
        icon: <Ico name="sidebar" width={13} height={13} />,
      },
      {
        id: 'view',
        labelKey: 'settings.nav.player',
        icon: <Ico name="note" width={13} height={13} />,
      },
      {
        id: 'pages',
        labelKey: 'settings.nav.pages',
        icon: <Ico name="grid" width={13} height={13} />,
      },
      {
        id: 'tabs',
        labelKey: 'settings.nav.tabs',
        icon: <Ico name="windowFrame" width={13} height={13} />,
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
        id: 'yandex',
        labelKey: 'settings.nav.yandex',
        icon: <YmLogo size={13} />,
      },
      {
        id: 'ytmusic',
        brand: 'YouTube Music',
        icon: <YtmLogo size={13} />,
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

export const SettingsNav = ({
  active,
  onSelect,
  activeSub,
  onSelectSub,
}: {
  active: SectionId
  onSelect: (id: SectionId) => void
  /** Активная подвкладка текущего раздела (см. subTabs.ts). */
  activeSub: string
  onSelectSub: (id: string) => void
}) => {
  const t = useT()

  // Живой «зелёный индикатор» подключённых интеграций. Публичные площадки
  // (SoundCloud/YTM) работают без авторизации — всегда активны; остальные —
  // по факту логина/креденшелов/включённости (реактивно из их сторов).
  const lfmActive = useLastfmStore((s) => !!s.sk)
  const ymActive = useYmAuthStore((s) => s.authed)
  const discordActive = useSettingsStore((s) => s.discord_rpc)
  const activeIntegrations: Partial<Record<SectionId, boolean>> = {
    soundcloud: true,
    ytmusic: true,
    yandex: ymActive,
    lastfm: lfmActive,
    discord: discordActive,
  }

  // Метка секции: переводимый ключ либо литеральный бренд.
  const secLabel = (s: SectionDef): string => (s.labelKey ? t(s.labelKey) : s.brand ?? s.id)

  // Активная группа выводится из активной секции — отдельного состояния нет.
  const gi = Math.max(
    0,
    GROUPS.findIndex((g) => g.sections.some((s) => s.id === active)),
  )

  // Возврат в группу открывает ту секцию, на которой её оставили, а не первую.
  const lastSec = useRef<Record<number, SectionId>>({})
  useEffect(() => {
    lastSec.current[gi] = active
  }, [gi, active])

  const subTabs = subTabsOf(active)

  const gRef = useRef<HTMLDivElement>(null)
  const pRef = useRef<HTMLDivElement>(null)
  const gInk = useInk(gRef, gi)
  const pInk = useInk(pRef, active)

  return (
    <div className="sm-topnav" id="smNav">
      <div className="sm-gtabs" ref={gRef}>
        {GROUPS.map((grp, i) => (
          <button
            key={grp.labelKey}
            type="button"
            data-ink={i === gi ? '' : undefined}
            className={`sm-gtab${i === gi ? ' active' : ''}`}
            onClick={() => onSelect(lastSec.current[i] ?? GROUPS[i].sections[0].id)}
          >
            {t(grp.labelKey)}
          </button>
        ))}
        <span className="sm-gtab-ink" style={inkVars(gInk)} />
      </div>

      <div className="sm-ptabs" ref={pRef}>
        {/* Пилюля лежит ПЕРВОЙ, чтобы кнопки рисовались поверх неё. */}
        <span className="sm-ptab-ink" style={inkVars(pInk)} />
        {GROUPS[gi].sections.map((sec) => {
          const isActive = active === sec.id
          // Активная вкладка интеграции — иконка ВСЕГДА в бренд-цвете (не зависит
          // от тоггла «акцентные бейджи»); иначе наследует цвет вкладки.
          const brandC = isActive ? providerBrandColor(sec.id) ?? NAV_EXTRA_BRAND[sec.id] : undefined
          return (
            <button
              key={sec.id}
              type="button"
              data-ink={isActive ? '' : undefined}
              className={`sm-ptab${isActive ? ' active' : ''}`}
              onClick={() => onSelect(sec.id)}
            >
              <span className="sm-ptab-ico" style={brandC ? { color: brandC } : undefined}>
                {sec.icon}
              </span>
              <span className="sm-ptab-lbl">{secLabel(sec)}</span>
              {activeIntegrations[sec.id] && <span className="sm-ptab-live" />}
            </button>
          )
        })}
      </div>

      {/* Подвкладки раздела. Ряд НЕ перемонтируется при смене раздела (никакого
          `key`) — как и ряд секций выше при смене группы: набор кнопок меняется
          целиком, а пилюля переезжает на новое место, а не появляется рывком. */}
      {subTabs.length > 0 && (
        <SectionTabs
          tabs={subTabs.map((tb) => ({
            id: tb.id,
            label: t(tb.labelKey),
            icon: <Ico name={tb.icon} width={14} height={14} />,
          }))}
          active={activeSub}
          onSelect={onSelectSub}
        />
      )}
    </div>
  )
}
