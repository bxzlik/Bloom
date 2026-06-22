import { useUiPrefsStore } from '../../model/uiPrefsStore'
import { useT, type TranslationKey } from '@shared/i18n'

/**
 * Раздел «Вкладки» (`#ssec-tabs`). Всё, что связано с сайдбаром и панелью окна:
 * расположение/режим сайдбара, разделители, авто-скрытие, навигационные кнопки и
 * индикатор активной вкладки; набор элементов тайтлбара и его авто-скрытие.
 *
 * Перенесено из раздела «Интерфейс». i18n-ключи карточек остались прежними
 * (`settings.interface.*`); новые ключи — только метка вкладки и заголовки
 * категорий (`settings.tabs.*`).
 */
export const TabsSection = () => {
  const t = useT()
  const p = useUiPrefsStore()

  return (
    <div className="s-section active" id="ssec-tabs">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9V3" />
          </svg>{' '}
          {t('settings.tabs.title')}
        </div>
        <button className="s-section-reset" onClick={() => p.reset()}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>{' '}
          {t('common.reset')}
        </button>
      </div>

      <div className="s-cat-label">{t('settings.tabs.cat.sidebar')}</div>
      <div className="sc sc-keep">
        <div className="sc-title">{t('settings.interface.sidebarPos.title')}</div>
        <div className="sc-desc">{t('settings.interface.sidebarPos.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.sidebarPos === 'left'} onClick={() => p.set('sidebarPos', 'left')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="11" y="3" width="10" height="18" rx="1" /></svg>
            {t('settings.interface.sidebarPos.left')}
          </OptBtn>
          <OptBtn active={p.sidebarPos === 'top'} onClick={() => p.set('sidebarPos', 'top')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="5" rx="1" /><rect x="3" y="11" width="18" height="10" rx="1" /></svg>
            {t('settings.interface.sidebarPos.top')}
          </OptBtn>
          <OptBtn active={p.sidebarPos === 'right'} onClick={() => p.set('sidebarPos', 'right')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="16" y="3" width="5" height="18" rx="1" /><rect x="3" y="3" width="10" height="18" rx="1" /></svg>
            {t('settings.interface.sidebarPos.right')}
          </OptBtn>
        </div>
        <div className="s-opt-row" style={{ marginTop: 8 }}>
          <OptBtn active={!p.sidebarCompact && !p.sidebarFloating} onClick={() => { p.set('sidebarFloating', false); p.set('sidebarCompact', false) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="4" y="7" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="11" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="15" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.sidebar.normal')}
          </OptBtn>
          <OptBtn active={p.sidebarCompact && !p.sidebarFloating} onClick={() => { p.set('sidebarFloating', false); p.set('sidebarCompact', true) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="4" y="6" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="10" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="14" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.sidebar.compact')}
          </OptBtn>
          <OptBtn active={p.sidebarFloating} onClick={() => { p.set('sidebarCompact', false); p.set('sidebarFloating', true) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="4" y="6" width="4" height="12" rx="2" /><rect x="11" y="3" width="10" height="18" rx="1" /><circle cx="6" cy="9" r=".6" fill="currentColor" stroke="none" /><circle cx="6" cy="12" r=".6" fill="currentColor" stroke="none" /><circle cx="6" cy="15" r=".6" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.sidebar.floating')}
          </OptBtn>
        </div>
      </div>

      {/* Тогглы сайдбара отдельными плитками (обычная .sc без sc-keep → каждый .sr
          превращается в отдельную строку-плитку, как блок навигации). */}
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.sidebar.sep.title')}</div>
            <div className="ssub">{t('settings.interface.sidebar.sep.sub')}</div>
          </div>
          <Toggle checked={p.sbSep} onChange={(v) => p.set('sbSep', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.sidebar.autohide.title')}</div>
            <div className="ssub">{t('settings.interface.sidebar.autohide.sub')}</div>
          </div>
          <Toggle checked={p.sidebarAutohide} onChange={(v) => p.set('sidebarAutohide', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.nav.float.title')}</div>
            <div className="ssub">{t('settings.interface.nav.float.sub')}</div>
          </div>
          <Toggle checked={p.navFloatBtn} onChange={(v) => p.set('navFloatBtn', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.nav.indicator.title')}</div>
            <div className="ssub">{t('settings.interface.nav.indicator.sub')}</div>
          </div>
          <Toggle checked={p.navIndicator} onChange={(v) => p.set('navIndicator', v)} />
        </div>
      </div>

      <div className="s-cat-label">{t('settings.tabs.cat.titlebar')}</div>
      <div className="sc">
        <div className="sc-title">{t('settings.interface.titlebar.title')}</div>
        <div className="sc-desc">{t('settings.interface.titlebar.desc')}</div>
        <div className="tb-chip-grid">
          {TITLEBAR_ITEMS.map((it) => (
            <TbChip
              key={it.key}
              active={!!p[it.key]}
              icon={it.icon}
              label={t(it.labelKey)}
              onClick={() => p.set(it.key, !p[it.key])}
            />
          ))}
        </div>
      </div>
      {/* Автоскрытие тайтлбара — отдельной плиткой. */}
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.titlebar.autohide.title')}</div>
            <div className="ssub">{t('settings.interface.titlebar.autohide.sub')}</div>
          </div>
          <Toggle checked={p.titlebarAutohide} onChange={(v) => p.set('titlebarAutohide', v)} />
        </div>
      </div>
    </div>
  )
}

const OptBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button className={`s-opt-btn ${active ? 'bta' : 'btg'}`} onClick={onClick}>
    {children}
  </button>
)

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="tele-sw">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="tele-sw-track" />
  </label>
)

/** Boolean-ключи UiPrefs, управляющие элементами тайтлбара. */
type TbKey = 'titlebarLabel' | 'tbMin' | 'tbMax' | 'tbPin' | 'tbBell' | 'tbClose' | 'tbLogo' | 'tbVersion'

const tbIcon = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
  width: 15,
  height: 15,
}

/** Элементы тайтлбара в порядке отображения (как в макете). */
const TITLEBAR_ITEMS: { key: TbKey; labelKey: TranslationKey; icon: React.ReactNode }[] = [
  {
    key: 'titlebarLabel',
    labelKey: 'settings.interface.titlebar.item.label',
    icon: (
      <svg {...tbIcon} strokeWidth={2}>
        <path d="M5 19 L12 5 L19 19" /><path d="M8 14 H16" />
      </svg>
    ),
  },
  {
    key: 'tbMin',
    labelKey: 'settings.interface.titlebar.item.min',
    icon: (
      <svg {...tbIcon}>
        <path d="M4 9 V5 H8" /><path d="M20 9 V5 H16" /><path d="M4 15 V19 H8" /><path d="M20 15 V19 H16" />
      </svg>
    ),
  },
  {
    key: 'tbMax',
    labelKey: 'settings.interface.titlebar.item.max',
    icon: (
      <svg {...tbIcon}>
        <path d="M8 3 H5 V8" /><path d="M16 3 H19 V8" /><path d="M8 21 H5 V16" /><path d="M16 21 H19 V16" />
      </svg>
    ),
  },
  {
    key: 'tbPin',
    labelKey: 'settings.interface.titlebar.item.pin',
    icon: (
      <svg {...tbIcon}>
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
      </svg>
    ),
  },
  {
    key: 'tbBell',
    labelKey: 'settings.interface.titlebar.item.bell',
    icon: (
      <svg {...tbIcon}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    key: 'tbClose',
    labelKey: 'settings.interface.titlebar.item.close',
    icon: (
      <svg {...tbIcon} strokeWidth={2}>
        <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    ),
  },
  {
    key: 'tbLogo',
    labelKey: 'settings.interface.titlebar.item.logo',
    icon: (
      <svg {...tbIcon}>
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    key: 'tbVersion',
    labelKey: 'settings.interface.titlebar.item.version',
    icon: (
      <svg {...tbIcon}>
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
]

const TbChip = ({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button className={`tb-chip${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
    <span className="tb-chip-ico">{icon}</span>
    <span className="tb-chip-lbl">{label}</span>
  </button>
)
