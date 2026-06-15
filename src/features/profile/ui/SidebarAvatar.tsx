import type { CSSProperties } from 'react'
import { useProfileStore } from '../model/profileStore'
import { DiscAvatar } from './DiscAvatar'

/**
 * Аватар профиля в нижнем сайдбаре (`#sbAvatar`). Показывает загруженный аватар
 * либо винил-диск (дефолт). Обводка по `avaBorderMode` `_applyAvaBorderColor`
 *: custom → заданный цвет, off → без рамки. В режиме accent рамку
 * НЕ задаём инлайном — остаётся поведение CSS `.sni.active .sb-avatar` (акцент
 * у активной вкладки), как дефолт в bloom.
 */
export const SidebarAvatar = () => {
  const avatar = useProfileStore((s) => s.avatar)
  const discIdx = useProfileStore((s) => s.discIdx)
  const discColor = useProfileStore((s) => s.discColor)
  const avaBorderMode = useProfileStore((s) => s.avaBorderMode)
  const avaBorderColor = useProfileStore((s) => s.avaBorderColor)

  const style: CSSProperties = {}
  if (avaBorderMode === 'custom' && avaBorderColor) style.borderColor = avaBorderColor
  if (avaBorderMode === 'off') style.borderWidth = 0

  return (
    <div className="sb-avatar" id="sbAvatar" style={style}>
      {avatar ? (
        <img src={avatar} alt="" />
      ) : (
        <DiscAvatar idx={discIdx} color={discColor} style={{ width: '100%', height: '100%' }} />
      )}
    </div>
  )
}
