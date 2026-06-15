import { useEffect, useState } from 'react'
import { useAudioStore, type NormStatus } from '../../model/audioStore'

/**
 * Секция «Аудио»: кроссфейд, нормализация громкости, устройство вывода.
 * Значения пишутся в `useAudioStore`; движок (`useAudioEffects` в App) применяет.
 */

const NORM_STATUS_LABEL: Record<NormStatus, string> = {
  off: 'Выключена',
  analyzing: 'Анализ…',
  ready: 'Готово',
  unavailable: 'Недоступно для этого трека',
}

interface DeviceOpt {
  id: string
  label: string
}

export const AudioSection = () => {
  const xfadeEnabled = useAudioStore((s) => s.xfadeEnabled)
  const xfadeDur = useAudioStore((s) => s.xfadeDur)
  const normEnabled = useAudioStore((s) => s.normEnabled)
  const normTargetDb = useAudioStore((s) => s.normTargetDb)
  const normStatus = useAudioStore((s) => s.normStatus)
  const deviceId = useAudioStore((s) => s.deviceId)
  const setXfadeEnabled = useAudioStore((s) => s.setXfadeEnabled)
  const setXfadeDur = useAudioStore((s) => s.setXfadeDur)
  const setNormEnabled = useAudioStore((s) => s.setNormEnabled)
  const setNormTargetDb = useAudioStore((s) => s.setNormTargetDb)
  const setDeviceId = useAudioStore((s) => s.setDeviceId)

  const [devices, setDevices] = useState<DeviceOpt[] | null>(null)
  const [devSupported, setDevSupported] = useState(true)
  // true — список пуст/без имён (нет доступа к медиа); показываем кнопку
  // «Показать устройства», которая разово запросит доступ (см. unlockDevices).
  const [needUnlock, setNeedUnlock] = useState(false)

  // Перечислить аудиовыходы (named-only: без доступа enumerate отдаёт пустые id).
  const collectDevices = async (): Promise<DeviceOpt[]> => {
    const list = await navigator.mediaDevices.enumerateDevices()
    return list
      .filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default')
      .map((d) => ({ id: d.deviceId, label: d.label || `Устройство ${d.deviceId.slice(0, 8)}…` }))
  }

  useEffect(() => {
    const el = document.createElement('audio') as HTMLAudioElement & { setSinkId?: unknown }
    if (!navigator.mediaDevices || typeof el.setSinkId !== 'function') {
      setDevSupported(false)
      return
    }
    // Тихо перечисляем (без запроса доступа). Если доступ уже выдавался — имена
    // придут сразу; если нет — список пуст/без имён → показываем кнопку.
    void collectDevices()
      .then((outs) => {
        const named = outs.length > 0 && outs.some((d) => !d.label.startsWith('Устройство '))
        setDevices(named ? outs : [])
        setNeedUnlock(!named)
      })
      .catch(() => {
        setDevices([])
        setNeedUnlock(true)
      })
  }, [])

  // Разовый запрос доступа к медиа, чтобы WebView2 раскрыл реальные deviceId/имена.
  // Микрофон не используется — поток глушим сразу. Вызывается ТОЛЬКО по клику.
  const unlockDevices = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      const outs = await collectDevices()
      setDevices(outs)
      setNeedUnlock(false)
    } catch (e) {
      console.warn('[audioDevice] getUserMedia unlock denied/failed', e)
    }
  }

  return (
    <div className="s-section active" id="ssec-audio">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><polyline points="22 8 22 16" /><polyline points="18 10 18 14" /><polyline points="14 4 14 20" /><polyline points="10 8 10 16" /><polyline points="6 11 6 13" /><polyline points="2 10 2 14" /></svg>{' '}
          Аудио
        </div>
      </div>

      {/* Кроссфейд */}
      <div className="sc">
        <h3>Кроссфейд</h3>
        <div className="sr">
          <div>
            <div className="sl2">Кроссфейд</div>
            <div className="ssub">плавный переход между треками</div>
          </div>
          <Toggle checked={xfadeEnabled} onChange={setXfadeEnabled} />
        </div>
        {xfadeEnabled && (
          <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <div>
              <div className="sl2">Длительность</div>
              <div className="ssub">{xfadeDur} сек</div>
            </div>
            <input type="range" className="srange" min={1} max={12} value={xfadeDur} onChange={(e) => setXfadeDur(Number(e.target.value))} />
          </div>
        )}
      </div>

      {/* Нормализация */}
      <div className="sc">
        <h3>Нормализация громкости</h3>
        <div className="sr">
          <div>
            <div className="sl2">Нормализация</div>
            <div className="ssub">все треки одинаковой громкости</div>
          </div>
          <Toggle checked={normEnabled} onChange={setNormEnabled} />
        </div>
        {normEnabled && (
          <>
            <div className="sr">
              <div>
                <div className="sl2">Целевой уровень</div>
                <div className="ssub">{normTargetDb} dB</div>
              </div>
              <input type="range" className="srange" min={-24} max={-6} value={normTargetDb} onChange={(e) => setNormTargetDb(Number(e.target.value))} />
            </div>
            <div className="sr" style={{ opacity: 0.7, borderBottom: 'none', paddingBottom: 0 }}>
              <div>
                <div className="sl2">Статус</div>
                <div className="ssub">{NORM_STATUS_LABEL[normStatus]}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Устройство вывода */}
      <div className="sc">
        <h3>Устройство вывода</h3>
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="sl2">Устройство</div>
            <div className="ssub">
              {!devSupported
                ? 'не поддерживается'
                : needUnlock
                  ? 'нажмите, чтобы увидеть список устройств'
                  : devices == null
                    ? 'выбор аудиовыхода'
                    : `${devices.length} ${plural(devices.length, ['устройство', 'устройства', 'устройств'])}`}
            </div>
          </div>
          {devSupported && needUnlock ? (
            <button className="btn btg" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => void unlockDevices()}>
              Показать устройства
            </button>
          ) : (
            <select
              className="ssel"
              value={deviceId}
              disabled={!devSupported}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="">По умолчанию</option>
              {(devices ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  )
}

const plural = (n: number, forms: [string, string, string]): string => {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="tele-sw">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="tele-sw-track" />
  </label>
)
