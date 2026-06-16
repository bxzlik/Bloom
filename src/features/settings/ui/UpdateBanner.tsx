// Прямые импорты сторов (не баррелы) — чтобы не создавать цикл settings↔player↔app.
import { useQueueStore } from '@features/player/model/queueStore'
import { useNavStore } from '@app/navigationStore'
import { useUpdateStore } from '../model/updateStore'
import { usePlayerViewStore } from '../model/playerViewStore'

/**
 * Глобальное уведомление о новой версии — небольшая карточка в правом нижнем
 * углу поверх всего. Появляется, когда авто-проверка (`useUpdateBootstrap`)
 * нашла релиз новее текущего и пользователь не скрыл его ранее.
 *
 *   - «Обновить» → скачивание установщика (прогресс-бар) → запуск + выход.
 *   - «Позже» → скрыть баннер для этой версии (запомнить в localStorage).
 *
 * Рендерится один раз в App. Тот же стор питает блок «О приложении» в настройках.
 */
export const UpdateBanner = () => {
  const phase = useUpdateStore((s) => s.phase)
  const info = useUpdateStore((s) => s.info)
  const percent = useUpdateStore((s) => s.percent)
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion)
  const downloadInstall = useUpdateStore((s) => s.downloadInstall)
  const dismiss = useUpdateStore((s) => s.dismiss)

  // Когда нижний плеер-бар (72px) реально внизу — поднимаем баннер над ним,
  // чтобы не перекрывал. Бар внизу только при playerBarPos='bottom' и наличии трека.
  const curId = useQueueStore((s) => s.curId)
  const page = useNavStore((s) => s.page)
  const playerBarPos = usePlayerViewStore((s) => s.playerBarPos)
  const mpEnabled = usePlayerViewStore((s) => s.mpEnabled)
  const barAtBottom = playerBarPos === 'bottom' && !!curId && page !== 'player' && mpEnabled
  const bottom = barAtBottom ? 88 : 16

  const downloading = phase === 'downloading'
  const available = phase === 'available' && !!info && info.latest !== dismissedVersion
  if (!available && !downloading) return null

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
        <img src="/logo.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {downloading ? 'Загрузка обновления' : 'Доступна новая версия'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
            {downloading ? `${percent}%` : `Bloom v${info?.latest}`}
          </div>
        </div>
      </div>

      {downloading ? (
        <div
          style={{
            marginTop: 11,
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
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
          <button
            className="btn"
            style={{ fontSize: 11.5, padding: '5px 12px', background: 'none', border: 'none', color: 'var(--text2)' }}
            onClick={dismiss}
          >
            Позже
          </button>
          <button
            className="btn bta"
            style={{ fontSize: 11.5, padding: '5px 14px' }}
            onClick={() => void downloadInstall()}
          >
            Обновить
          </button>
        </div>
      )}
    </div>
  )
}
