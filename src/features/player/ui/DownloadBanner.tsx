import { useEffect } from 'react'
import { useDownloadBannerStore } from '@shared/ui'
import { useT } from '@shared/i18n'

/**
 * Тост прогресса скачивания плейлиста — карточка сверху по центру в стиле
 * глобального тоста (круглая иконка-бейдж, скругление `var(--radius)`, тень).
 * Показывает «N из M», имя текущего трека и итог; заменяет череду тостов.
 *
 * Управляется императивно через `downloadBanner.*` (как `toast()`), чтобы звать
 * из не-React кода загрузчика. Рендерится один раз в App. По завершении
 * автоскрывается через таймер (если пользователь не закрыл).
 */
const DownloadGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

export const DownloadBanner = () => {
  const t = useT()
  const active = useDownloadBannerStore((s) => s.active)
  const name = useDownloadBannerStore((s) => s.name)
  const current = useDownloadBannerStore((s) => s.current)
  const total = useDownloadBannerStore((s) => s.total)
  const ok = useDownloadBannerStore((s) => s.ok)
  const failed = useDownloadBannerStore((s) => s.failed)
  const phase = useDownloadBannerStore((s) => s.phase)
  const trackName = useDownloadBannerStore((s) => s.trackName)
  const seq = useDownloadBannerStore((s) => s.seq)
  const hide = useDownloadBannerStore((s) => s.hide)

  // Автоскрытие через 6с после завершения (если пользователь сам не закрыл).
  useEffect(() => {
    if (phase !== 'done' || !active) return
    const id = window.setTimeout(hide, 6000)
    return () => window.clearTimeout(id)
  }, [phase, active, seq, hide])

  // Пока тост закачки виден — сдвигаем эфемерный #toast ниже (см. body.dl-toast в CSS).
  useEffect(() => {
    document.body.classList.toggle('dl-toast', active)
    return () => document.body.classList.remove('dl-toast')
  }, [active])

  if (!active) return null

  const done = phase === 'done'
  // Бар по числу завершённых; при done — заполнен.
  const completed = done ? total : ok + failed
  const percent = total ? Math.round((completed / total) * 100) : 0

  const subtitle = done
    ? failed > 0
      ? t('dlbanner.resultFailed', { ok: String(ok), total: String(total), failed: String(failed) })
      : t('dlbanner.result', { ok: String(ok), total: String(total) })
    : trackName || t('dlbanner.count', { cur: String(current), total: String(total) })

  return (
    <div id="dltoast" className={done ? 'is-done' : undefined}>
      <div className="dlt-row">
        <span className="dlt-ico">
          <DownloadGlyph />
        </span>
        <div className="dlt-body">
          <div className="dlt-title">
            {done ? t('dlbanner.titleDone') : t('dlbanner.titleDownloading')}
            {name ? ` · ${name}` : ''}
          </div>
          <div className="dlt-sub">{subtitle}</div>
        </div>
        <button onClick={hide} className="dlt-close" aria-label={t('common.close')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="dlt-progress">
        <div className="dlt-track">
          <div className="dlt-fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="dlt-count">{done ? `${percent}%` : `${current}/${total}`}</span>
      </div>
    </div>
  )
}
