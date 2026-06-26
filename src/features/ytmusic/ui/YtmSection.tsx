import { YtmLogo } from '@entities/track'
import { IntegrationCard, HelpTitle } from '@shared/ui'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Секция настроек «YouTube Music» `#ssec-ytmusic`. Настраивать нечего —
 * публичный поиск работает без авторизации, воспроизведение/скачивание идут
 * бриджем на SoundCloud. Карточка лишь сообщает, что всё готово.
 */
export const YtmSection = () => {
  const t = useT()

  const help = (
    <>
      <HelpTitle>YouTube Music</HelpTitle>
      <div style={{ lineHeight: 1.7 }}>{t('settings.ytm.help')}</div>
    </>
  )

  return (
    <div className="s-section active" id="ssec-ytmusic">
      <IntegrationCard
        icon={<YtmLogo size={18} />}
        tint="#ff0033"
        title="YouTube Music"
        status={<span style={{ color: '#1ED760' }}>{t('settings.ytm.status')}</span>}
        help={help}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'flex', color: '#1ED760', flexShrink: 0 }}>
            <Ico name="check" width={26} height={26} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t('settings.ytm.status')}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{t('settings.ytm.noAuth')}</div>
          </div>
        </div>
      </IntegrationCard>
    </div>
  )
}
