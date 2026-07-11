import { useState } from 'react'
import { toast } from '@shared/ui'
import { IntegrationCard, SecretInput, HelpTitle, HelpSteps } from '@shared/ui'
import { useT } from '@shared/i18n'
import { useGeniusStore } from '../model/geniusStore'

const GeniusIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Genius">
    <path d="M12.897 1.235c-.36.001-.722.013-1.08.017-.218-.028-.371.225-.352.416-.035 1.012.023 2.025-.016 3.036-.037.841-.555 1.596-1.224 2.08-.5.345-1.118.435-1.671.663.121.78.434 1.556 1.057 2.07 1.189 1.053 3.224.86 4.17-.426.945-1.071.453-2.573.603-3.854.286-.48.937-.132 1.317-.49-.34-1.249-.81-2.529-1.725-3.472a11.125 11.125 0 00-1.08-.04zm-10.42.006C.53 2.992-.386 5.797.154 8.361c.384 2.052 1.682 3.893 3.45 4.997.134-.23.23-.476.09-.73-.95-2.814-.138-6.119 1.986-8.19.014-.986.043-1.976-.003-2.961l-.188-.214c-1.003-.051-2.008 0-3.01-.022zm17.88.055l-.205.356c.265.938.6 1.862.72 2.834.58 3.546-.402 7.313-2.614 10.14-1.816 2.353-4.441 4.074-7.334 4.773-2.66.66-5.514.45-8.064-.543-.068.079-.207.237-.275.318 2.664 2.629 6.543 3.969 10.259 3.498 3.075-.327 5.995-1.865 8.023-4.195 1.935-2.187 3.083-5.07 3.125-7.992.122-3.384-1.207-6.819-3.636-9.19z" />
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
