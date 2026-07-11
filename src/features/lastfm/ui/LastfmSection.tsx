import { useState } from 'react'
import { IntegrationCard, HelpTitle } from '@shared/ui'
import { useLastfmStore } from '../model/lastfmStore'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

const LastfmIcon = () => (
  <svg width="20" height="20" viewBox="0 0 512 512" fill="currentColor" role="img" aria-label="Last.fm" xmlns="http://www.w3.org/2000/svg">
    <path d="M308.214,337.861l-5.663-13.064L253.93,209.107c-16.056-40.931-56.085-68.601-101.198-68.601c-61.043,0-110.576,51.706-110.576,115.524c0,63.756,49.533,115.493,110.576,115.493c42.618,0,79.604-25.164,98.062-62.007l19.668,47.329c-27.876,35.526-70.298,58.155-117.729,58.155C68.645,415.002,0.5,343.886,0.5,256.031c0-87.834,68.145-159.033,152.231-159.033c63.446,0,114.696,35.361,140.741,98.093c1.946,4.865,27.516,67.255,49.834,120.369c13.788,32.856,25.537,54.678,63.776,56.023c37.441,1.325,63.249-22.484,63.249-52.648c0-29.45-19.7-36.542-52.825-48.042c-59.543-20.486-90.308-41.065-90.308-90.401c0-48.115,31.303-80.205,82.295-80.205c33.137,0,57.162,15.424,73.756,46.169l-32.618,17.37c-12.235-17.909-25.765-25-42.97-25c-23.934,0-40.94,17.381-40.94,40.465c0,32.805,28.095,37.742,67.348,51.179c52.866,17.981,77.431,38.529,77.431,89.801c0,53.86-44.232,93.093-102.006,93.01C356.256,412.942,327.861,385.769,308.214,337.861z" />
  </svg>
)

const EyeBtn = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    aria-label="toggle visibility"
    style={{
      position: 'absolute',
      right: 6,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--text2)',
      display: 'flex',
      alignItems: 'center',
      padding: 2,
    }}
  >
    <Ico name="eye" width={14} height={14} />
  </button>
)

/**
 * Секция настроек Last.fm `#ssec-lastfm`.
 * Вход через браузер (OAuth getToken→getSession), тумблеры скробблинга/now-playing,
 * ввод API Key/Secret. Состояние/логика — useLastfmStore.
 *
 * Минималистичный вид: иконка + статус в шапке, кнопка «Выйти» как действие,
 * инструкция и API-ключи под «?», основной вход — кнопка входа.
 */
export const LastfmSection = () => {
  const t = useT()
  const sk = useLastfmStore((s) => s.sk)
  const user = useLastfmStore((s) => s.user)
  const scrobbleEnabled = useLastfmStore((s) => s.scrobbleEnabled)
  const nowPlayingEnabled = useLastfmStore((s) => s.nowPlayingEnabled)
  const oauthStatus = useLastfmStore((s) => s.oauthStatus)
  const oauthPending = useLastfmStore((s) => s.oauthPending)
  const savedKey = useLastfmStore((s) => s.apiKey)
  const savedSecret = useLastfmStore((s) => s.apiSecret)

  const startOAuth = useLastfmStore((s) => s.startOAuth)
  const finishOAuth = useLastfmStore((s) => s.finishOAuth)
  const logout = useLastfmStore((s) => s.logout)
  const toggleScrobble = useLastfmStore((s) => s.toggleScrobble)
  const toggleNowPlaying = useLastfmStore((s) => s.toggleNowPlaying)
  const saveKeys = useLastfmStore((s) => s.saveKeys)

  const [apiKey, setApiKey] = useState(savedKey)
  const [apiSecret, setApiSecret] = useState(savedSecret)
  const [keyVis, setKeyVis] = useState(false)
  const [secretVis, setSecretVis] = useState(false)

  const inpStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12, flex: 1, paddingRight: 36 }

  const help = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <HelpTitle>Last.fm</HelpTitle>
        <div style={{ lineHeight: 1.7 }}>{t('settings.lastfm.oauthHint')}</div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ lineHeight: 1.7 }}>
          {t('settings.lastfm.apiHint.a')} <b style={{ color: 'var(--text)' }}>last.fm/api/account/create</b>{t('settings.lastfm.apiHint.b')}
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ position: 'relative', display: 'flex' }}>
            <input
              className="sc-inp"
              type={keyVis ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Key"
              autoComplete="off"
              spellCheck={false}
              style={inpStyle}
            />
            <EyeBtn onClick={() => setKeyVis((v) => !v)} />
          </div>
          <div style={{ position: 'relative', display: 'flex' }}>
            <input
              className="sc-inp"
              type={secretVis ? 'text' : 'password'}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="API Secret"
              autoComplete="off"
              spellCheck={false}
              style={inpStyle}
            />
            <EyeBtn onClick={() => setSecretVis((v) => !v)} />
          </div>
          <button className="sc-btn" onClick={() => saveKeys(apiKey, apiSecret)} style={{ alignSelf: 'flex-start' }}>
            {t('settings.lastfm.saveKeys')}
          </button>
        </div>
      </div>
    </div>
  )

  const logoutBtn = sk ? (
    <button
      onClick={logout}
      style={{ background: 'rgba(213,16,7,0.12)', border: '1px solid rgba(213,16,7,0.25)', color: '#d51007', borderRadius: 8, padding: '5px 11px', fontSize: 11, fontFamily: 'var(--font)', cursor: 'pointer', flexShrink: 0 }}
    >
      {t('settings.lastfm.logout')}
    </button>
  ) : undefined

  return (
    <div className="s-section active" id="ssec-lastfm">
      <IntegrationCard
        icon={<LastfmIcon />}
        tint="#d51007"
        title="Last.fm"
        status={sk && user ? <span style={{ color: '#1db954' }}>{t('settings.lastfm.connectedAs', { user })}</span> : t('settings.lastfm.notConnected')}
        actions={logoutBtn}
        help={help}
      >
        {!sk && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="sc-btn"
                onClick={() => void startOAuth()}
                style={{ background: '#d51007', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Ico name="export" width={13} height={13} />
                {t('settings.lastfm.login')}
              </button>
              {oauthPending && (
                <button
                  className="sc-btn"
                  onClick={() => void finishOAuth()}
                  style={{ background: 'rgba(213,16,7,0.15)', border: '1px solid rgba(213,16,7,0.4)', color: '#d51007' }}
                >
                  {t('settings.lastfm.done')}
                </button>
              )}
            </div>
            {oauthStatus && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{oauthStatus}</div>}
          </div>
        )}

        <div className="sr">
          <div>
            <div className="sl2">{t('settings.lastfm.scrobble')}</div>
            <div className="ssub">{t('settings.lastfm.scrobble.sub')}</div>
          </div>
          <label className="tele-sw">
            <input type="checkbox" checked={scrobbleEnabled} onChange={toggleScrobble} />
            <span className="tele-sw-track" />
          </label>
        </div>
        <div className="sr">
          <div>
            <div className="sl2">Now Playing</div>
            <div className="ssub">{t('settings.lastfm.nowPlaying.sub')}</div>
          </div>
          <label className="tele-sw">
            <input type="checkbox" checked={nowPlayingEnabled} onChange={toggleNowPlaying} />
            <span className="tele-sw-track" />
          </label>
        </div>
      </IntegrationCard>
    </div>
  )
}
