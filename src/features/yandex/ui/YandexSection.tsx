import { useEffect } from 'react'
import { YmLogo } from '@entities/track'
import { useYmAuthStore, type StatusKind } from '../model/authStore'
import { useT } from '@shared/i18n'

const STATUS_COLOR: Record<StatusKind, string> = {
  ok: '#4caf50',
  err: 'var(--err,#ef5350)',
  info: 'var(--text2)',
}

/** Акцентная плашка с лого Яндекс.Музыки (звезда из ассета, красится акцентом). */
const YmMark = () => (
  <div
    style={{
      width: 32, height: 32, borderRadius: 8, background: 'rgba(var(--accent-rgb),.18)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      color: 'var(--accent)',
    }}
  >
    <YmLogo size={19} />
  </div>
)

/**
 * Секция настроек «Яндекс.Музыка» `#ssec-yandex` (yandex-ui.js
 * _ymRenderLogin/_ymRenderConnected + ymAuthStart). OAuth device-flow: «Подключить»
 * → открывается страница Яндекс ID, показывается код, идёт поллинг токена.
 * Всё состояние/логика — useYmAuthStore; сеть в Rust (ym_* команды).
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

  return (
    <div className="s-section active" id="ssec-yandex">
      <div className="s-section-head">
        <div className="s-section-title">
          <YmLogo size={15} />{' '}
          {t('settings.nav.yandex')}
        </div>
      </div>

      <div
        className="sc-url-wrap"
        style={{ gap: 14, background: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', margin: '0 2px', padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <YmMark />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{t('settings.nav.yandex')}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {checking ? t('settings.ym.checking') : authed ? t('settings.ym.connected') : t('settings.ym.notConnected')}
            </div>
          </div>
          {authed && (
            <button
              onClick={() => void logout()}
              style={{ marginLeft: 'auto', background: 'var(--hover)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
            >
              {t('settings.ym.logout')}
            </button>
          )}
        </div>

        {/* Подключено — статус Плюса. */}
        {authed && (
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{plusBadge}</div>
        )}

        {/* Не подключено — кнопка входа + device-flow. */}
        {!authed && !checking && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              {t('settings.ym.loginHint')}
            </div>
            <button
              onClick={() => void startAuth()}
              disabled={connecting}
              style={{
                padding: '9px 16px', background: 'var(--accent)', color: 'var(--accent-text,#fff)',
                border: 'none', borderRadius: 'calc(var(--radius)*0.6)', fontWeight: 700, fontSize: 13,
                cursor: connecting ? 'default' : 'pointer', opacity: connecting ? 0.6 : 1, alignSelf: 'flex-start',
              }}
            >
              {t('settings.ym.connect')}
            </button>

            {userCode && (
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
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
          <div style={{ fontSize: 11.5, color: STATUS_COLOR[status.kind] }}>{status.text}</div>
        )}
      </div>
    </div>
  )
}
