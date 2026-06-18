import { useState } from 'react'
import { getManualClientId, setManualClientId, checkConnection } from '../api/scClient'
import { useT } from '@shared/i18n'

type StatusKind = 'ok' | 'err' | 'info'
const STATUS_COLOR: Record<StatusKind, string> = {
  ok: '#4caf50',
  err: '#ef5350',
  info: 'var(--text2)',
}

/**
 * Карточка настроек SoundCloud: ручной ввод `client_id`. блока
 * «API ключи → SoundCloud». Сохраняется в `localStorage[bloom_sc_client_id]`
 * через `setManualClientId`. Нужен, если авто-получение (скрейп/известные id) не сработало.
 */
export const ScClientIdCard = () => {
  const t = useT()
  const [value, setValue] = useState(() => getManualClientId() ?? '')
  const [visible, setVisible] = useState(false)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<{ text: string; kind: StatusKind } | null>(
    getManualClientId() ? { text: t('settings.sc.status.saved'), kind: 'ok' } : null,
  )

  const save = () => {
    const v = value.trim()
    setManualClientId(v || null)
    setStatus({ text: v ? t('settings.sc.status.saved') : t('settings.sc.status.reset'), kind: 'info' })
  }

  const check = async () => {
    setChecking(true)
    setStatus({ text: t('settings.sc.status.checking'), kind: 'info' })
    const r = await checkConnection()
    setChecking(false)
    if (r.ok) {
      // Авто-получили рабочий ключ и поле пустое — подставим, чтобы можно было сохранить.
      if (!value.trim() && r.clientId) setValue(r.clientId)
      setStatus({ text: t('settings.sc.status.ok') + (r.clientId ? ' ' + t('settings.sc.status.okIdSuffix') : ''), kind: 'ok' })
    } else {
      setStatus({ text: t('settings.sc.status.failPrefix') + (r.error || t('settings.sc.status.errFallback')), kind: 'err' })
    }
  }

  return (
    <div className="sc">
      <h3>SoundCloud</h3>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
        {t('settings.sc.intro.a')} <b>client_id</b> {t('settings.sc.intro.b')}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
            placeholder={t('settings.sc.placeholder')}
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 12,
              padding: '8px 36px 8px 12px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'calc(var(--radius) * 0.6)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <button
            onClick={() => setVisible((v) => !v)}
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
              padding: 2,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
        <button
          onClick={save}
          style={{
            padding: '0 16px',
            background: 'var(--accent)',
            color: 'var(--accent-text)',
            border: 'none',
            borderRadius: 'calc(var(--radius) * 0.6)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {t('common.save')}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button
          onClick={() => void check()}
          disabled={checking}
          style={{
            padding: '6px 12px',
            background: 'var(--hover)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 'calc(var(--radius) * 0.6)',
            fontWeight: 600,
            fontSize: 12,
            cursor: checking ? 'default' : 'pointer',
            opacity: checking ? 0.6 : 1,
          }}
        >
          {checking ? t('settings.sc.status.checking') : t('settings.sc.check')}
        </button>
        {status && (
          <div style={{ fontSize: 11, color: STATUS_COLOR[status.kind] }}>{status.text}</div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 8 }}>
          {t('settings.sc.help.title')}
        </div>
        <ol style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
          <li>{t('settings.sc.step1.a')} <b style={{ color: 'var(--text2)' }}>soundcloud.com</b> {t('settings.sc.step1.b')}</li>
          <li>{t('settings.sc.step2.a')} <b style={{ color: 'var(--text2)' }}>F12</b> {t('settings.sc.step2.b')} <b style={{ color: 'var(--text2)' }}>Network</b> {t('settings.sc.step2.c')}</li>
          <li>{t('settings.sc.step3')}</li>
          <li>{t('settings.sc.step4.a')} <b style={{ color: 'var(--text2)' }}>api-v2.soundcloud.com</b></li>
          <li>{t('settings.sc.step5.a')} <b style={{ color: 'var(--text2)' }}>client_id</b> {t('settings.sc.step5.b')}</li>
        </ol>
      </div>
    </div>
  )
}
