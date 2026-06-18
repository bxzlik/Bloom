import { useEffect } from 'react'
import { useDownloadBannerStore, useBannerStackStore } from '@shared/ui'
import { useT } from '@shared/i18n'
// Прямые импорты сторов (не баррелы) — чтобы не плодить цикл player↔settings↔app
// (тот же приём, что в settings/ui/UpdateBanner).
import { useQueueStore } from '../model/queueStore'
import { useNavStore } from '@app/navigationStore'
import { usePlayerViewStore } from '@features/settings/model/playerViewStore'

/**
 * Баннер прогресса скачивания плейлиста — мини-карточка в правом нижнем углу
 * поверх всего, в стиле `UpdateBanner` (иконка + заголовок + прогресс-бар).
 * Заменяет череду тостов: показывает «N из M», имя текущего трека и итог.
 *
 * Управляется императивно через `downloadBanner.*` (как `toast()`), чтобы звать
 * из не-React кода загрузчика. Рендерится один раз в App. По завершении
 * автоскрывается через таймер (если пользователь не закрыл).
 *
 * Позиция повторяет `UpdateBanner`: right:16, bottom:16, а когда внизу реально
 * висит плеер-бар (72px) — поднимается до 88, чтобы не перекрывать его.
 */
const DownloadGlyph = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #5865f2)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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

  // Когда нижний плеер-бар (72px) реально внизу — поднимаем баннер над ним.
  // Бар внизу только при playerBarPos='bottom' + есть трек + не на стр. плеера.
  const curId = useQueueStore((s) => s.curId)
  const page = useNavStore((s) => s.page)
  const playerBarPos = usePlayerViewStore((s) => s.playerBarPos)
  const mpEnabled = usePlayerViewStore((s) => s.mpEnabled)
  const barAtBottom = playerBarPos === 'bottom' && !!curId && page !== 'player' && mpEnabled
  // Если баннер обновления виден — встаём над ним (его высота + зазор 10px).
  const updateBannerHeight = useBannerStackStore((s) => s.updateBannerHeight)
  const bottom = (barAtBottom ? 88 : 16) + (updateBannerHeight > 0 ? updateBannerHeight + 10 : 0)

  // Автоскрытие через 6с после завершения (если пользователь сам не закрыл).
  useEffect(() => {
    if (phase !== 'done' || !active) return
    const id = window.setTimeout(hide, 6000)
    return () => window.clearTimeout(id)
  }, [phase, active, seq, hide])

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
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom,
        zIndex: 9500,
        transition: 'bottom .25s ease',
        width: 296,
        background: 'var(--card-solid, var(--card))',
        border: '1px solid var(--border)',
        borderRadius: 'calc(var(--radius) * 0.7)',
        padding: '13px 15px',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)',
        animation: 'bloom-slide-up .28s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 30,
            height: 30,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'calc(var(--radius) * 0.5)',
            background: 'rgba(var(--accent-rgb),.14)',
          }}
        >
          <DownloadGlyph />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {done ? t('dlbanner.titleDone') : t('dlbanner.titleDownloading')}
            {name ? ` · ${name}` : ''}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text2)',
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </div>
        </div>
        <button
          onClick={hide}
          aria-label="✕"
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            color: 'var(--text2)',
            cursor: 'pointer',
            padding: 2,
            lineHeight: 0,
            opacity: 0.7,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11 }}>
        <div
          style={{
            flex: 1,
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
              transition: 'width .25s ease',
            }}
          />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {done ? `${percent}%` : `${current}/${total}`}
        </span>
      </div>
    </div>
  )
}
