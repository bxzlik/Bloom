import { useProfileStore } from '../model/profileStore'
import { EmptyAvatar } from './EmptyAvatar'

/**
 * Аватар профиля в нижнем сайдбаре (`#sbAvatar`). Показывает загруженный аватар
 * либо заглушку с человечком. Без обводки — рамки у аватара нет ни в каком
 * состоянии, включая активную вкладку.
 */
export const SidebarAvatar = () => {
  const avatar = useProfileStore((s) => s.avatar)

  return (
    <div className="sb-avatar" id="sbAvatar">
      {avatar ? <img src={avatar} alt="" /> : <EmptyAvatar style={{ width: '100%', height: '100%' }} />}
    </div>
  )
}
