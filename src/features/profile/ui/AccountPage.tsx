import { useEffect } from 'react'
import { WrappedHost, WrappedYearBanner } from '@features/wrapped'
import { ProfileCard } from './ProfileCard'
import { ProfileEntryCards } from './ProfileEntryCards'
import { StatsPanel } from './StatsPanel'
import { AchievementsPanel } from './AchievementsPanel'
import { ProfileEditModal } from './ProfileEditModal'
import { ProfileShareModal } from './ProfileShareModal'
import { useProfilePanelStore } from '../model/profilePanelStore'

/**
 * Страница профиля (`#page-account`). Карточка профиля + плашка «Итоги года»
 * (только в декабрьском окне) + два входа-карточки «Статистика» /
 * «Достижения» (как в мобильной версии). Итоги месяца отдельной плашки не
 * имеют: раз в месяц ими подменяется карточка статистики, см.
 * ProfileEntryCards. Само содержимое входов живёт
 * не на странице, а в боковых шторках (`StatsPanel` / `AchievementsPanel`) —
 * тот же каркас `.spanel`, что у редактора профиля; какая открыта, решает
 * `profilePanelStore`.
 *
 * `.page` имеет overflow:hidden, поэтому внутренний контейнер скроллится сам.
 */

export const AccountPage = ({ active }: { active: boolean }) => {
  // Страницы не размонтируются, а шторки живут в портале на body — уходя с
  // профиля, закрываем открытую, иначе она повиснет поверх чужой страницы.
  useEffect(() => {
    if (!active) useProfilePanelStore.getState().closePanel()
  }, [active])

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
      {/* Плашка года сама решает, показываться ли: только 21–31 декабря и
          только если за год есть что показать. */}
      <WrappedYearBanner />
      <ProfileEntryCards />
    </div>
    <ProfileEditModal />
    <ProfileShareModal />
    <StatsPanel />
    <AchievementsPanel />
    {/* Модалка итогов — вне баннера: открыть её умеют и плашка года, и
        подменённая карточка статистики, и кнопка в панели статистики. */}
    <WrappedHost />
  </div>
  )
}
