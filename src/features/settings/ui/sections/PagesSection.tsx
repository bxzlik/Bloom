import { useUiPrefsStore } from '../../model/uiPrefsStore'
import { useT, type TranslationKey } from '@shared/i18n'
import { Ico, type IconName } from '@shared/ui/icons/solar'
import { LibraryCards } from './LibrarySection'
import type { PageTab } from '../subTabs'

/**
 * Раздел «Страницы» (`#ssec-pages`) — объединяет настройки страниц приложения.
 * Вместо двух отдельных вкладок в сайдбаре настроек здесь один раздел с
 * подвкладками (сама полоса — в шапке панели, см. subTabs.ts):
 *
 * - «Главная» — набор видимых секций главной страницы (`uiPrefs.home*`);
 * - «Библиотека» — бывший раздел «Библиотека» (`LibraryCards`).
 */
export const PagesSection = ({ tab }: { tab: PageTab }) => {
  const t = useT()

  return (
    <div className="s-section active" id="ssec-pages">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="grid" width={15} height={15} />{' '}
          {t('settings.nav.pages')}
        </div>
      </div>

      {tab === 'home' ? <HomeCards /> : <LibraryCards />}
    </div>
  )
}

/** Boolean-ключи UiPrefs, управляющие видимостью секций главной. */
type HomeKey =
  | 'homeWave'
  | 'homeContinue'
  | 'homeFav'
  | 'homeHistory'
  | 'homeForYou'
  | 'homeSimilar'
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
  { key: 'homeRecent', labelKey: 'settings.home.item.recent', icon: 'vinyl' },
  { key: 'homePlaylists', labelKey: 'settings.home.item.playlists', icon: 'list' },
  { key: 'homeForYou', labelKey: 'settings.home.item.forYou', icon: 'user' },
  { key: 'homeSimilar', labelKey: 'settings.home.item.similar', icon: 'link' },
  { key: 'homeNew', labelKey: 'settings.home.item.new', icon: 'stars' },
  { key: 'homeCharts', labelKey: 'settings.home.item.charts', icon: 'chart' },
]

/**
 * Чип-переключатель секции (общий вид `.s-chip`, см. settings.css): иконка и
 * подпись в строку, ширина по тексту. Такой же чип — у элементов тайтлбара
 * (TabsSection); общего компонента для него в проекте нет, как и для `.s-opt-btn`.
 */
const SecChip = ({ active, icon, label, onClick }: { active: boolean; icon: IconName; label: string; onClick: () => void }) => (
  <button className={`s-chip${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
    <span className="s-chip-ico"><Ico name={icon} width={15} height={15} /></span>
    <span className="s-chip-lbl">{label}</span>
  </button>
)

/**
 * Вкладка «Главная»: переключатели секций главной страницы. Оформлены как чипы
 * тайтлбара (`.s-chip-grid` + `.s-chip`) — это такой же множественный выбор
 * «что показывать», а равные колонки `.s-opt-btn` сплющивали длинные подписи
 * («Недавно слушали»). Выключенный чип = секция не рендерится в
 * HomePage/DiscoverSections.
 */
const HomeCards = () => {
  const t = useT()
  const p = useUiPrefsStore()
  const allOff = HOME_ITEMS.every((it) => !p[it.key])

  return (
    <div className="sc">
      <div className="sc-title">{t('settings.home.sections.title')}</div>
      <div className="sc-desc">{t('settings.home.sections.desc')}</div>
      <div className="s-chip-grid">
        {HOME_ITEMS.map((it) => (
          <SecChip
            key={it.key}
            active={p[it.key]}
            icon={it.icon}
            label={t(it.labelKey)}
            onClick={() => p.set(it.key, !p[it.key])}
          />
        ))}
      </div>
      {allOff && (
        <div className="sc-desc" style={{ marginTop: 12, opacity: 0.75 }}>
          {t('settings.home.sections.empty')}
        </div>
      )}
    </div>
  )
}
