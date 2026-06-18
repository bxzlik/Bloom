import { Fragment, useState, type ReactNode } from 'react'
import { ScLogo, YmLogo } from '@entities/track'
import { useT, type TranslationKey } from '@shared/i18n'

/**
 * Идентификаторы секций SM_CATS.
 * Каждой секции соответствует один компонент в `sections/`.
 */
export type SectionId =
  // Основное
  | 'system'
  | 'audio'
  | 'efficiency'
  | 'hotkeys'
  | 'tele-storage'
  // Оформление
  | 'view'
  | 'interface'
  | 'background'
  | 'medialib'
  // Интеграции
  | 'soundcloud'
  | 'genius'
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

/** SM_CATS. SVG-иконки скопированы оттуда же. */
const GROUPS: GroupDef[] = [
  {
    labelKey: 'settings.nav.group.main',
    sections: [
      {
        id: 'system',
        labelKey: 'settings.nav.system',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        ),
      },
      {
        id: 'audio',
        labelKey: 'settings.nav.audio',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <polyline points="22 8 22 16" />
            <polyline points="18 10 18 14" />
            <polyline points="14 4 14 20" />
            <polyline points="10 8 10 16" />
            <polyline points="6 11 6 13" />
            <polyline points="2 10 2 14" />
          </svg>
        ),
      },
      {
        id: 'efficiency',
        labelKey: 'settings.nav.efficiency',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.34 19a10 10 0 1 1 17.32 0" />
            <path d="m12 12 4-3" />
          </svg>
        ),
      },
      {
        id: 'hotkeys',
        labelKey: 'settings.nav.hotkeys',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
          </svg>
        ),
      },
      {
        id: 'tele-storage',
        labelKey: 'settings.nav.storage',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        ),
      },
    ],
  },
  {
    labelKey: 'settings.nav.group.appearance',
    sections: [
      {
        id: 'view',
        labelKey: 'settings.nav.player',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M11 9.5C11 8.9 11.6 8.6 12.1 8.9l4 2.5c.5.3.5 1 0 1.3l-4 2.5C11.6 15.5 11 15.1 11 14.6V9.5z" />
          </svg>
        ),
      },
      {
        id: 'interface',
        labelKey: 'settings.nav.interface',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        ),
      },
      {
        id: 'background',
        labelKey: 'settings.nav.background',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        ),
      },
      {
        id: 'medialib',
        labelKey: 'settings.nav.customization',
        icon: (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
          </svg>
        ),
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

export const SettingsNav = ({
  active,
  onSelect,
}: {
  active: SectionId
  onSelect: (id: SectionId) => void
}) => {
  const t = useT()
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()

  // Метка секции: переводимый ключ либо литеральный бренд.
  const secLabel = (s: SectionDef): string => (s.labelKey ? t(s.labelKey) : s.brand ?? s.id)

  return (
    <div className="settings-modal-nav" id="smNav">
      <div className="s-nav-search" style={{ marginBottom: 6 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder={t('settings.nav.search')}
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {GROUPS.map((grp) => {
        const visible = q
          ? grp.sections.filter((s) => secLabel(s).toLowerCase().includes(q))
          : grp.sections
        if (visible.length === 0) return null
        // Fragment, не <div>! Иначе flex gap:2px на родителе не применяется
        // между sibling-items внутри группы. В старом smBuildNav() тоже
        // вставляет всё плоско в `#smNav` (без wrapper).
        return (
          <Fragment key={grp.labelKey}>
            <div className="s-nav-group">{t(grp.labelKey)}</div>
            {visible.map((sec) => (
              <div
                key={sec.id}
                className={`s-nav-item${active === sec.id ? ' active' : ''}`}
                onClick={() => onSelect(sec.id)}
              >
                <div className="s-nav-icon">{sec.icon}</div>
                <span>{secLabel(sec)}</span>
                <div className="s-nav-dot" />
              </div>
            ))}
          </Fragment>
        )
      })}
    </div>
  )
}
