import { useUiPrefsStore } from '../../model/uiPrefsStore'
import { useT, type TranslationKey } from '@shared/i18n'
import { Ico, type IconName } from '@shared/ui/icons/solar'
import type { TabsTab } from '../subTabs'

/**
 * Раздел «Вкладки» (`#ssec-tabs`). Всё, что связано с сайдбаром и панелью окна:
 * расположение/режим сайдбара, разделители, авто-скрытие, навигационные кнопки и
 * индикатор активной вкладки; набор элементов тайтлбара и его авто-скрытие.
 *
 * Две группы разделены подвкладками (полоса — в шапке панели, см. subTabs.ts),
 * а не заголовками-категориями: «Сайдбар» и «Тайтлбар».
 *
 * Перенесено из раздела «Интерфейс». i18n-ключи карточек остались прежними
 * (`settings.interface.*`); новые ключи — только метка вкладки и названия
 * групп (`settings.tabs.*`).
 */
export const TabsSection = ({ tab }: { tab: TabsTab }) => {
  const t = useT()

  return (
    <div className="s-section active" id="ssec-tabs">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="windowFrame" width={15} height={15} />{' '}
          {t('settings.tabs.title')}
        </div>
      </div>

      {tab === 'sidebar' ? <SidebarCards /> : <TitlebarCards />}
    </div>
  )
}

/** Карточки вкладки «Сайдбар»: расположение/режим, вид, тогглы. */
const SidebarCards = () => {
  const t = useT()
  const p = useUiPrefsStore()

  return (
    <>
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
          <OptBtn active={!p.sidebarCompact && !p.sidebarFloating && !p.sidebarPlain} onClick={() => setSbMode(p, null)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="4" y="7" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="11" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="15" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.sidebar.normal')}
          </OptBtn>
          <OptBtn active={p.sidebarCompact && !p.sidebarFloating} onClick={() => setSbMode(p, 'sidebarCompact')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="4" y="6" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="10" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="14" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.sidebar.compact')}
          </OptBtn>
          <OptBtn active={p.sidebarFloating} onClick={() => setSbMode(p, 'sidebarFloating')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="4" y="6" width="4" height="12" rx="2" /><rect x="11" y="3" width="10" height="18" rx="1" /><circle cx="6" cy="9" r=".6" fill="currentColor" stroke="none" /><circle cx="6" cy="12" r=".6" fill="currentColor" stroke="none" /><circle cx="6" cy="15" r=".6" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.sidebar.floating')}
          </OptBtn>
          {/* «Полный» — та же картинка, что у обычного, но БЕЗ рамки слева: ровно
              то, что режим и делает (сайдбар без бордера, сливается с фоном). */}
          <OptBtn active={p.sidebarPlain && !p.sidebarFloating && !p.sidebarCompact} onClick={() => setSbMode(p, 'sidebarPlain')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="11" y="3" width="10" height="18" rx="1" /><rect x="4" y="7" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="11" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="15" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.sidebar.plain')}
          </OptBtn>
        </div>
      </div>

      <div className="sc sc-keep">
        <div className="sc-title">{t('settings.interface.sidebarView.title')}</div>
        <div className="sc-desc">{t('settings.interface.sidebarView.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.sidebarView === 'icons'} onClick={() => p.set('sidebarView', 'icons')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><circle cx="5.5" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="5.5" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="5.5" cy="16" r="1.1" fill="currentColor" stroke="none" /><rect x="11" y="3" width="10" height="18" rx="1" /></svg>
            {t('settings.interface.sidebarView.icons')}
          </OptBtn>
          <OptBtn active={p.sidebarView === 'full'} onClick={() => p.set('sidebarView', 'full')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="10" height="18" rx="1" /><circle cx="5.8" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="5.8" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="5.8" cy="16" r="1.1" fill="currentColor" stroke="none" /><path d="M8.4 8h2.4M8.4 12h2.4M8.4 16h2.4" strokeWidth={1.4} /><rect x="16" y="3" width="5" height="18" rx="1" /></svg>
            {t('settings.interface.sidebarView.full')}
          </OptBtn>
        </div>
      </div>

      {/* Тогглы сайдбара отдельными плитками (обычная .sc без sc-keep → каждый .sr
          превращается в отдельную строку-плитку, как блок навигации). */}
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.sidebar.autohide.title')}</div>
            <div className="ssub">{t('settings.interface.sidebar.autohide.sub')}</div>
          </div>
          <Toggle checked={p.sidebarAutohide} onChange={(v) => p.set('sidebarAutohide', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.sidebar.lock.title')}</div>
            <div className="ssub">{t('settings.interface.sidebar.lock.sub')}</div>
          </div>
          <Toggle checked={p.sbResizeLock} onChange={(v) => p.set('sbResizeLock', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.sidebar.sep.title')}</div>
            <div className="ssub">{t('settings.interface.sidebar.sep.sub')}</div>
          </div>
          <Toggle checked={p.sbSep} onChange={(v) => p.set('sbSep', v)} />
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
            <div className="sl2">{t('settings.interface.nav.homeLogo.title')}</div>
            <div className="ssub">{t('settings.interface.nav.homeLogo.sub')}</div>
          </div>
          <Toggle checked={p.navHomeLogo} onChange={(v) => p.set('navHomeLogo', v)} />
        </div>
      </div>

    </>
  )
}

/** Карточки вкладки «Тайтлбар»: набор элементов панели + её тогглы. */
const TitlebarCards = () => {
  const t = useT()
  const p = useUiPrefsStore()

  return (
    <>
      <div className="sc">
        <div className="sc-title">{t('settings.interface.titlebar.title')}</div>
        <div className="sc-desc">{t('settings.interface.titlebar.desc')}</div>
        <div className="s-chip-grid">
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
      {/* Автоскрытие и фон тайтлбара — отдельными плитками. */}
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.titlebar.autohide.title')}</div>
            <div className="ssub">{t('settings.interface.titlebar.autohide.sub')}</div>
          </div>
          <Toggle checked={p.titlebarAutohide} onChange={(v) => p.set('titlebarAutohide', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.titlebar.bg.title')}</div>
            <div className="ssub">{t('settings.interface.titlebar.bg.sub')}</div>
          </div>
          <Toggle checked={p.titlebarBg} onChange={(v) => p.set('titlebarBg', v)} />
        </div>
      </div>
    </>
  )
}

/**
 * Режимы сайдбара — один ряд взаимоисключимых кнопок, но в сторе это три
 * независимых булевых флага. Хелпер ставит выбранный и гасит остальные
 * (`null` — «Обычный», когда не поднят ни один).
 */
type SbModeKey = 'sidebarCompact' | 'sidebarFloating' | 'sidebarPlain'
const SB_MODES: SbModeKey[] = ['sidebarCompact', 'sidebarFloating', 'sidebarPlain']
const setSbMode = (p: { set: (key: SbModeKey, value: boolean) => void }, mode: SbModeKey | null): void => {
  for (const k of SB_MODES) p.set(k, k === mode)
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

/** Чип-переключатель элемента панели (общий вид `.s-chip`, см. settings.css). */
const TbChip = ({ active, icon, label, onClick }: { active: boolean; icon: IconName; label: string; onClick: () => void }) => (
  <button className={`s-chip${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
    <span className="s-chip-ico"><Ico name={icon} width={15} height={15} /></span>
    <span className="s-chip-lbl">{label}</span>
  </button>
)
