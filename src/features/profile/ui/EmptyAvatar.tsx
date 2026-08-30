import type { CSSProperties } from 'react'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Аватар профиля без своей картинки: сплошная подложка и приглушённый
 * человечек. Тот же приём, что у пустой обложки (`EmptyCover`), но знак —
 * человечек, а не логотип: на месте лица знак bloom читался бы как «трек без
 * обложки».
 *
 * Форму и размер задаёт вызывающий через `className` (`.acc-ava`,
 * `.pedit-hero-ava`, инлайн 100%) — компонент только заливает и центрирует.
 * Заливка инлайном, чтобы перебить `background:transparent` у `.acc-ava`
 * независимо от порядка подключения стилей.
 */
export const EmptyAvatar = ({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) => (
  <div
    className={className}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--cover-empty)',
      ...style,
    }}
  >
    <Ico
      name="user"
      variant="bold"
      width="46%"
      height="46%"
      style={{ color: 'var(--text)', opacity: 0.22, flexShrink: 0 }}
    />
  </div>
)
