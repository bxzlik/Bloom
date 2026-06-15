import { useEffect, useRef, useState } from 'react'
import { invoke, onAppEvent } from '@shared/tauri'
import type { UpdateInfo, UnlistenFn } from '@shared/tauri'

/**
 * «О приложении» + проверка обновлений (в самом низу секции «Система»).
 *
 * Заголовок — стандартный `s-cat-label` (как в других настройках: подпись с
 * линиями сверху/снизу). Клик по логотипу запускает проверку.
 *
 * Обновления — лёгкий вариант: Rust сверяется с GitHub Releases
 * (updater.check_update), качает NSIS-установщик (download_update, прогресс
 * через `bloom-update-progress`) и запускает его (install_update).
 *
 * Поведение проверки:
 *   - Авто-проверка при монтировании: если апдейт есть — показываем строку
 *     статуса; если нет (или ошибка сети) — молчим (phase='idle').
 *   - Клик по логотипу — ручная проверка: показываем результат всегда.
 */

type Phase = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'error'

export const AboutBlock = () => {
  const [version, setVersion] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState('')
  const unlisten = useRef<UnlistenFn | null>(null)

  // manual=true → показываем итог даже без апдейта; авто-проверка молчит.
  const check = async (manual: boolean) => {
    if (manual) {
      setPhase('checking')
      setError('')
    }
    try {
      const res = await invoke<UpdateInfo>('check_update')
      setInfo(res)
      if (res.available) setPhase('available')
      else if (manual) setPhase('uptodate')
      else setPhase('idle')
    } catch (e) {
      if (manual) {
        setError(String(e))
        setPhase('error')
      }
    }
  }

  const downloadInstall = async () => {
    if (!info) return
    if (!info.download_url) {
      setError('В релизе не найден установщик (.exe)')
      setPhase('error')
      return
    }
    setPhase('downloading')
    setPercent(0)
    setError('')
    try {
      const path = await invoke<string>('download_update', {
        url: info.download_url,
        assetName: info.asset_name,
      })
      // Запустит установщик и закроет приложение — дальше код обычно не идёт.
      await invoke('install_update', { path })
    } catch (e) {
      setError(String(e))
      setPhase('error')
    }
  }

  useEffect(() => {
    let alive = true
    void invoke<string>('app_version')
      .then((v) => alive && setVersion(v))
      .catch(() => {})
    void onAppEvent('bloom-update-progress', (p) => {
      if (alive) setPercent(p.percent)
    }).then((un) => {
      if (alive) unlisten.current = un
      else un()
    })
    void check(false)
    return () => {
      alive = false
      unlisten.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
