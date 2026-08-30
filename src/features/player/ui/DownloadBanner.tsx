import { useEffect } from 'react'
import { useDownloadBannerStore } from '@shared/ui'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Тост прогресса скачивания плейлиста — капсула сверху по центру в стиле
 * глобального тоста (`#toast`, см. search-misc.css): бейдж-вертушка, две строки
 * текста, счётчик и полоса ДОЛИ по низу. Показывает «N из M», имя текущего
 * трека и итог; заменяет череду тостов.
 *
 * Управляется императивно через `downloadBanner.*` (как `toast()`), чтобы звать
 * из не-React кода загрузчика. Рендерится один раз в App. По завершении
 * автоскрывается через таймер (если пользователь не закрыл).
 */
const DoneGlyph = () => <Ico name="check" width={17} height={17} />

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
      <span className="dlt-badge">
        {/* Пока идёт работа — вертушка вместо значка (как busyToast на телефоне),
            по завершении на её месте появляется вид итога. */}
        <span className="dlt-ico">{done ? <DoneGlyph /> : <span className="dlt-spin" />}</span>
      </span>
      <div className="dlt-body">
        <div className="dlt-title">
          {done ? t('dlbanner.titleDone') : t('dlbanner.titleDownloading')}
          {name ? ` · ${name}` : ''}
        </div>
        <div className="dlt-sub">{subtitle}</div>
      </div>
      <span className="dlt-count">{done ? `${percent}%` : `${current}/${total}`}</span>
      <button onClick={hide} className="dlt-close" aria-label={t('common.close')}>
        <Ico name="close" width={13} height={13} />
      </button>

      <div className="dlt-track">
        <div className="dlt-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
