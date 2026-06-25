import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../model'
import { usePlayerStore, useQueueStore, trackProviderId } from '@features/player'
import { useLibStore } from '@features/library'
import { trackRegistry } from '@entities/track'
import { useT } from '@shared/i18n'

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
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth={1.5} strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                </div>
              )}
              {smallMode !== 'off' && (
                <div className="drpc-preview-small-img">
                  {previewSmallSrc ? (
                    <img src={previewSmallSrc} alt="" style={{ width: '100%', height: '100%' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
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
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
    <path d="M7.5 7.5c3.5-1 5.5-1 9 0" /><path d="M7 16.5c3.5 1 6.5 1 10 0" />
    <path d="M15.5 17c0 1 1.5 3 2 3 1.5 0 2.833-1.667 3.5-3 .667-1.333.5-5.833-1.5-11.5-1.457-1.015-3-1.5-4.5-1.5l-1 2.5" />
    <path d="M8.5 17c0 1-1.4 3-1.9 3-1.5 0-2.833-1.667-3.5-3-.667-1.333-.5-5.833 1.5-11.5 1.457-1.015 3-1.5 4.5-1.5l1 2.5" />
  </svg>
)
const NoteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
)
const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
)
const PlatformIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
)
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
)
const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
)
const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
)
