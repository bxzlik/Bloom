import { useState, type ReactNode } from 'react'
import { useUiPrefsStore, type WaveView } from '../../model/uiPrefsStore'
import { useT, type TranslationKey } from '@shared/i18n'
import { Ico, type IconName } from '@shared/ui/icons/solar'
import { LibraryCards } from './LibrarySection'

/**
 * Раздел «Страницы» (`#ssec-pages`) — объединяет настройки страниц приложения.
 * Вместо двух отдельных вкладок в сайдбаре настроек здесь один раздел с
 * переключателем вкладок сверху:
 *
 * - «Главная» — набор видимых секций главной страницы (`uiPrefs.home*`);
 * - «Библиотека» — бывший раздел «Библиотека» (`LibraryCards`);
 * - «Поиск» — вид поиска (страница / всплывающий ввод, `uiPrefs.searchView`).
 *
 * Кнопка сброса в шапке общая (сбрасывает все UI-префы, как и раньше).
 */
type PageTab = 'home' | 'library' | 'search'

const TABS: { id: PageTab; labelKey: TranslationKey; icon: IconName }[] = [
  { id: 'home', labelKey: 'nav.home', icon: 'home' },
  { id: 'library', labelKey: 'settings.nav.library', icon: 'library' },
  { id: 'search', labelKey: 'nav.search', icon: 'search' },
]

export const PagesSection = () => {
  const t = useT()
  const p = useUiPrefsStore()
  const [tab, setTab] = useState<PageTab>('home')

  return (
    <div className="s-section active" id="ssec-pages">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="grid" width={15} height={15} />{' '}
          {t('settings.nav.pages')}
        </div>
        <button className="s-section-reset" onClick={() => p.reset()}>
          <Ico name="refresh" width={10} height={10} />{' '}
          {t('common.reset')}
        </button>
      </div>

      {/* Переключатель страниц — полоса вкладок над карточками раздела. */}
      <div className="s-ptabs">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            className={`s-ptab${tab === tb.id ? ' active' : ''}`}
            onClick={() => setTab(tb.id)}
          >
            <Ico name={tb.icon} width={14} height={14} />
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'home' ? <HomeCards /> : tab === 'library' ? <LibraryCards /> : <SearchCards />}
    </div>
  )
}

/** Boolean-ключи UiPrefs, управляющие видимостью секций главной. */
type HomeKey =
  | 'homeWave'
  | 'homeContinue'
  | 'homeFav'
  | 'homeHistory'
  | 'homeNew'
  | 'homeCharts'
  | 'homeRecent'
  | 'homePlaylists'

/** Секции главной в порядке их появления на странице. */
const HOME_ITEMS: { key: HomeKey; labelKey: TranslationKey; icon: IconName }[] = [
  { key: 'homeWave', labelKey: 'settings.home.item.wave', icon: 'wave' },
  { key: 'homeContinue', labelKey: 'settings.home.item.continue', icon: 'play' },
  { key: 'homeFav', labelKey: 'settings.home.item.fav', icon: 'heart' },
  { key: 'homeHistory', labelKey: 'settings.home.item.history', icon: 'clock' },
  { key: 'homeNew', labelKey: 'settings.home.item.new', icon: 'stars' },
  { key: 'homeCharts', labelKey: 'settings.home.item.charts', icon: 'chart' },
  { key: 'homeRecent', labelKey: 'settings.home.item.recent', icon: 'vinyl' },
  { key: 'homePlaylists', labelKey: 'settings.home.item.playlists', icon: 'list' },
]

/**
 * Виды блока «Моя волна» (`uiPrefs.waveView`). Список открытый — новый вид
 * добавляется строкой сюда, веткой в `WaveCard` и классом `.hwb-view-*` в
 * home.css.
 */
const WAVE_VIEWS: { id: WaveView; labelKey: TranslationKey; hintKey: TranslationKey; icon: ReactNode }[] = [
  {
    id: 'fire',
    labelKey: 'settings.home.waveView.fire',
    hintKey: 'settings.home.waveView.fireHint',
    // Шар пламени: плотное ядро в размытом ореоле.
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <circle cx="12" cy="12" r="9" opacity=".3" />
        <circle cx="12" cy="12" r="6" opacity=".6" />
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'ring',
    labelKey: 'settings.home.waveView.ring',
    hintKey: 'settings.home.waveView.ringHint',
    // Кольцо обложек вокруг кнопки запуска.
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        <rect x="9.5" y="1.5" width="5" height="5" rx="1.6" />
        <rect x="9.5" y="17.5" width="5" height="5" rx="1.6" />
        <rect x="1.5" y="9.5" width="5" height="5" rx="1.6" />
        <rect x="17.5" y="9.5" width="5" height="5" rx="1.6" />
      </svg>
    ),
  },
]

/**
 * Карточка «Вид «Моей волны»» — как выглядит блок волны на главной. Ось
 * независимая от чипа видимости `homeWave`: тот прячет блок целиком.
 */
const WaveViewCard = () => {
  const t = useT()
  const p = useUiPrefsStore()
  const cur = WAVE_VIEWS.find((v) => v.id === p.waveView) ?? WAVE_VIEWS[0]!

  return (
    <div className="sc sc-keep">
      <div className="sc-title">{t('settings.home.waveView.title')}</div>
      <div className="sc-desc">{t('settings.home.waveView.desc')}</div>
      <div className="s-opt-row">
        {WAVE_VIEWS.map((v) => (
          <OptBtn key={v.id} active={p.waveView === v.id} onClick={() => p.set('waveView', v.id)}>
            {v.icon}
            {t(v.labelKey)}
          </OptBtn>
        ))}
      </div>
      <div className="sc-desc" style={{ marginTop: 10, opacity: 0.75 }}>
        {t(cur.hintKey)}
      </div>
    </div>
  )
}

/**
 * Вкладка «Главная»: чипы-переключатели секций главной страницы (тот же
 * редактор, что и «Отображать на панели» у тайтлбара — `.tb-chip-grid`) плюс
 * выбор вида блока «Моя волна».
 * Выключенный чип = секция не рендерится в HomePage/DiscoverSections.
 */
const HomeCards = () => {
  const t = useT()
  const p = useUiPrefsStore()
  const allOff = HOME_ITEMS.every((it) => !p[it.key])

  return (
    <>
    <div className="sc">
      <div className="sc-title">{t('settings.home.sections.title')}</div>
      <div className="sc-desc">{t('settings.home.sections.desc')}</div>
      <div className="tb-chip-grid">
        {HOME_ITEMS.map((it) => (
          <button
            key={it.key}
            className={`tb-chip${p[it.key] ? ' active' : ''}`}
            onClick={() => p.set(it.key, !p[it.key])}
            aria-pressed={p[it.key]}
          >
            <span className="tb-chip-ico"><Ico name={it.icon} width={15} height={15} /></span>
            <span className="tb-chip-lbl">{t(it.labelKey)}</span>
          </button>
        ))}
      </div>
      {allOff && (
        <div className="sc-desc" style={{ marginTop: 12, opacity: 0.75 }}>
          {t('settings.home.sections.empty')}
        </div>
      )}
    </div>
    <WaveViewCard />
    </>
  )
}

/** Карточки вкладки «Поиск»: вид (что открывает клик) + тумблер хоткея. */
const SearchCards = () => (
  <>
    <SearchViewCard />
    <SearchHotkeyCard />
  </>
)

const SearchViewCard = () => {
  const t = useT()
  const p = useUiPrefsStore()

  return (
    <div className="sc sc-keep">
      <div className="sc-title">{t('settings.search.view.title')}</div>
      <div className="sc-desc">{t('settings.search.view.desc')}</div>
      <div className="s-opt-row">
        <OptBtn active={p.searchView === 'page'} onClick={() => p.set('searchView', 'page')}>
          {/* Страница: контент во всю область справа от сайдбара */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <rect x="3" y="3" width="5" height="18" rx="1" />
            <rect x="11" y="3" width="10" height="18" rx="1" />
            <path d="M13.5 7h5" strokeWidth={1.4} />
          </svg>
          {t('settings.search.view.page')}
        </OptBtn>
        <OptBtn active={p.searchView === 'overlay'} onClick={() => p.set('searchView', 'overlay')}>
          {/* Всплывающий: панель поверх страницы */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="1" opacity=".45" />
            <rect x="6" y="7" width="12" height="5" rx="2" fill="currentColor" stroke="none" />
            <path d="M7.5 15h9M7.5 18h6" strokeWidth={1.4} opacity=".6" />
          </svg>
          {t('settings.search.view.overlay')}
        </OptBtn>
      </div>
      <div className="sc-desc" style={{ marginTop: 10, opacity: 0.75 }}>
        {t(`settings.search.view.${p.searchView}Hint` as TranslationKey)}
      </div>
    </div>
  )
}

/**
 * Тумблер хоткея — отдельная ось от вида: Ctrl+T открывает всплывающий ввод и
 * тогда, когда клик по вкладке ведёт на страницу поиска (бывший вид
 * «Объединённый» = «Страница» + этот тумблер).
 */
const SearchHotkeyCard = () => {
  const t = useT()
  const p = useUiPrefsStore()

  return (
    <div className="sc">
      <div className="sr">
        <div>
          <div className="sl2">{t('settings.search.hotkey.title')}</div>
          <div className="ssub">{t('settings.search.hotkey.sub')}</div>
        </div>
        <label className="tele-sw">
          <input
            type="checkbox"
            checked={p.searchHotkey}
            onChange={(e) => p.set('searchHotkey', e.target.checked)}
          />
          <span className="tele-sw-track" />
        </label>
      </div>
    </div>
  )
}

const OptBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button className={`s-opt-btn ${active ? 'bta' : 'btg'}`} onClick={onClick}>
    {children}
  </button>
)
