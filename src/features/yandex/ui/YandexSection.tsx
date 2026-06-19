import { useEffect } from 'react'
import { YmLogo } from '@entities/track'
import { IntegrationCard, HelpTitle } from '@shared/ui'
import { useYmAuthStore, type StatusKind } from '../model/authStore'
import { useT } from '@shared/i18n'

const STATUS_COLOR: Record<StatusKind, string> = {
  ok: '#4caf50',
  err: 'var(--err,#ef5350)',
  info: 'var(--text2)',
}

/**
 * Секция настроек «Яндекс.Музыка» `#ssec-yandex`. OAuth device-flow:
 * «Подключить» → открывается страница Яндекс ID, показывается код, идёт поллинг
 * токена. Всё состояние/логика — useYmAuthStore; сеть в Rust (ym_* команды).
 *
 * Минималистичный вид: иконка + статус в шапке, кнопка «Выйти» как действие,
 * инструкция под «?», основной вход — кнопка подключения с device-кодом.
 */
export const YandexSection = () => {
  const t = useT()
  const authed = useYmAuthStore((s) => s.authed)
  const hasPlus = useYmAuthStore((s) => s.hasPlus)
  const checking = useYmAuthStore((s) => s.checking)
  const connecting = useYmAuthStore((s) => s.connecting)
  const userCode = useYmAuthStore((s) => s.userCode)
  const verifyUrl = useYmAuthStore((s) => s.verifyUrl)
  const status = useYmAuthStore((s) => s.status)

  const refresh = useYmAuthStore((s) => s.refresh)
  const startAuth = useYmAuthStore((s) => s.startAuth)
  const cancelAuth = useYmAuthStore((s) => s.cancelAuth)
  const logout = useYmAuthStore((s) => s.logout)

  // Перечитать статус при открытии секции; отменить поллинг при уходе.
  useEffect(() => {
    void refresh()
    return () => cancelAuth()
  }, [refresh, cancelAuth])

  const plusBadge =
    hasPlus === true
      ? <><span style={{ color: '#1db954', fontWeight: 700 }}>{t('settings.ym.plus.active.a')}</span> {t('settings.ym.plus.active.b')}</>
      : hasPlus === false
        ? <><span style={{ color: 'var(--text2)' }}>{t('settings.ym.plus.none.a')}</span> {t('settings.ym.plus.none.b')}</>
        : <span style={{ color: 'var(--text2)' }}>{t('settings.ym.plus.unknown')}</span>

  const statusText = checking
    ? t('settings.ym.checking')
    : authed
      ? <span style={{ color: '#1db954' }}>{t('settings.ym.connected')}</span>
      : t('settings.ym.notConnected')

  const help = (
    <>
      <HelpTitle>{t('settings.nav.yandex')}</HelpTitle>
      <div style={{ lineHeight: 1.7 }}>{t('settings.ym.loginHint')}</div>
    </>
  )

  const logoutBtn = authed ? (
    <button
      onClick={() => void logout()}
      style={{ background: 'var(--hover)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, padding: '5px 11px', fontSize: 11, fontFamily: 'var(--font)', cursor: 'pointer', flexShrink: 0 }}
    >
      {t('settings.ym.logout')}
    </button>
  ) : undefined

  return (
    <div className="s-section active" id="ssec-yandex">
      <IntegrationCard
        icon={<YmLogo size={19} />}
        tint="#fed42b"
        title={t('settings.nav.yandex')}
        status={statusText}
        help={help}
      >
        {/* Подключено — статус Плюса слева, кнопка «Выйти» справа. */}
        {authed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{plusBadge}</div>
            {logoutBtn}
          </div>
        )}

        {/* Не подключено — кнопка входа + device-flow. */}
        {!authed && !checking && (
          <>
            <button
              onClick={() => void startAuth()}
              disabled={connecting}
              style={{
                padding: '9px 16px', background: 'var(--accent)', color: 'var(--accent-text,#fff)',
                border: 'none', borderRadius: 'calc(var(--radius)*0.6)', fontWeight: 700, fontSize: 13,
                fontFamily: 'var(--font)',
                cursor: connecting ? 'default' : 'pointer', opacity: connecting ? 0.6 : 1, alignSelf: 'flex-start',
              }}
            >
              {t('settings.ym.connect')}
            </button>

            {userCode && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                {t('settings.ym.codePrompt.a')}{' '}
                <b style={{ color: 'var(--text)' }}>{verifyUrl}</b>{' '}
                {t('settings.ym.codePrompt.b')}
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, margin: '10px 0', color: 'var(--accent)', userSelect: 'all' }}>
                  {userCode}
                </div>
              </div>
            )}
          </>
        )}

        {status && (
          <div style={{ fontSize: 11.5, color: STATUS_COLOR[status.kind], marginTop: 10 }}>{status.text}</div>
        )}
      </IntegrationCard>
    </div>
  )
}
