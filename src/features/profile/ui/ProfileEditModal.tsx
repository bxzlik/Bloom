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
  type AvaBorderMode,
} from '../model/profileStore'
import { discDefColors } from '../lib/discSvg'
import { readFileAsDataURL } from '../lib/readFileAsDataURL'
import { Ico } from '@shared/ui/icons/solar'
import { DiscAvatar } from './DiscAvatar'
import { ImageCropper } from './ImageCropper'

/**
 * Модалка редактирования профиля. `#peditBackdrop` / `openProfileModal`
 * + `_pedit*`. Поля ник/био/статус, винил-пикер,
 * цвет обложки (solid/градиент + углы), обводка аватара (accent/custom/off),
 * загрузка+кроп баннера/аватара (через ImageCropper). Сохранение → profileStore.
 *
 * Цвета выбираются кастомным HSV-попапом (`openColorPicker` → `#cpPopup`) —
 * единый пикер из features/settings.
 *
 * Открытие — флаг `editOpen` в profileStore; анимация `.open` (двойной rAF).
 */

const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]
const ANGLE_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

type Draft = ProfileData

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
  const [crop, setCrop] = useState<{ dataUrl: string; type: 'avatar' | 'banner' } | null>(null)

  const bannerInputRef = useRef<HTMLInputElement>(null)
  const avaInputRef = useRef<HTMLInputElement>(null)

  // Открытие: снимок текущего профиля в draft + анимация.
  useEffect(() => {
    if (editOpen) {
      const s = useProfileStore.getState()
      setDraft({
        name: s.name, bio: s.bio, status: s.status, discIdx: s.discIdx, discColor: s.discColor,
        bannerColor: s.bannerColor, bannerColor2: s.bannerColor2, bannerColorMode: s.bannerColorMode,
        bannerAngle: s.bannerAngle, avaBorderColor: s.avaBorderColor, avaBorderMode: s.avaBorderMode,
        avatar: s.avatar, banner: s.banner,
      })
      setCrop(null)
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
  }, [editOpen])

  // Esc: в кропе → назад, иначе закрыть.
  useEffect(() => {
    if (!editOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (crop) setCrop(null)
      else closeEdit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editOpen, crop, closeEdit])

  if (!mounted || !draft) return null

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d))

  const bannerBg =
    draft.bannerColorMode === 'gradient'
      ? `linear-gradient(${draft.bannerAngle}deg,${draft.bannerColor} 0%,${draft.bannerColor2} 100%)`
      : draft.bannerColor

  const onBannerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    void readFileAsDataURL(f).then((data) => setCrop({ dataUrl: data, type: 'banner' }))
  }
  const onAvaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    void readFileAsDataURL(f).then((data) => setCrop({ dataUrl: data, type: 'avatar' }))
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
      discIdx: draft.discIdx,
      discColor: draft.discColor,
      bannerColor: draft.bannerColor,
      bannerColor2: draft.bannerColor2,
      bannerColorMode: draft.bannerColorMode,
      bannerAngle: draft.bannerAngle,
      avaBorderColor: draft.avaBorderColor,
      avaBorderMode: draft.avaBorderMode,
      avatar: draft.avatar,
      banner: draft.banner,
    })
    closeEdit()
    toast(t('profile.toast.saved'))
  }

  const setBorderMode = (m: AvaBorderMode) => patch({ avaBorderMode: m })
  const setBannerMode = (m: BannerColorMode) => patch({ bannerColorMode: m })

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
          {/* HERO: баннер + крупный аватар по центру + имя заголовком */}
          <div className="pedit-hero">
            <div className="pedit-hero-banner" style={{ background: bannerBg }}>
              {draft.banner && <img src={draft.banner} alt="" />}
              <div className="pedit-banner-overlay">
                <label className="pedit-banner-overlay-btn">
                  <Ico name="camera" width={12} height={12} />
                  {t('profile.changeCover')}
                  <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onBannerFile} />
                </label>
              </div>
              {draft.banner && (
                <button className="pedit-banner-remove" style={{ display: 'flex' }} onClick={() => patch({ banner: null })}>
                  <Ico name="trash" width={13} height={13} />
                </button>
              )}
            </div>

            <div className="pedit-hero-ava-wrap" onClick={() => avaInputRef.current?.click()}>
              {draft.avatar ? (
                <div className="pedit-hero-ava"><img src={draft.avatar} alt="" /></div>
              ) : (
                <DiscAvatar idx={draft.discIdx} color={draft.discColor} className="pedit-hero-ava" />
              )}
              <div className="pedit-ava-cam">
                <Ico name="camera" width={18} height={18} style={{ color: '#fff' }} />
              </div>
              {draft.avatar && (
                <button
                  className="pedit-ava-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    patch({ avatar: null })
                  }}
                >
                  <Ico name="close" width={11} height={11} />
                </button>
              )}
              <input ref={avaInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvaFile} />
            </div>

            <div className={`pedit-hero-name${draft.name.trim() ? '' : ' empty'}`}>
              {draft.name.trim() || t('profile.nickPlaceholder')}
            </div>
            <div className="pedit-hero-sub">{t('profile.edit.title')}</div>
          </div>

          <div className="pedit-body">
            {/* Карточка: Профиль */}
            <div className="pedit-card">
              <div className="pedit-card-title">
                <Ico name="user" width={14} height={14} />
                {t('profile.section.profile')}
              </div>

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

              {/* Био + статус */}
              <div className="pedit-bio-section">
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
                <div className="pedit-bio-label" style={{ marginTop: 8 }}>{t('profile.status')}</div>
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

            {/* Карточка: Внешний вид */}
            <div className="pedit-card">
              <div className="pedit-card-title">
                <Ico name="vinyl" width={14} height={14} />
                {t('profile.section.appearance')}
              </div>

              {/* Пластинка */}
              <div className="pedit-disc-section">
                <div className="pedit-bio-label">{t('profile.disc')}</div>
                <div className="pedit-disc-row">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`pedit-disc-opt${i === draft.discIdx && !draft.discColor ? ' active' : ''}`}
                      onClick={() => patch({ discIdx: i, discColor: null })}
                    >
                      <DiscAvatar idx={i} color={null} style={{ width: '100%', height: '100%' }} />
                    </div>
                  ))}
                  <DiscColorSwatch
                    idx={draft.discIdx}
                    color={draft.discColor}
                    onChange={(hex) => patch({ discColor: hex })}
                  />
                </div>
              </div>

              {/* Цвета: обложка + обводка */}
              <div className="pedit-colors-section">
              <div className="pedit-color-field">
                <div className="pedit-banner-color-header">
                  <div className="pedit-bio-label" style={{ margin: 0 }}>{t('profile.coverColor')}</div>
                  <div className="pedit-mode-toggle">
                    <button className={`pedit-mode-btn${draft.bannerColorMode === 'solid' ? ' active' : ''}`} onClick={() => setBannerMode('solid')}>{t('profile.solid')}</button>
                    <button className={`pedit-mode-btn${draft.bannerColorMode === 'gradient' ? ' active' : ''}`} onClick={() => setBannerMode('gradient')}>{t('profile.gradient')}</button>
                  </div>
                </div>
                <div className="pedit-banner-swatches">
                  <Swatch color={draft.bannerColor} onChange={(h) => patch({ bannerColor: h })} />
                  {draft.bannerColorMode === 'gradient' && (
                    <>
                      <span className="pedit-grad-sep">→</span>
                      <Swatch color={draft.bannerColor2} onChange={(h) => patch({ bannerColor2: h })} />
                    </>
                  )}
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
              <div className="pedit-color-field">
                <div className="pedit-banner-color-header">
                  <div className="pedit-bio-label" style={{ margin: 0 }}>{t('profile.border')}</div>
                  <div className="pedit-mode-toggle">
                    <button className={`pedit-mode-btn${draft.avaBorderMode === 'accent' ? ' active' : ''}`} onClick={() => setBorderMode('accent')}>{t('settings.interface.libSys.accent')}</button>
                    <button className={`pedit-mode-btn${draft.avaBorderMode === 'custom' ? ' active' : ''}`} onClick={() => setBorderMode('custom')}>{t('profile.solid')}</button>
                    <button className={`pedit-mode-btn${draft.avaBorderMode === 'off' ? ' active' : ''}`} onClick={() => setBorderMode('off')}>{t('settings.discord.mode.off')}</button>
                  </div>
                </div>
                {draft.avaBorderMode === 'custom' && (
                  <Swatch color={draft.avaBorderColor || '#ffffff'} onChange={(h) => patch({ avaBorderColor: h })} />
                )}
              </div>
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

/** Седьмой слот пластинки — кастомный цвет диска. */
const DiscColorSwatch = ({
  idx,
  color,
  onChange,
}: {
  idx: number
  color: string | null
  onChange: (hex: string) => void
}) => (
  <div
    className={`pedit-disc-custom${color ? ' has-color' : ''}`}
    onClick={(e) => openColorPicker({ anchor: e.currentTarget, color: color || discDefColors[idx % 6], onChange })}
  >
    <div className="pedit-disc-custom-svg">
      <DiscAvatar idx={idx} color={color} style={{ width: '100%', height: '100%' }} />
    </div>
    <div className="pedit-disc-custom-badge">
      <Ico name="palette" width={8} height={8} style={{ color: '#fff' }} />
    </div>
  </div>
)
