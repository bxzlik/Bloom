import { useEffect, type CSSProperties } from 'react'
import { useUpdateStore } from '../../model/updateStore'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

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

/** Кнопка-ссылка «Что нового»/«История» — без подложки, иконка слева от подписи. */
const linkBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: 0,
  background: 'none',
  border: 'none',
  fontSize: 12,
  fontWeight: 'var(--fw-bold)',
  cursor: 'pointer',
  fontFamily: 'var(--font)',
}

export const AboutBlock = () => {
  const t = useT()
  const version = useUpdateStore((s) => s.version)
  const phase = useUpdateStore((s) => s.phase)
  const info = useUpdateStore((s) => s.info)
  const percent = useUpdateStore((s) => s.percent)
  const error = useUpdateStore((s) => s.error)
  const check = useUpdateStore((s) => s.check)
  const downloadInstall = useUpdateStore((s) => s.downloadInstall)
  const openWhatsNew = useUpdateStore((s) => s.openWhatsNew)
  const openHistory = useUpdateStore((s) => s.openHistory)

  // На случай, если секция открыта до завершения стартового init() — он идемпотентен.
  useEffect(() => {
    void useUpdateStore.getState().init()
  }, [])

  const statusText =
    phase === 'available'
      ? t('settings.about.available', { v: info?.latest ?? '' })
      : phase === 'uptodate'
        ? t('settings.about.uptodate')
        : phase === 'downloading'
          ? t('settings.about.downloading', { p: percent })
          : phase === 'error'
            ? error || t('settings.about.error')
            : phase === 'checking'
              ? t('settings.about.checking')
              : ''

  return (
    <>
      <div className="s-cat-label">{t('settings.about.title')}</div>

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
                  border: '3px solid rgba(var(--ovl-rgb),.18)',
                  borderTopColor: 'var(--text)',
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
            <div style={{ fontSize: 15, fontWeight: 'var(--fw-bold)' }}>Bloom</div>
            <div style={{ marginTop: 3, fontSize: 13, fontWeight: 'var(--fw-bold)', color: 'var(--text2)' }}>
              {t('settings.about.version')} <span style={{ color: 'var(--muted)' }}>v</span>{version || '—'}
            </div>
          </div>
          {/* Ссылки на заметки релиза — справа столбиком: «Что нового» сверху, история под ним.
              Выравнивание по левому краю, чтобы иконки стояли одной колонкой. */}
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <button onClick={() => void openWhatsNew()} style={{ ...linkBtn, color: 'var(--accent)' }}>
              <Ico name="docText" size={14} />
              {t('update.notesTitle')}
            </button>
            <button onClick={() => void openHistory()} style={{ ...linkBtn, color: 'var(--text2)' }}>
              <Ico name="clock" size={14} />
              {t('update.history')}
            </button>
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
                {t('settings.about.update')}
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
              background: 'rgba(var(--ovl-rgb),.08)',
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
