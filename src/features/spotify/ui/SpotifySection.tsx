import { useEffect, useState } from 'react'
import { SpLogo } from '@entities/track'
import { IntegrationCard, SecretInput, HelpTitle, HelpSteps } from '@shared/ui'
import { useT } from '@shared/i18n'
import { useSpAuthStore, type StatusKind } from '../model/authStore'

const STATUS_COLOR: Record<StatusKind, string> = {
  ok: '#1ED760',
  err: '#ef5350',
  info: 'var(--muted)',
}

/**
 * Секция настроек Spotify `#ssec-spotify`. Пользователь вводит client_id +
 * client_secret своего приложения (developer.spotify.com) — Client Credentials
 * flow в Rust. Воспроизведение Spotify-треков идёт бриджем на SoundCloud.
 */
export const SpotifySection = () => {
  const t = useT()
  const enabled = useSpAuthStore((s) => s.enabled)
  const checking = useSpAuthStore((s) => s.checking)
  const status = useSpAuthStore((s) => s.status)
  const refresh = useSpAuthStore((s) => s.refresh)
  const saveAndCheck = useSpAuthStore((s) => s.saveAndCheck)
  const clear = useSpAuthStore((s) => s.clear)

  const [id, setId] = useState('')
  const [secret, setSecret] = useState('')

  // Подтянуть сохранённые creds при открытии секции.
  useEffect(() => {
    void refresh().then(() => {
      const s = useSpAuthStore.getState()
      setId(s.clientId)
      setSecret(s.clientSecret)
    })
  }, [refresh])

  const save = (): void => void saveAndCheck(id, secret)

  const statusText = status ? (
    <span style={{ color: STATUS_COLOR[status.kind] }}>{status.text}</span>
  ) : enabled ? (
    <span style={{ color: '#1ED760' }}>{t('settings.sp.connected')}</span>
  ) : (
    t('settings.sp.notConnected')
  )

  const help = (
    <>
      <HelpTitle>{t('settings.sp.help.title')}</HelpTitle>
      <HelpSteps>
        <li>{t('settings.sp.step1.a')} <b style={{ color: 'var(--text)' }}>developer.spotify.com/dashboard</b></li>
        <li>{t('settings.sp.step2')}</li>
        <li>{t('settings.sp.step3.a')} <b style={{ color: 'var(--text)' }}>Client ID</b> {t('settings.sp.step3.b')} <b style={{ color: 'var(--text)' }}>Client Secret</b></li>
        <li>{t('settings.sp.step4')}</li>
      </HelpSteps>
    </>
  )

  return (
    <div className="s-section active" id="ssec-spotify">
      <IntegrationCard
        icon={<SpLogo size={18} />}
        tint="#1ED760"
        title="Spotify"
        status={statusText}
        help={help}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text2)' }}>Client ID</label>
          <SecretInput value={id} onChange={setId} onSave={save} placeholder="client_id" />
          <label style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>Client Secret</label>
          <SecretInput value={secret} onChange={setSecret} onSave={save} placeholder="client_secret" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={save}
            disabled={checking}
            style={{
              padding: '8px 14px', background: 'var(--accent)', color: 'var(--accent-text,#fff)',
              border: 'none', borderRadius: 'calc(var(--radius)*0.6)', fontWeight: 700, fontSize: 12,
              fontFamily: 'var(--font)', cursor: checking ? 'default' : 'pointer', opacity: checking ? 0.6 : 1,
            }}
          >
            {checking ? t('settings.sp.status.checking') : t('settings.sp.saveCheck')}
          </button>
          {enabled && (
            <button
              onClick={() => void clear()}
              style={{
                padding: '8px 12px', background: 'var(--hover)', color: 'var(--text2)',
                border: '1px solid var(--border)', borderRadius: 'calc(var(--radius)*0.6)',
                fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer',
              }}
            >
              {t('settings.sp.clear')}
            </button>
          )}
        </div>
      </IntegrationCard>
    </div>
  )
}
