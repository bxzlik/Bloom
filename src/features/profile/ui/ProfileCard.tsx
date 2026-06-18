import type { CSSProperties } from 'react'
import { usePlayerStore } from '@features/player'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { useProfileStore } from '../model/profileStore'
import { DiscAvatar } from './DiscAvatar'

/**
 * Карточка профиля на странице аккаунта. `#page-account`
 * profile card: баннер (цвет/градиент или картинка) +
 * аватар (винил-диск или картинка) + ник (клик→копировать) + строка «слушает
 * сейчас» + бокс био/статуса + кнопки Поделиться / Изменить.
 */

const ShareIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
)

const EditIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const btnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 13px',
  borderRadius: 'calc(var(--radius)*0.55)',
  background: 'var(--accent)',
  border: 'none',
  color: 'var(--accent-text)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'var(--font)',
  transition: 'opacity .15s',
}

const NowPlaying = () => {
  const t = useT()
  const playing = usePlayerStore((s) => s.playing)
  const title = usePlayerStore((s) => s.title)
  const artist = usePlayerStore((s) => s.artist)
  if (!playing || !title) return null
  return (
    <div className="acc-since" id="accNowPlaying" style={{ color: 'rgba(255,255,255,.65)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <span style={{ width: 3, height: 8, background: 'var(--accent)', borderRadius: 2, animation: 'npBar 0.8s ease-in-out infinite alternate' }} />
          <span style={{ width: 3, height: 12, background: 'var(--accent)', borderRadius: 2, animation: 'npBar 0.8s ease-in-out infinite alternate 0.2s' }} />
          <span style={{ width: 3, height: 6, background: 'var(--accent)', borderRadius: 2, animation: 'npBar 0.8s ease-in-out infinite alternate 0.4s' }} />
        </span>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{t('profile.nowPlaying')}</span> {title}
        {artist ? ` — ${artist}` : ''}
      </span>
    </div>
  )
}

export const ProfileCard = () => {
  const t = useT()
  const p = useProfileStore()

  const bannerBg =
    p.bannerColorMode === 'gradient'
      ? `linear-gradient(${p.bannerAngle}deg,${p.bannerColor} 0%,${p.bannerColor2} 100%)`
      : p.bannerColor

  // Рамка аватара _applyAvaBorderColor: accent → дефолт CSS
  // (border var(--accent)); custom → заданный цвет; off → ширина 0.
  const avaStyle: CSSProperties = {}
  if (p.avaBorderMode === 'custom' && p.avaBorderColor) avaStyle.borderColor = p.avaBorderColor
  if (p.avaBorderMode === 'off') avaStyle.borderWidth = 0

  const hasBioBox = !!(p.bio.trim() || p.status.trim())

  const copyNick = () => {
    navigator.clipboard?.writeText(p.name).then(
      () => toast(t('profile.toast.nickCopied')),
      () => {},
    )
  }

  return (
    <div style={{ borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,var(--wb))', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
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
              <div className="acc-ava" id="accAvaBig" style={avaStyle}>
                <img src={p.avatar} alt="" />
              </div>
            ) : (
              <DiscAvatar idx={p.discIdx} color={p.discColor} className="acc-ava" style={avaStyle} />
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
              <NowPlaying />
              {hasBioBox && (
                <div className="acc-bio-box" style={{ display: 'block' }}>
                  {p.bio.trim() && <div className="acc-bio-box-text">{p.bio}</div>}
                  {p.status.trim() && <div className="acc-bio-box-status" style={{ display: 'block' }}>{`"${p.status}"`}</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Кнопки внизу справа */}
        <div style={{ position: 'absolute', bottom: 14, right: 16, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            style={btnStyle}
            onClick={p.openShare}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '.85')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <ShareIcon /> {t('lib.ctx.share')}
          </button>
          <button
            style={btnStyle}
            onClick={p.openEdit}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '.85')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <EditIcon /> {t('common.edit')}
          </button>
        </div>
      </div>
    </div>
  )
}
