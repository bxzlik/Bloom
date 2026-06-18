import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useThemeStore, THEME_PRESETS } from '@features/settings'
import { useProfileStore } from '@features/profile'
import { makeDiscSvg } from '@features/profile'
import { compressCover } from '@features/library'
import { useOnboardingStore } from '../model/onboardingStore'
import { useT } from '@shared/i18n'

/**
 * Онбординг первого запуска `#onboarding`. Шаг 1 — карточка профиля (обложка-баннер + аватар +
 * никнейм) + сетка из 6 мини-тем + «Начать»; шаг 2 — приветствие «Привет, {name}!»,
 * затем оверлей угасает и размонтируется (useOnboardingStore.finish).
 *
 * Тема применяется live на клик по карточке (useThemeStore.applyTheme → меняет
 * CSS-переменные); инлайн-стили оверлея на var(--...) → перекрашиваются сами.
 * Профиль (ник/аватар/баннер) пишется в useProfileStore при «Начать».
 *
 * CSS: keyframes obIn/obOut + .ob-theme-card/.ob-tc-* + hover-правила
 * #obAvaWrap/#obCoverWrap/#obStartBtn (shared/styles/onboarding-search.css).
 */
const MINI = THEME_PRESETS.slice(0, 6)

export const Onboarding = () => {
  const t = useT()
  const done = useOnboardingStore((s) => s.done)
  const finish = useOnboardingStore((s) => s.finish)
  const applyTheme = useThemeStore((s) => s.applyTheme)
  const setProfile = useProfileStore((s) => s.setProfile)

  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [theme, setTheme] = useState<string>(
    () => useThemeStore.getState().activeThemeId || MINI[0]!.id,
  )
  const [step, setStep] = useState<1 | 2>(1)
  const [exiting, setExiting] = useState(false)

  const avaInpRef = useRef<HTMLInputElement | null>(null)
  const coverInpRef = useRef<HTMLInputElement | null>(null)

  if (done) return null

  const readFile = (f: File | undefined, cb: (data: string) => void) => {
    if (!f) return
    const r = new FileReader()
    r.onload = (e) => {
      const d = e.target?.result
      if (typeof d === 'string') cb(d)
    }
    r.readAsDataURL(f)
  }

  const pickTheme = (id: string) => {
    setTheme(id)
    applyTheme(id) // применяем live — CSS-переменные меняются, оверлей перекрашивается
  }

  const onFinish = () => {
    const nm = name.trim() || t('common.defaultUser')
    applyTheme(theme)

    const patch: Parameters<typeof setProfile>[0] = { name: nm }
    if (avatar) patch.avatar = avatar
    setProfile(patch)
    // Обложку → баннер профиля (сжатие 800px, obFinish).
    if (cover) {
      void compressCover(cover, 800, 0.88)
        .then((c) => setProfile({ banner: c }))
        .catch(() => setProfile({ banner: cover }))
    }

    // Шаг 2 (приветствие) → угасание → размонтирование.
    setStep(2)
    window.setTimeout(() => {
      setExiting(true)
      window.setTimeout(() => finish(), 400)
    }, 1800)
  }

  const welcomeName = name.trim() || t('common.defaultUser')

  return createPortal(
    <div
      id="onboarding"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--bg, #0f0f0f)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        animation: exiting ? 'obOut .4s ease forwards' : undefined,
      }}
    >
      {step === 1 ? (
        <div
          id="ob-step1"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: 400,
            padding: '0 16px',
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, marginBottom: 4, color: 'var(--text, #fff)' }}>
            Bloom
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted, #555)', marginBottom: 20 }}>{t('onb.tagline')}</div>

          {/* Карточка профиля */}
          <div
            id="obCard"
            style={{
              width: '100%',
              background: 'var(--card, #1a1a1a)',
              border: '1px solid var(--border, #2a2a2a)',
              borderRadius: 20,
              position: 'relative',
            }}
          >
            {/* Обложка-баннер */}
            <div
              id="obCoverWrap"
              className={cover ? 'has-cover' : ''}
              style={{
                display: 'block',
                position: 'relative',
                height: 110,
                background: 'linear-gradient(135deg,var(--hover,#222),var(--bg2,#141414))',
                overflow: 'hidden',
                borderRadius: '19px 19px 0 0',
              }}
            >
              <div
                id="obCoverImg"
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  opacity: cover ? 1 : 0,
                  backgroundImage: cover ? `url(${cover})` : undefined,
                  transition: 'opacity .4s',
                }}
              />
              <div
                id="obCoverEmpty"
                onClick={() => coverInpRef.current?.click()}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  color: 'var(--muted, #555)',
                  transition: '.2s',
                  cursor: 'pointer',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{t('onb.addCover')}</span>
              </div>
              <div
                id="obCoverOverlay"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: 0,
                  transition: '.2s',
                  pointerEvents: 'none',
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    coverInpRef.current?.click()
                  }}
                  style={obCoverBtnStyle}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  {t('common.change')}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setCover(null)
                    if (coverInpRef.current) coverInpRef.current.value = ''
                  }}
                  style={{ ...obCoverBtnStyle, background: 'rgba(224,48,48,.25)', border: '1px solid rgba(224,48,48,.5)', color: '#ff7070' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  {t('common.remove')}
                </button>
              </div>
              <input
                ref={coverInpRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => readFile(e.target.files?.[0], setCover)}
              />
            </div>

            {/* Аватар + ник */}
            <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', flexShrink: 0, marginTop: -28, zIndex: 2 }} id="obAvaWrap">
                <label style={{ position: 'relative', cursor: 'pointer', display: 'block' }} id="obAvaLabel">
                  <div
                    id="obAva"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'var(--card, #1a1a1a)',
                      border: avatar ? 'none' : '3px solid var(--bg, #0f0f0f)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      boxShadow: '0 0 0 2px var(--border, #2a2a2a)',
                      position: 'relative',
                    }}
                  >
                    {avatar ? (
                      <img src={avatar} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--muted,#555)" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    )}
                    <div
                      id="obAvaOverlay"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(0,0,0,.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0,
                        transition: '.2s',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                  </div>
                  {!avatar && (
                    <div
                      id="obAvaBadge"
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'var(--hover, #222)',
                        border: '2px solid var(--bg, #0f0f0f)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                        zIndex: 3,
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--accent,#888)" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                  )}
                  <input
                    ref={avaInpRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => readFile(e.target.files?.[0], setAvatar)}
                  />
                </label>
                {avatar && (
                  <button
                    id="obAvaRemoveBtn"
                    onClick={() => {
                      setAvatar(null)
                      if (avaInpRef.current) avaInpRef.current.value = ''
                    }}
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 17,
                      height: 17,
                      borderRadius: '50%',
                      background: '#e03030',
                      border: '2px solid var(--bg, #0f0f0f)',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 4,
                      padding: 0,
                    }}
                  >
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onFinish()
                }}
                placeholder={t('profile.nickPlaceholder')}
                maxLength={32}
                style={{
                  background: 'var(--hover, #222)',
                  border: '1px solid var(--border, #2a2a2a)',
                  borderRadius: 10,
                  color: 'var(--text, #fff)',
                  padding: '9px 14px',
                  fontSize: 13.5,
                  outline: 'none',
                  width: '100%',
                  textAlign: 'center',
                  fontFamily: 'inherit',
                  transition: '.2s',
                }}
              />
            </div>

            <div style={{ height: 1, background: 'var(--border, #2a2a2a)', margin: '0 18px' }} />

            {/* Тема оформления */}
            <div style={{ padding: '14px 18px 18px' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--muted, #555)',
                  textTransform: 'uppercase',
                  letterSpacing: '.9px',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41" />
                </svg>
                {t('onb.theme')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                {MINI.map((t) => (
                  <div
                    key={t.id}
                    className={`ob-theme-card${t.id === theme ? ' active' : ''}`}
                    onClick={() => pickTheme(t.id)}
                    style={{ ['--ob-accent' as string]: t.preview.accent }}
                  >
                    <div className="ob-tc-preview" style={{ background: t.preview.bg }}>
                      <div className="ob-tc-bar" style={{ background: t.preview.card }} />
                      <div className="ob-tc-bar" style={{ background: t.preview.card }} />
                      <div className="ob-tc-bar" style={{ background: t.preview.card }} />
                      <div className="ob-tc-dot" style={{ background: t.preview.accent }} />
                    </div>
                    <div className="ob-tc-foot" style={{ background: t.preview.bg }}>
                      <div className="ob-tc-name">{t.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            id="obStartBtn"
            onClick={onFinish}
            style={{
              marginTop: 14,
              background: 'var(--accent, #fff)',
              color: 'var(--accent-text, #000)',
              border: 'none',
              borderRadius: 12,
              padding: '11px 32px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              transition: '.15s',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            {t('onb.start')}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          id="ob-step2"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', position: 'relative', zIndex: 1 }}
        >
          <div
            id="obWelcomeAva"
            style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--card, #1a1a1a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, overflow: 'hidden' }}
          >
            {avatar ? (
              <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span dangerouslySetInnerHTML={{ __html: makeDiscSvg(0, null, 'obWelcomeDisc') }} />
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text, #fff)' }}>{t('onb.welcome', { name: welcomeName })}</div>
          <div style={{ fontSize: 13, color: 'var(--text2, #999)', display: 'flex', alignItems: 'center', gap: 5 }}>
            {t('onb.welcomeSub')}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

const obCoverBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.15)',
  border: '1px solid rgba(255,255,255,.25)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 11,
  fontWeight: 600,
  padding: '5px 11px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontFamily: 'inherit',
  pointerEvents: 'auto',
}
