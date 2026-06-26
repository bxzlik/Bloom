import { useUiPrefsStore } from '../../model/uiPrefsStore'
import { useT, type TranslationKey } from '@shared/i18n'
import { Ico, type IconName } from '@shared/ui/icons/solar'

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
          <Ico name="windowFrame" width={15} height={15} />{' '}
          {t('settings.tabs.title')}
        </div>
        <button className="s-section-reset" onClick={() => p.reset()}>
          <Ico name="refresh" width={10} height={10} />{' '}
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

/** Элементы тайтлбара в порядке отображения (как в макете). */
const TITLEBAR_ITEMS: { key: TbKey; labelKey: TranslationKey; icon: IconName }[] = [
  { key: 'titlebarLabel', labelKey: 'settings.interface.titlebar.item.label', icon: 'text' },
  { key: 'tbMin', labelKey: 'settings.interface.titlebar.item.min', icon: 'minSquare' },
  { key: 'tbMax', labelKey: 'settings.interface.titlebar.item.max', icon: 'maxSquare' },
  { key: 'tbPin', labelKey: 'settings.interface.titlebar.item.pin', icon: 'pin' },
  { key: 'tbBell', labelKey: 'settings.interface.titlebar.item.bell', icon: 'bell' },
  { key: 'tbClose', labelKey: 'settings.interface.titlebar.item.close', icon: 'close' },
  { key: 'tbLogo', labelKey: 'settings.interface.titlebar.item.logo', icon: 'gallery' },
  { key: 'tbVersion', labelKey: 'settings.interface.titlebar.item.version', icon: 'code' },
]

const TbChip = ({ active, icon, label, onClick }: { active: boolean; icon: IconName; label: string; onClick: () => void }) => (
  <button className={`tb-chip${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
    <span className="tb-chip-ico"><Ico name={icon} width={15} height={15} /></span>
    <span className="tb-chip-lbl">{label}</span>
  </button>
)
