import { useState } from 'react'
import { useLastfmStore } from '../model/lastfmStore'
import { useT } from '@shared/i18n'

const EyeBtn = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  </button>
)

/**
 * Секция настроек Last.fm `#ssec-lastfm`.
 * Вход через браузер (OAuth getToken→getSession), тумблеры скробблинга/now-playing,
 * ввод API Key/Secret. Состояние/логика — useLastfmStore.
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

  const inpStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 12,
    flex: 1,
    paddingRight: 36,
  }

  return (
    <div className="s-section active" id="ssec-lastfm">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12l2 2 4-4" />
          </svg>{' '}
          Last.fm
        </div>
      </div>

      <div
        className="sc-url-wrap"
        style={{ gap: 14, background: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', margin: '0 2px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1a0000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="14" viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M62 110 C28 110 8 88 8 68 C8 44 28 24 62 24 C82 24 96 32 106 44 C116 32 132 24 154 24 C176 24 192 36 198 54 L178 60 C174 48 166 42 154 42 C136 42 124 56 124 68 C124 80 136 94 154 94 C166 94 174 88 178 76 L198 82 C192 100 176 112 154 112 C132 112 116 104 106 92 C96 104 82 110 62 110 Z M62 42 C44 42 28 54 28 68 C28 82 44 94 62 94 C80 94 96 82 96 68 C96 54 80 42 62 42 Z"
                fill="#d51007"
              />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Last.fm</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {sk && user ? t('settings.lastfm.connectedAs', { user }) : t('settings.lastfm.notConnected')}
            </div>
          </div>
          {sk && (
            <button
              onClick={logout}
              style={{ marginLeft: 'auto', background: 'rgba(213,16,7,0.12)', border: '1px solid rgba(213,16,7,0.25)', color: '#d51007', borderRadius: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
            >
              {t('settings.lastfm.logout')}
            </button>
          )}
        </div>

        {!sk && (
          <div>
            <div className="sc-url-hint" style={{ marginBottom: 12 }}>
              {t('settings.lastfm.oauthHint')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="sc-btn"
                  onClick={() => void startOAuth()}
                  style={{ background: '#d51007', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
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
              {oauthStatus && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{oauthStatus}</div>
              )}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 8 }}>{t('settings.lastfm.scrobbleSettings')}</div>
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
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
            {t('settings.lastfm.apiHint.a')} <b style={{ color: 'var(--text2)' }}>last.fm/api/account/create</b>{t('settings.lastfm.apiHint.b')}
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
    </div>
  )
}
