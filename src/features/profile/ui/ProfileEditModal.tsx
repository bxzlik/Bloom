import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { openColorPicker } from '@features/settings'
import {
  useProfileStore,
  type ProfileData,
  type BannerColorMode,
} from '../model/profileStore'
import { readFileAsDataURL } from '../lib/readFileAsDataURL'
import { Ico } from '@shared/ui/icons/solar'
import { EmptyAvatar } from './EmptyAvatar'
import { ImageCropper } from './ImageCropper'

/**
 * Модалка редактирования профиля. `#peditBackdrop` / `openProfileModal`.
 *
 * Раскладка портирована с мобилки (`profile_edit_screen.dart`): сверху живой
 * предпросмотр шапки профиля, дальше голые поля «капсовая подпись + плашка»
 * без карточек и заголовков-секций, снизу «Отмена / Сохранить».
 *
 * Картинки меняются НЕ крестиками и hover-пилюлями, а одной панелью
 * (`.pedit-imgpanel`): клик по обложке или аватарке в хиро разворачивает её под
 * ним. Внутри — две вкладки-миниатюры (аватар / обложка), крупное превью
 * выбранного, для обложки её цвет (solid/градиент + углы), кнопка «Загрузить»
 * и красная «Удалить…». Повторный клик по той же цели панель сворачивает.
 *
 * Загруженное уходит в `ImageCropper` (круг для аватара, аспект настоящей
 * карточки профиля для обложки). Сохранение → profileStore.
 *
 * Открытие — флаг `editOpen` в profileStore; анимация `.open` (двойной rAF).
 */

const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]
const ANGLE_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

type Draft = ProfileData
/** Какую из двух картинок профиля правит развёрнутая панель. */
type ImageTab = 'avatar' | 'banner'

/** Кликабельный swatch (.cin-swatch) → кастомный HSV-пикер `openColorPicker`. */
const Swatch = ({
  color,
  onChange,
  style,
}: {
  color: string
  onChange: (hex: string) => void
  style?: React.CSSProperties
}) => (
  <button
    className="cin-swatch"
    style={{ background: color, ...style }}
    onClick={(e) => openColorPicker({ anchor: e.currentTarget, color, onChange })}
  />
)

export const ProfileEditModal = () => {
  const t = useT()
  const editOpen = useProfileStore((s) => s.editOpen)
  const closeEdit = useProfileStore((s) => s.closeEdit)
  const setProfile = useProfileStore((s) => s.setProfile)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [crop, setCrop] = useState<{ dataUrl: string; type: ImageTab } | null>(null)
  const [imgTab, setImgTab] = useState<ImageTab | null>(null)

  const bannerInputRef = useRef<HTMLInputElement>(null)
  const avaInputRef = useRef<HTMLInputElement>(null)

  // Открытие: снимок текущего профиля в draft + анимация.
  useEffect(() => {
    if (editOpen) {
      const s = useProfileStore.getState()
      setDraft({
        name: s.name, bio: s.bio, status: s.status,
        bannerColor: s.bannerColor, bannerColor2: s.bannerColor2, bannerColorMode: s.bannerColorMode,
        bannerAngle: s.bannerAngle, avatar: s.avatar, banner: s.banner,
      })
      setCrop(null)
      setImgTab(null)
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
  }, [editOpen])

  // Esc: в кропе → назад, из панели картинок → свернуть, иначе закрыть.
  useEffect(() => {
    if (!editOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (crop) setCrop(null)
      else if (imgTab) setImgTab(null)
      else closeEdit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editOpen, crop, imgTab, closeEdit])

  if (!mounted || !draft) return null

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d))

  const bannerBg =
    draft.bannerColorMode === 'gradient'
      ? `linear-gradient(${draft.bannerAngle}deg,${draft.bannerColor} 0%,${draft.bannerColor2} 100%)`
      : draft.bannerColor

  /** Клик по цели в хиро: та же цель сворачивает панель, другая — переключает. */
  const toggleTab = (tab: ImageTab) => setImgTab((cur) => (cur === tab ? null : tab))

  const onPickFile = (type: ImageTab) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    void readFileAsDataURL(f).then((data) => setCrop({ dataUrl: data, type }))
  }

  // Аспект рамки баннера из реальной карточки профиля.
  const bannerWrap = document.getElementById('accBannerWrap')
  const bannerAspect =
    bannerWrap && bannerWrap.offsetWidth ? bannerWrap.offsetHeight / bannerWrap.offsetWidth : 220 / 700

  const onCropApply = (dataUrl: string) => {
    if (crop?.type === 'avatar') patch({ avatar: dataUrl })
    else patch({ banner: dataUrl })
    setCrop(null)
  }

  const save = () => {
    setProfile({
      name: draft.name.trim() || useProfileStore.getState().name,
      bio: draft.bio.trim(),
      status: draft.status.trim(),
      bannerColor: draft.bannerColor,
      bannerColor2: draft.bannerColor2,
      bannerColorMode: draft.bannerColorMode,
      bannerAngle: draft.bannerAngle,
      avatar: draft.avatar,
      banner: draft.banner,
    })
    closeEdit()
    toast(t('profile.toast.saved'))
  }

  const setBannerMode = (m: BannerColorMode) => patch({ bannerColorMode: m })

  /** Обложка как заливка: своя картинка либо цвет/градиент. */
  const bannerFill = (className: string) => (
    <div className={className} style={{ background: bannerBg }}>
      {draft.banner && <img src={draft.banner} alt="" />}
    </div>
  )
  /** Аватар: своя картинка либо заглушка-человечек. */
  const avaFill = (className: string) =>
    draft.avatar ? (
      <div className={className}><img src={draft.avatar} alt="" /></div>
    ) : (
      <EmptyAvatar className={className} />
    )

  const hasOwn = imgTab === 'avatar' ? !!draft.avatar : !!draft.banner

  return createPortal(
    <div
      id="peditBackdrop"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget && !crop) closeEdit()
      }}
      onTransitionEnd={(e) => {
        if (!editOpen && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div id="peditModal">
        <div id="peditMainView" style={{ display: crop ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* HERO: живой предпросмотр шапки профиля — обложка, аватар, ник */}
          <div className="pedit-hero">
            <div
              className={`pedit-hero-banner${imgTab === 'banner' ? ' active' : ''}`}
              onClick={() => toggleTab('banner')}
            >
              {bannerFill('pedit-hero-banner-fill')}
              <div className="pedit-hero-pick">
                <Ico name="galleryWide" width={17} height={17} />
              </div>
            </div>

            <div
              className={`pedit-hero-ava-wrap${imgTab === 'avatar' ? ' active' : ''}`}
              onClick={() => toggleTab('avatar')}
            >
              {avaFill('pedit-hero-ava')}
              <div className="pedit-ava-cam">
                <Ico name="camera" width={18} height={18} style={{ color: '#fff' }} />
              </div>
            </div>

            <div className={`pedit-hero-name${draft.name.trim() ? '' : ' empty'}`}>
              {draft.name.trim() || t('profile.nickPlaceholder')}
            </div>
          </div>

          <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickFile('banner')} />
          <input ref={avaInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickFile('avatar')} />

          <div className="pedit-body">
            {/* Панель картинок: разворачивается кликом по хиро */}
            {imgTab && (
              <div className="pedit-imgpanel">
                <div className="pedit-img-tabs">
                  <button
                    className={`pedit-img-tab${imgTab === 'avatar' ? ' active' : ''}`}
                    onClick={() => setImgTab('avatar')}
                    aria-label={t('profile.avatar')}
                  >
                    {avaFill('pedit-img-tab-ava')}
                  </button>
                  <button
                    className={`pedit-img-tab${imgTab === 'banner' ? ' active' : ''}`}
                    onClick={() => setImgTab('banner')}
                    aria-label={t('profile.cover')}
                  >
                    {bannerFill('pedit-img-tab-banner')}
                  </button>
                </div>

                <div className="pedit-img-preview">
                  {imgTab === 'avatar'
                    ? avaFill('pedit-img-prev-ava')
                    : bannerFill('pedit-img-prev-banner')}
                </div>

                {/* Цвет обложки живёт здесь: она бывает не картинкой, а заливкой */}
                {imgTab === 'banner' && (
                  <div className="pedit-color-field">
                    <div className="pedit-banner-color-header">
                      <div className="pedit-banner-swatches">
                        <Swatch color={draft.bannerColor} onChange={(h) => patch({ bannerColor: h })} />
                        {draft.bannerColorMode === 'gradient' && (
                          <Swatch color={draft.bannerColor2} onChange={(h) => patch({ bannerColor2: h })} />
                        )}
                      </div>
                      <div className="pedit-mode-toggle">
                        <button className={`pedit-mode-btn${draft.bannerColorMode === 'solid' ? ' active' : ''}`} onClick={() => setBannerMode('solid')}>{t('profile.solid')}</button>
                        <button className={`pedit-mode-btn${draft.bannerColorMode === 'gradient' ? ' active' : ''}`} onClick={() => setBannerMode('gradient')}>{t('profile.gradient')}</button>
                      </div>
                    </div>
                    {draft.bannerColorMode === 'gradient' && (
                      <div className="pedit-angle-row">
                        {ANGLES.map((a, i) => (
                          <button
                            key={a}
                            className={`pedit-angle-btn${a === draft.bannerAngle ? ' active' : ''}`}
                            onClick={() => patch({ bannerAngle: a })}
                          >
                            {ANGLE_ARROWS[i]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  className="pedit-img-upload"
                  onClick={() => (imgTab === 'avatar' ? avaInputRef : bannerInputRef).current?.click()}
                >
                  <Ico name="import" width={16} height={16} />
                  {t('profile.upload')}
                </button>
                {hasOwn && (
                  <button
                    className="pedit-img-drop"
                    onClick={() => patch(imgTab === 'avatar' ? { avatar: null } : { banner: null })}
                  >
                    {t(imgTab === 'avatar' ? 'profile.removeAvatar' : 'profile.removeCover')}
                  </button>
                )}
              </div>
            )}

            {/* Поля — без карточек и заголовков секций */}
            <div className="pedit-eg">
              <div className="pedit-bio-label">{t('profile.nick')}</div>
              <div className="pedit-inp-wrap">
                <input
                  className="pedit-nick-inp"
                  maxLength={32}
                  placeholder={t('profile.nickPlaceholder')}
                  style={{ paddingRight: 46 }}
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
                <span className="pedit-char-count">{draft.name.length}/32</span>
              </div>
            </div>

            <div className="pedit-eg">
              <div className="pedit-bio-label">{t('profile.about')}</div>
              <div className="pedit-inp-wrap">
                <textarea
                  className="pedit-bio-inp"
                  maxLength={300}
                  placeholder={t('profile.aboutPlaceholder')}
                  style={{ paddingBottom: 22 }}
                  value={draft.bio}
                  onChange={(e) => patch({ bio: e.target.value })}
                />
                <span className="pedit-char-count area">{draft.bio.length}/300</span>
              </div>
            </div>

            <div className="pedit-eg">
              <div className="pedit-bio-label">{t('profile.status')}</div>
              <div className="pedit-inp-wrap">
                <input
                  className="pedit-nick-inp"
                  maxLength={80}
                  placeholder={t('profile.statusPlaceholder')}
                  style={{ fontStyle: 'italic', paddingRight: 46 }}
                  value={draft.status}
                  onChange={(e) => patch({ status: e.target.value })}
                />
                <span className="pedit-char-count">{draft.status.length}/80</span>
              </div>
            </div>
          </div>

          <div className="pedit-foot">
            <button className="pedit-btn-cancel" onClick={closeEdit}>{t('common.cancel')}</button>
            <button className="pedit-btn-save" onClick={save}>{t('common.save')}</button>
          </div>
        </div>

        {crop && (
          <ImageCropper
            dataUrl={crop.dataUrl}
            type={crop.type}
            bannerAspect={bannerAspect}
            onApply={onCropApply}
            onBack={() => setCrop(null)}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}
