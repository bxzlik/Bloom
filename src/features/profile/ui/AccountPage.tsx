import { ProfileCard } from './ProfileCard'
import { StatsSection } from './StatsSection'
import { ProfileEditModal } from './ProfileEditModal'
import { ProfileShareModal } from './ProfileShareModal'

/**
 * Страница профиля (`#page-account`). Карточка профиля + полная
 * секция статистики. `.page` имеет overflow:hidden, поэтому внутренний контейнер
 * скроллится сам.
 */
export const AccountPage = ({ active }: { active: boolean }) => (
  <div className={`page${active ? ' active' : ''}`} id="page-account">
    <div
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
      <StatsSection />
    </div>
    <ProfileEditModal />
    <ProfileShareModal />
  </div>
)
