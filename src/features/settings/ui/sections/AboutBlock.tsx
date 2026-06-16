import { useEffect } from 'react'
import { useUpdateStore } from '../../model/updateStore'

/**
 * «О приложении» + проверка обновлений (в самом низу секции «Система»).
 *
 * Заголовок — стандартный `s-cat-label` (как в других настройках: подпись с
 * линиями сверху/снизу). Клик по логотипу запускает ручную проверку.
 *
 * Состояние обновлений живёт в общем `useUpdateStore` — тот же стор питает
 * глобальный баннер-уведомление (App). Авто-проверка делается один раз при
 * старте приложения (`useUpdateBootstrap`); здесь — только ручная по клику.
 */

export const AboutBlock = () => {
  const version = useUpdateStore((s) => s.version)
  const phase = useUpdateStore((s) => s.phase)
  const info = useUpdateStore((s) => s.info)
  const percent = useUpdateStore((s) => s.percent)
  const error = useUpdateStore((s) => s.error)
  const check = useUpdateStore((s) => s.check)
  const downloadInstall = useUpdateStore((s) => s.downloadInstall)

  // На случай, если секция открыта до завершения стартового init() — он идемпотентен.
  useEffect(() => {
    void useUpdateStore.getState().init()
  }, [])

  const statusText =
    phase === 'available'
      ? `Доступна версия ${info?.latest}`
      : phase === 'uptodate'
        ? 'Установлена последняя версия'
        : phase === 'downloading'
          ? `Загрузка обновления… ${percent}%`
          : phase === 'error'
            ? error || 'Не удалось проверить обновления'
            : phase === 'checking'
              ? 'Проверка обновлений…'
              : ''

  return (
    <>
      <div className="s-cat-label">О ПРИЛОЖЕНИИ</div>

      <div className="sc about-hero-card">
        <div className="about-logo-row" style={{ marginBottom: 0 }}>
          <div
            className="about-logo"
            style={{
              background: 'transparent',
              cursor: 'pointer',
              overflow: 'hidden',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => void check(true)}
          >
            {phase === 'checking' ? (
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,.18)',
                  borderTopColor: '#fff',
                  animation: 'bloom-spin .8s linear infinite',
                }}
              />
            ) : (
              <img
                src="/logo.png"
                alt="Bloom"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            )}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Bloom</div>
            <div style={{ marginTop: 3, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
              Версия <span style={{ color: 'var(--muted)' }}>v</span>{version || '—'}
            </div>
          </div>
        </div>

        {statusText && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 14,
            }}
          >
            <div className="ssub" style={{ color: phase === 'available' ? 'var(--text)' : undefined }}>
              {statusText}
            </div>
            {phase === 'available' && (
              <button
                className="btn bta"
                style={{ flexShrink: 0, fontSize: 11, padding: '4px 12px' }}
                onClick={() => void downloadInstall()}
              >
                Обновить
              </button>
            )}
          </div>
        )}

        {phase === 'downloading' && (
          <div
            style={{
              marginTop: 8,
              height: 6,
              borderRadius: 4,
              background: 'rgba(255,255,255,.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${percent}%`,
                background: 'var(--accent, #5865f2)',
                transition: 'width .2s',
              }}
            />
          </div>
        )}
      </div>
    </>
  )
}
