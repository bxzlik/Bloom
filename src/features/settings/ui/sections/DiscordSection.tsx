import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../model'
import { usePlayerStore, useQueueStore, trackProviderId } from '@features/player'
import { useLibStore } from '@features/library'
import { trackRegistry } from '@entities/track'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/** Площадка трека → public-бейдж для превью (local/неизвестно → лого приложения). */
const PLATFORM_BADGE: Record<string, string> = {
  soundcloud: '/logop/soundcloud.png',
  ytmusic: '/logop/ytmusic.png',
  spotify: '/logop/spotify.png',
  yandex: '/logop/yandex.png',
}

/**
 * Раздел «Discord RPC» (`ssec-discord`) — полная конфигурация Rich
 * Presence: вкл/выкл, прогресс, обложка (авто/кастом), иконка приложения
 * (выкл/дефолт/кастом), 2 кнопки (выкл/на трек/на артиста/кастомная) + живой
 * предпросмотр Discord-карточки. `drpc*`-функций.
 *
 * Источник правды — Rust AppSettings (через settingsStore): `discord_rpc` +
 * 10 `discord_*`. Режимы обложки/иконки выводятся из полей; URL-инпуты держим в
 * локальном драфте (применяются по кнопке, `drpcApplyCoverUrl`/`drpcApplyBtnCustom`).
 */

type CoverMode = 'auto' | 'custom'
type SmallMode = 'off' | 'default' | 'custom' | 'platform'
type BtnMode = 'off' | 'track' | 'artist' | 'custom'

/** Текущий режим иконки: mode — источник правды; для legacy-конфигов (пусто)
 * выводим из show/url как раньше. */
const deriveSmallMode = (show: boolean, url: string, mode: string): SmallMode => {
  if (!show) return 'off'
  if (mode === 'default' || mode === 'custom' || mode === 'platform') return mode
  return url ? 'custom' : 'default'
}

const fmtTime = (s: number): string => {
  const t = Math.max(0, Math.floor(s || 0))
  const m = Math.floor(t / 60)
  const sec = t % 60
  return `${m}:${sec < 10 ? '0' : ''}${sec}`
}

export const DiscordSection = () => {
  const t = useT()
  const loaded = useSettingsStore((s) => s.loaded)
  const enabled = useSettingsStore((s) => s.discord_rpc)
  const showProgress = useSettingsStore((s) => s.discord_show_progress)
  const customArtwork = useSettingsStore((s) => s.discord_custom_artwork)
  const showSmallImg = useSettingsStore((s) => s.discord_show_small_img)
  const smallImgUrl = useSettingsStore((s) => s.discord_small_img_url)
  const smallImgMode = useSettingsStore((s) => s.discord_small_img_mode)
  const b1mode = useSettingsStore((s) => s.discord_btn1_mode)
  const b1label = useSettingsStore((s) => s.discord_btn1_label)
  const b1url = useSettingsStore((s) => s.discord_btn1_url)
  const b2mode = useSettingsStore((s) => s.discord_btn2_mode)
  const b2label = useSettingsStore((s) => s.discord_btn2_label)
  const b2url = useSettingsStore((s) => s.discord_btn2_url)
  const setDiscordRpc = useSettingsStore((s) => s.setDiscordRpc)
  const setDiscordSettings = useSettingsStore((s) => s.setDiscordSettings)

  // Локальные UI-режимы (sticky-подсветка кнопок) + драфты URL/текстов кнопок.
  // Инициализируются из полей стора и пере-синкаются когда настройки догрузились.
  const [coverMode, setCoverMode] = useState<CoverMode>(() =>
    customArtwork && customArtwork !== 'off' ? 'custom' : 'auto',
  )
  const [smallMode, setSmallMode] = useState<SmallMode>(() =>
    deriveSmallMode(showSmallImg, smallImgUrl, smallImgMode),
  )
  const [coverUrl, setCoverUrl] = useState(() => (customArtwork && customArtwork !== 'off' ? customArtwork : ''))
  const [smallUrl, setSmallUrl] = useState(() => smallImgUrl)
  const [l1, setL1] = useState(b1label)
  const [u1, setU1] = useState(b1url)
  const [l2, setL2] = useState(b2label)
  const [u2, setU2] = useState(b2url)

  // Когда настройки догрузились из Rust — синхронизируем локальные драфты/режимы.
  useEffect(() => {
    if (!loaded) return
    const st = useSettingsStore.getState()
    setCoverMode(st.discord_custom_artwork && st.discord_custom_artwork !== 'off' ? 'custom' : 'auto')
    setCoverUrl(st.discord_custom_artwork && st.discord_custom_artwork !== 'off' ? st.discord_custom_artwork : '')
    setSmallMode(deriveSmallMode(st.discord_show_small_img, st.discord_small_img_url, st.discord_small_img_mode))
    setSmallUrl(st.discord_small_img_url)
    setL1(st.discord_btn1_label)
    setU1(st.discord_btn1_url)
    setL2(st.discord_btn2_label)
    setU2(st.discord_btn2_url)
  }, [loaded])

  // Превью трека — из плеера (реактивно, без интервала).
  const titleText = usePlayerStore((s) => s.title) || 'Track Title'
  const artist = usePlayerStore((s) => s.artist) || 'Track Artist'
  const artwork = usePlayerStore((s) => s.artwork)
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  const b1 = (b1mode || 'off') as BtnMode
  const b2 = (b2mode || 'off') as BtnMode

  // Сломанная (не загрузившаяся) обложка превью → показываем плейсхолдер.
  const [brokenCover, setBrokenCover] = useState<string | null>(null)

  // ── Хендлеры (каждый — патч в Rust через setDiscordSettings) ──
  const pickCover = (m: CoverMode) => {
    setCoverMode(m)
    void setDiscordSettings({ discord_custom_artwork: m === 'custom' ? coverUrl : '' })
  }
  const applyCoverUrl = () => {
    setCoverMode('custom')
    void setDiscordSettings({ discord_custom_artwork: coverUrl.trim() })
  }
  const pickSmall = (m: SmallMode) => {
    setSmallMode(m)
    if (m === 'off') void setDiscordSettings({ discord_show_small_img: false, discord_small_img_url: '', discord_small_img_mode: 'off' })
    else if (m === 'default') void setDiscordSettings({ discord_show_small_img: true, discord_small_img_url: '', discord_small_img_mode: 'default' })
    else if (m === 'platform') void setDiscordSettings({ discord_show_small_img: true, discord_small_img_url: '', discord_small_img_mode: 'platform' })
    else void setDiscordSettings({ discord_show_small_img: true, discord_small_img_url: smallUrl.trim(), discord_small_img_mode: 'custom' })
  }
  const applySmallUrl = () => {
    setSmallMode('custom')
    void setDiscordSettings({ discord_show_small_img: true, discord_small_img_url: smallUrl.trim(), discord_small_img_mode: 'custom' })
  }

  // Превью: src обложки и иконки. Показываем обложку как есть (в т.ч. data: у
  // локальных треков) — это UI-подсказка о текущем треке. То, что Discord
  // отрисует только публичные http(s)-обложки (а локальные → иконка приложения),
  // — поведение Rust-стороны, превью его не отражает (показывает реальную обложку).
  const previewCover = coverMode === 'custom' && coverUrl ? coverUrl : artwork || ''
  const showCoverImg = !!previewCover && brokenCover !== previewCover
  // Бейдж площадки текущего трека (для превью режима «Площадка»).
  const curId = useQueueStore((s) => s.curId)
  const curTrack =
    useLibStore((s) => (curId ? s.tracks.find((t) => t.id === curId) ?? null : null)) ??
    (curId ? trackRegistry.get(curId) ?? null : null)
  const platformBadge = PLATFORM_BADGE[trackProviderId(curTrack)] ?? '/logo.png'
  const previewSmallSrc =
    smallMode === 'custom' && smallUrl
      ? smallUrl
      : smallMode === 'platform'
        ? platformBadge
        : smallMode === 'default'
          ? '/logo.png'
          : ''

  const btnLabel = (m: BtnMode, label: string): string =>
    m === 'track' ? t('settings.discord.btnMode.track') : m === 'artist' ? t('settings.discord.btnMode.artist') : label || t('settings.discord.btnLabel.fallback')

  return (
    <div className="s-section active" id="ssec-discord">
      <div className="s-section-head">
        <div className="s-section-title">
          <DiscordIcon /> Discord RPC
        </div>
      </div>

      {/* Карточка вкл/выкл — структура `sc viz-block` с HTML (НЕ
          drpc-main-card: у того своя flex-раскладка прямых детей, несовместимая
          с viz-block-top). Чип ВКЛ/ВЫКЛ прижат вправо через viz-block-top
          space-between; цвет иконки меняется инлайном по enabled. */}
      <div
        className="sc viz-block"
        onClick={() => void setDiscordRpc(!enabled)}
        style={{ cursor: 'pointer', userSelect: 'none', opacity: loaded ? 1 : 0.5, pointerEvents: loaded ? undefined : 'none' }}
      >
        <div className="viz-block-top">
          <div className="viz-block-info">
            <div
              className="viz-block-icon"
              style={{
                background: enabled ? 'rgba(88,101,242,.26)' : 'rgba(88,101,242,.12)',
                borderColor: enabled ? 'rgba(88,101,242,.5)' : 'rgba(88,101,242,.2)',
                color: '#5865f2',
                transition: '.2s',
              }}
            >
              <DiscordIcon size={20} />
            </div>
            <div>
              <div className="sl2" style={{ fontSize: 13, fontWeight: 700 }}>{t('settings.discord.enabled.title')}</div>
              <div className="ssub">{t('settings.discord.enabled.sub')}</div>
            </div>
          </div>
          <div className="drpc-on-chip">{enabled ? t('settings.discord.on') : t('settings.discord.off')}</div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          opacity: enabled ? 1 : 0.4,
          pointerEvents: enabled ? undefined : 'none',
        }}
      >
        <div className="s-cat-label">{t('settings.discord.cat.display')}</div>

        {/* Прогресс */}
        <div className="sc">
          <div className="sr">
            <div>
              <div className="sl2">{t('settings.discord.progress')}</div>
              <div className="ssub">{t('settings.discord.progress.sub')}</div>
            </div>
            <label className="tele-sw">
              <input
                type="checkbox"
                checked={showProgress}
                onChange={() => void setDiscordSettings({ discord_show_progress: !showProgress })}
              />
              <span className="tele-sw-track" />
            </label>
          </div>
        </div>

        {/* Обложка */}
        <div className="sc">
          <div className="sc-title">{t('settings.discord.cover')}</div>
          <div className="sc-desc">{t('settings.discord.cover.desc')}</div>
          <div className="s-opt-row" style={{ marginTop: 12 }}>
            <OptBtn active={coverMode === 'auto'} onClick={() => pickCover('auto')}>
              <NoteIcon /> {t('settings.discord.mode.auto')}
            </OptBtn>
            <OptBtn active={coverMode === 'custom'} onClick={() => pickCover('custom')}>
              <LinkIcon /> {t('settings.discord.mode.custom')}
            </OptBtn>
          </div>
          {coverMode === 'custom' && (
            <div style={{ marginTop: 10 }}>
              <div className="sc-desc" style={{ marginBottom: 8 }}>{t('settings.discord.coverUrl')}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="sc-inp"
                  type="text"
                  placeholder="https://example.com/cover.jpg"
                  style={{ flex: 1, fontSize: 12 }}
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyCoverUrl()}
                />
                <button className="sc-btn" onClick={applyCoverUrl} style={{ flexShrink: 0, padding: '0 12px' }}>{t('settings.discord.apply')}</button>
              </div>
            </div>
          )}
        </div>

        {/* Иконка приложения */}
        <div className="sc">
          <div className="sc-title">{t('settings.discord.appIcon')}</div>
          <div className="sc-desc">{t('settings.discord.appIcon.desc')}</div>
          <div className="s-opt-row" style={{ marginTop: 12 }}>
            <OptBtn active={smallMode === 'off'} onClick={() => pickSmall('off')}>
              <CloseIcon /> {t('settings.discord.mode.off')}
            </OptBtn>
            <OptBtn active={smallMode === 'default'} onClick={() => pickSmall('default')}>
              <img src="/logo.png" width={16} height={16} style={{ borderRadius: 3, objectFit: 'cover' }} alt="" /> {t('settings.discord.mode.default')}
            </OptBtn>
            <OptBtn active={smallMode === 'custom'} onClick={() => pickSmall('custom')}>
              <LinkIcon /> {t('settings.discord.mode.custom')}
            </OptBtn>
            <OptBtn active={smallMode === 'platform'} onClick={() => pickSmall('platform')}>
              <PlatformIcon /> {t('settings.discord.mode.platform')}
            </OptBtn>
          </div>
          {smallMode === 'custom' && (
            <div style={{ marginTop: 10 }}>
              <div className="sc-desc" style={{ marginBottom: 8 }}>{t('settings.discord.iconUrl')}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="sc-inp"
                  type="text"
                  placeholder="https://example.com/icon.png"
                  style={{ flex: 1, fontSize: 12 }}
                  value={smallUrl}
                  onChange={(e) => setSmallUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applySmallUrl()}
                />
                <button className="sc-btn" onClick={applySmallUrl} style={{ flexShrink: 0, padding: '0 12px' }}>{t('settings.discord.apply')}</button>
              </div>
            </div>
          )}
        </div>

        <div className="s-cat-label">{t('settings.discord.cat.buttons')}</div>

        <BtnCard
          title={t('settings.discord.btn1')}
          desc={t('settings.discord.btn1.desc')}
          mode={b1}
          onMode={(m) => void setDiscordSettings({ discord_btn1_mode: m === 'off' ? '' : m })}
          label={l1}
          url={u1}
          onLabel={setL1}
          onUrl={setU1}
          onApply={() => void setDiscordSettings({ discord_btn1_label: l1.trim(), discord_btn1_url: u1.trim() })}
        />
        <BtnCard
          title={t('settings.discord.btn2')}
          desc={t('settings.discord.btn2.desc')}
          mode={b2}
          onMode={(m) => void setDiscordSettings({ discord_btn2_mode: m === 'off' ? '' : m })}
          label={l2}
          url={u2}
          onLabel={setL2}
          onUrl={setU2}
          onApply={() => void setDiscordSettings({ discord_btn2_label: l2.trim(), discord_btn2_url: u2.trim() })}
        />

        <div className="s-cat-label">{t('settings.discord.cat.preview')}</div>

        <div className="drpc-preview-wrap" style={{ marginTop: 0 }}>
          <div className="drpc-preview-header">
            Listening to Bloom
            <span className="drpc-preview-dots">•••</span>
          </div>
          <div className="drpc-preview-card">
            <div className="drpc-preview-cover-wrap">
              {showCoverImg ? (
                <img
                  className="drpc-preview-cover"
                  src={previewCover}
                  alt=""
                  style={{ display: 'block' }}
                  onError={() => setBrokenCover(previewCover)}
                />
              ) : (
                <div className="drpc-preview-cover-ph">
                  <Ico name="note" width={24} height={24} style={{ color: 'rgba(255,255,255,.3)' }} />
                </div>
              )}
              {smallMode !== 'off' && (
                <div className="drpc-preview-small-img">
                  {previewSmallSrc ? (
                    <img src={previewSmallSrc} alt="" style={{ width: '100%', height: '100%' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <Ico name="note" width={11} height={11} style={{ color: '#fff' }} />
                  )}
                </div>
              )}
            </div>
            <div className="drpc-preview-info">
              <div className="drpc-preview-title">{titleText}</div>
              <div className="drpc-preview-artist">{artist}</div>
              {showProgress && (
                <div className="drpc-preview-progress-row">
                  <span className="drpc-preview-time">{fmtTime(position)}</span>
                  <div className="drpc-preview-bar-track"><div className="drpc-preview-bar-fill" style={{ width: `${pct}%` }} /></div>
                  <span className="drpc-preview-time">{fmtTime(duration)}</span>
                </div>
              )}
              <div className="drpc-preview-btns">
                {b1 !== 'off' && <div className="drpc-preview-btn-el">{btnLabel(b1, l1)}</div>}
                {b2 !== 'off' && <div className="drpc-preview-btn-el">{btnLabel(b2, l2)}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Карточка кнопки (режим + кастомные поля) ──────────────────────────────
const BtnCard = ({
  title,
  desc,
  mode,
  onMode,
  label,
  url,
  onLabel,
  onUrl,
  onApply,
}: {
  title: string
  desc: string
  mode: BtnMode
  onMode: (m: BtnMode) => void
  label: string
  url: string
  onLabel: (v: string) => void
  onUrl: (v: string) => void
  onApply: () => void
}) => {
  const t = useT()
  return (
  <div className="sc">
    <div className="sc-title">{title}</div>
    <div className="sc-desc">{desc}</div>
    <div className="s-opt-row" style={{ marginTop: 12 }}>
      <OptBtn active={mode === 'off'} onClick={() => onMode('off')}>
        <CloseIcon /> {t('settings.discord.mode.off')}
      </OptBtn>
      <OptBtn active={mode === 'track'} onClick={() => onMode('track')}>
        <NoteIcon /> {t('settings.discord.btnMode.track')}
      </OptBtn>
      <OptBtn active={mode === 'artist'} onClick={() => onMode('artist')}>
        <UserIcon /> {t('settings.discord.btnMode.artist')}
      </OptBtn>
      <OptBtn active={mode === 'custom'} onClick={() => onMode('custom')}>
        <EditIcon /> {t('settings.discord.btnMode.custom')}
      </OptBtn>
    </div>
    {mode === 'custom' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        <div>
          <div className="sc-desc" style={{ marginBottom: 6 }}>{t('settings.discord.btnText')}</div>
          <input className="sc-inp" type="text" placeholder={t('settings.discord.btnText.placeholder')} style={{ width: '100%', fontSize: 12 }} value={label} onChange={(e) => onLabel(e.target.value)} />
        </div>
        <div>
          <div className="sc-desc" style={{ marginBottom: 6 }}>{t('settings.discord.link')}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="sc-inp" type="text" placeholder="https://..." style={{ flex: 1, fontSize: 12 }} value={url} onChange={(e) => onUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onApply()} />
            <button className="sc-btn" onClick={onApply} style={{ flexShrink: 0, padding: '0 14px' }}>{t('settings.discord.apply')}</button>
          </div>
        </div>
      </div>
    )}
  </div>
  )
}

const OptBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button className={`s-opt-btn ${active ? 'bta' : 'btg'}`} onClick={onClick}>
    {children}
  </button>
)

// ── Иконки ────────────────────────────────────────────────────────────────
const DiscordIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={Math.round(size * 0.758)} viewBox="0 0 126.644 96" fill="currentColor" role="img" aria-label="Discord">
    <path d="M81.15,0c-1.2376,2.1973-2.3489,4.4704-3.3591,6.794-9.5975-1.4396-19.3718-1.4396-28.9945,0-.985-2.3236-2.1216-4.5967-3.3591-6.794-9.0166,1.5407-17.8059,4.2431-26.1405,8.0568C2.779,32.5304-1.6914,56.3725.5312,79.8863c9.6732,7.1476,20.5083,12.603,32.0505,16.0884,2.6014-3.4854,4.8998-7.1981,6.8698-11.0623-3.738-1.3891-7.3497-3.1318-10.8098-5.1523.9092-.6567,1.7932-1.3386,2.6519-1.9953,20.281,9.547,43.7696,9.547,64.0758,0,.8587.7072,1.7427,1.3891,2.6519,1.9953-3.4601,2.0457-7.0718,3.7632-10.835,5.1776,1.97,3.8642,4.2683,7.5769,6.8698,11.0623,11.5419-3.4854,22.3769-8.9156,32.0509-16.0631,2.626-27.2771-4.496-50.9172-18.817-71.8548C98.9811,4.2684,90.1918,1.5659,81.1752.0505l-.0252-.0505ZM42.2802,65.4144c-6.2383,0-11.4159-5.6575-11.4159-12.6535s4.9755-12.6788,11.3907-12.6788,11.5169,5.708,11.4159,12.6788c-.101,6.9708-5.026,12.6535-11.3907,12.6535ZM84.3576,65.4144c-6.2637,0-11.3907-5.6575-11.3907-12.6535s4.9755-12.6788,11.3907-12.6788,11.4917,5.708,11.3906,12.6788c-.101,6.9708-5.026,12.6535-11.3906,12.6535Z" />
  </svg>
)
const NoteIcon = () => <Ico name="note" width={16} height={16} />
const LinkIcon = () => <Ico name="link" width={16} height={16} />
const PlatformIcon = () => <Ico name="globe" width={16} height={16} />
const CloseIcon = () => <Ico name="close" width={16} height={16} />
const UserIcon = () => <Ico name="user" width={16} height={16} />
const EditIcon = () => <Ico name="edit" width={16} height={16} />
