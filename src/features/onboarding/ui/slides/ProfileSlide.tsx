import { useRef } from 'react'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Слайд «Профиль»: обложка-баннер (во всю ширину карточки), аватар поверх неё и ник.
 *
 * Все три значения живут в state оболочки (Onboarding.tsx) и коммитятся в
 * useProfileStore только на финише — чтобы «Назад» не оставлял следов.
 * Картинки читаются в data-URL; обложка сжимается позже, при коммите.
 */
interface Props {
  name: string
  onName: (v: string) => void
  avatar: string | null
  onAvatar: (v: string | null) => void
  cover: string | null
  onCover: (v: string | null) => void
  /** Enter в поле ника — перейти к следующему слайду. */
  onSubmit: () => void
}

const readFile = (f: File | undefined, cb: (data: string) => void) => {
  if (!f) return
  const r = new FileReader()
  r.onload = (e) => {
    const d = e.target?.result
    if (typeof d === 'string') cb(d)
  }
  r.readAsDataURL(f)
}

export const ProfileSlide = ({ name, onName, avatar, onAvatar, cover, onCover, onSubmit }: Props) => {
  const t = useT()
  const avaInp = useRef<HTMLInputElement | null>(null)
  const coverInp = useRef<HTMLInputElement | null>(null)

  return (
    <div className="ob-body ob-body-flush">
      <div className={`ob-cover${cover ? ' has-cover' : ''}`}>
        <div className="ob-cover-img" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />

        <div className="ob-cover-empty" onClick={() => coverInp.current?.click()}>
          <Ico name="gallery" width={20} height={20} />
          <span>{t('onb.addCover')}</span>
        </div>

        <div className="ob-cover-actions">
          <button className="ob-cover-btn" onClick={() => coverInp.current?.click()}>
            <Ico name="camera" width={11} height={11} />
            {t('common.change')}
          </button>
          <button
            className="ob-cover-btn danger"
            onClick={() => {
              onCover(null)
              if (coverInp.current) coverInp.current.value = ''
            }}
          >
            <Ico name="close" width={11} height={11} />
            {t('common.remove')}
          </button>
        </div>

        <input
          ref={coverInp}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => readFile(e.target.files?.[0], onCover)}
        />
      </div>

      <div className="ob-profile-mid">
        <div className="ob-ava-wrap">
          <label className="ob-ava">
            {avatar ? <img src={avatar} alt="" /> : <Ico name="user" width={26} height={26} style={{ color: 'var(--muted,#555)' }} />}
            <div className="ob-ava-overlay">
              <Ico name="camera" width={14} height={14} />
            </div>
            <input
              ref={avaInp}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => readFile(e.target.files?.[0], onAvatar)}
            />
          </label>

          {avatar && (
            <button
              className="ob-ava-remove"
              onClick={() => {
                onAvatar(null)
                if (avaInp.current) avaInp.current.value = ''
              }}
            >
              <Ico name="close" width={7} height={7} />
            </button>
          )}
        </div>

        <div className="ob-title">{t('onb.profile.title')}</div>
        <div className="ob-sub">{t('onb.profile.sub')}</div>

        <input
          className="ob-input"
          value={name}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
          }}
          placeholder={t('profile.nickPlaceholder')}
          maxLength={32}
        />
      </div>
    </div>
  )
}
