import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { ProfileCard } from './ProfileCard'
import { StatsSection } from './StatsSection'
import { AchievementsSection } from './AchievementsSection'
import { ProfileEditModal } from './ProfileEditModal'
import { ProfileShareModal } from './ProfileShareModal'
import { useAccountTabStore } from '../model/accountTabStore'

/**
 * Страница профиля (`#page-account`). Карточка профиля (всегда сверху) + под ней
 * сегментированный таб-бар: «Статистика» / «Достижения». Активная вкладка живёт
 * в `useAccountTabStore` (персистится в localStorage) — чтобы её можно было
 * переключать извне при смонтированной странице (напр. бар статистики на
 * главной открывает профиль сразу на «Статистике»). `.page` имеет
 * overflow:hidden, поэтому внутренний контейнер скроллится сам.
 */

export const AccountPage = ({ active }: { active: boolean }) => {
  const t = useT()
  const tab = useAccountTabStore((s) => s.tab)
  const go = useAccountTabStore((s) => s.setTab)

  return (
    <div className={`page${active ? ' active' : ''}`} id="page-account">
      <div
        className="account-scroll"
        style={{
          padding: '20px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
        }}
      >
        <ProfileCard />

        <div className="acc-tabs" role="tablist">
          <button
            className={`acc-tab${tab === 'stats' ? ' active' : ''}`}
            role="tab"
            aria-selected={tab === 'stats'}
            onClick={() => go('stats')}
          >
            <Ico name="chart" width={14} height={14} />
            {t('stats.title')}
          </button>
          <button
            className={`acc-tab${tab === 'ach' ? ' active' : ''}`}
            role="tab"
            aria-selected={tab === 'ach'}
            onClick={() => go('ach')}
          >
            <Ico name="award" width={14} height={14} />
            {t('ach.title')}
          </button>
        </div>

        {tab === 'stats' ? <StatsSection /> : <AchievementsSection />}
      </div>
      <ProfileEditModal />
      <ProfileShareModal />
    </div>
  )
}
