import type { CSSProperties } from 'react'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { useProfileStore } from '../model/profileStore'
import { Ico } from '@shared/ui/icons/solar'
import { EmptyAvatar } from './EmptyAvatar'

/**
 * Карточка профиля на странице аккаунта. `#page-account`
 * profile card: баннер (цвет/градиент или картинка) +
 * аватар (картинка или заглушка) + ник (клик→копировать) + бокс био/статуса +
 * кнопки Поделиться / Изменить.
 */

const ShareIcon = () => <Ico name="share" width={18} height={18} />

const EditIcon = () => <Ico name="edit" width={18} height={18} />

/** Иконка-действие на баннере: нейтральный белый, ярче при наведении. */
const btnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  padding: 0,
  borderRadius: 'calc(var(--radius)*0.55)',
  background: 'none',
  border: 'none',
  color: '#fff',
  opacity: 0.55,
  cursor: 'pointer',
  transition: 'opacity .15s',
}

export const ProfileCard = () => {
  const t = useT()
  const p = useProfileStore()

  const bannerBg =
    p.bannerColorMode === 'gradient'
      ? `linear-gradient(${p.bannerAngle}deg,${p.bannerColor} 0%,${p.bannerColor2} 100%)`
      : p.bannerColor

  const hasBioBox = !!(p.bio.trim() || p.status.trim())

  const copyNick = () => {
    navigator.clipboard?.writeText(p.name).then(
      () => toast(t('profile.toast.nickCopied')),
      () => {},
    )
  }

  return (
    <div style={{ borderRadius: 'var(--radius)', border: '1px solid var(--ovl-line)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      <div className="acc-banner-wrap" id="accBannerWrap" style={{ height: 250, position: 'relative' }}>
        {p.banner ? (
          <img className="acc-banner-img" src={p.banner} alt="" />
        ) : (
          <div className="acc-banner-empty" style={{ background: bannerBg }} />
        )}

        {/* Аватар + инфо: слева, по центру по высоте */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 16px', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {p.avatar ? (
              <div className="acc-ava" id="accAvaBig">
                <img src={p.avatar} alt="" />
              </div>
            ) : (
              <EmptyAvatar className="acc-ava" />
            )}
            <div>
              <div
                className="acc-name"
                onClick={copyNick}
                style={{ cursor: 'pointer', color: '#fff' }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '.75')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {p.name}
              </div>
              {hasBioBox && (
                <div className="acc-bio-box" style={{ display: 'block' }}>
                  {p.bio.trim() && <div className="acc-bio-box-text">{p.bio}</div>}
                  {p.status.trim() && <div className="acc-bio-box-status" style={{ display: 'block' }}>{`"${p.status}"`}</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Иконки-действия вверху справа */}
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            style={btnStyle}
            aria-label={t('lib.ctx.share')}
            onClick={p.openShare}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '.55')}
          >
            <ShareIcon />
          </button>
          <button
            style={btnStyle}
            aria-label={t('common.edit')}
            onClick={p.openEdit}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '.55')}
          >
            <EditIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
