import { useState } from 'react'
import { getManualClientId, setManualClientId, checkConnection } from '../api/scClient'
import { IntegrationCard, SecretInput, HelpTitle, HelpSteps } from '@shared/ui'
import { ScLogo } from '@entities/track'
import { useT } from '@shared/i18n'

type StatusKind = 'ok' | 'err' | 'info'
const STATUS_COLOR: Record<StatusKind, string> = {
  ok: '#4caf50',
  err: '#ef5350',
  info: 'var(--muted)',
}

/**
 * Карточка настроек SoundCloud: ручной ввод `client_id` (блок «Интеграции →
 * SoundCloud»). Сохраняется в `localStorage[bloom_sc_client_id]` через
 * `setManualClientId`. Нужен, если авто-получение (скрейп/известные id) не сработало.
 *
 * Минималистичный вид: иконка + статус в шапке, инструкция под «?», поле с
 * галочкой-сохранить и кнопка авто-проверки.
 */
export const ScClientIdCard = () => {
  const t = useT()
  const [value, setValue] = useState(() => getManualClientId() ?? '')
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

  const help = (
    <>
      <HelpTitle>{t('settings.sc.help.title')}</HelpTitle>
      <HelpSteps>
        <li>{t('settings.sc.step1.a')} <b style={{ color: 'var(--text)' }}>soundcloud.com</b> {t('settings.sc.step1.b')}</li>
        <li>{t('settings.sc.step2.a')} <b style={{ color: 'var(--text)' }}>F12</b> {t('settings.sc.step2.b')} <b style={{ color: 'var(--text)' }}>Network</b> {t('settings.sc.step2.c')}</li>
        <li>{t('settings.sc.step3')}</li>
        <li>{t('settings.sc.step4.a')} <b style={{ color: 'var(--text)' }}>api-v2.soundcloud.com</b></li>
        <li>{t('settings.sc.step5.a')} <b style={{ color: 'var(--text)' }}>client_id</b> {t('settings.sc.step5.b')}</li>
      </HelpSteps>
    </>
  )

  return (
    <div className="s-section active" id="ssec-soundcloud">
      <IntegrationCard
        icon={<ScLogo size={19} />}
        tint="#ff5500"
        title="SoundCloud"
        status={status ? <span style={{ color: STATUS_COLOR[status.kind] }}>{status.text}</span> : t('settings.sc.intro.a') + ' client_id'}
        help={help}
      >
        <SecretInput value={value} onChange={setValue} onSave={save} placeholder={t('settings.sc.placeholder')} />
        <button
          onClick={() => void check()}
          disabled={checking}
          style={{
            marginTop: 10,
            padding: '7px 12px',
            background: 'var(--hover)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 'calc(var(--radius) * 0.6)',
            fontWeight: 600,
            fontSize: 12,
            fontFamily: 'var(--font)',
            cursor: checking ? 'default' : 'pointer',
            opacity: checking ? 0.6 : 1,
          }}
        >
          {checking ? t('settings.sc.status.checking') : t('settings.sc.check')}
        </button>
      </IntegrationCard>
    </div>
  )
}
