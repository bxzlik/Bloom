import { useState } from 'react'
import { toast } from '@shared/ui'
import { IntegrationCard, SecretInput, HelpTitle, HelpSteps } from '@shared/ui'
import { useT } from '@shared/i18n'
import { useGeniusStore } from '../model/geniusStore'

const GeniusIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
  </svg>
)

/**
 * Карточка настроек Genius: ввод Client Access Token (блок «Интеграции →
 * Genius»). Токен хранится в `localStorage['bloom_genius_token']`
 * (useGeniusStore) и подставляется в каждый `lyrics_request` как fallback-
 * провайдер текстов (если LRCLIB не нашёл).
 *
 * Минималистичный вид: иконка + статус в шапке, инструкция под «?», поле с
 * галочкой-сохранить.
 */
export const GeniusTokenCard = () => {
  const t = useT()
  const saved = useGeniusStore((s) => s.token)
  const setToken = useGeniusStore((s) => s.setToken)
  const [value, setValue] = useState(saved)

  const save = () => {
    const v = value.trim()
    setToken(v)
    toast(v ? t('settings.genius.toast.saved') : t('settings.genius.toast.reset'))
  }

  const help = (
    <>
      <HelpTitle>{t('settings.genius.help.title')}</HelpTitle>
      <HelpSteps>
        <li>{t('settings.genius.step1.a')} <b style={{ color: 'var(--text)' }}>genius.com/api-clients</b></li>
        <li>{t('settings.genius.step2.a')} <b style={{ color: 'var(--text)' }}>New API Client</b></li>
        <li>{t('settings.genius.step3.a')} <b style={{ color: 'var(--text)' }}>Save</b></li>
        <li>{t('settings.genius.step4.a')} <b style={{ color: 'var(--text)' }}>Generate Access Token</b></li>
        <li>{t('settings.genius.step5')}</li>
      </HelpSteps>
    </>
  )

  return (
    <div className="s-section active" id="ssec-genius">
      <IntegrationCard
        icon={<GeniusIcon />}
        tint="#ffec3d"
        title="Genius"
        status={saved
          ? <span style={{ color: '#1db954' }}>{t('settings.genius.saved')}</span>
          : t('settings.genius.subtitle')}
        help={help}
      >
        <SecretInput value={value} onChange={setValue} onSave={save} placeholder={t('settings.genius.placeholder')} />
      </IntegrationCard>
    </div>
  )
}
