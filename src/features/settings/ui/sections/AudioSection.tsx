import { useEffect, useState } from 'react'
import { useAudioStore, type NormStatus } from '../../model/audioStore'
import { useT, useLocale, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Секция «Аудио»: кроссфейд, нормализация громкости, устройство вывода.
 * Значения пишутся в `useAudioStore`; движок (`useAudioEffects` в App) применяет.
 */

const NORM_STATUS_KEY: Record<NormStatus, TranslationKey> = {
  off: 'settings.audio.norm.off',
  analyzing: 'settings.audio.norm.analyzing',
  ready: 'settings.audio.norm.ready',
  unavailable: 'settings.audio.norm.unavailable',
}

interface DeviceOpt {
  id: string
  label: string
  /** true — у устройства есть реальное имя (иначе показываем fallback по id). */
  named: boolean
}

export const AudioSection = () => {
  const t = useT()
  const locale = useLocale()
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
      .map((d) => ({ id: d.deviceId, named: !!d.label, label: d.label || d.deviceId.slice(0, 8) }))
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
        const named = outs.length > 0 && outs.some((d) => d.named)
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
          <Ico name="eq" width={15} height={15} />{' '}
          {t('settings.nav.audio')}
        </div>
      </div>

      {/* Кроссфейд */}
      <div className="sc">
        <h3>{t('settings.audio.crossfade')}</h3>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.audio.crossfade')}</div>
            <div className="ssub">{t('settings.audio.crossfade.sub')}</div>
          </div>
          <Toggle checked={xfadeEnabled} onChange={setXfadeEnabled} />
        </div>
        {xfadeEnabled && (
          <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <div>
              <div className="sl2">{t('settings.audio.duration')}</div>
              <div className="ssub">{t('settings.audio.seconds', { n: xfadeDur })}</div>
            </div>
            <input type="range" className="srange" min={1} max={12} value={xfadeDur} onChange={(e) => setXfadeDur(Number(e.target.value))} />
          </div>
        )}
      </div>

      {/* Нормализация */}
      <div className="sc">
        <h3>{t('settings.audio.norm')}</h3>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.audio.norm.row')}</div>
            <div className="ssub">{t('settings.audio.norm.sub')}</div>
          </div>
          <Toggle checked={normEnabled} onChange={setNormEnabled} />
        </div>
        {normEnabled && (
          <>
            <div className="sr">
              <div>
                <div className="sl2">{t('settings.audio.norm.target')}</div>
                <div className="ssub">{normTargetDb} dB</div>
              </div>
              <input type="range" className="srange" min={-24} max={-6} value={normTargetDb} onChange={(e) => setNormTargetDb(Number(e.target.value))} />
            </div>
            <div className="sr" style={{ opacity: 0.7, borderBottom: 'none', paddingBottom: 0 }}>
              <div>
                <div className="sl2">{t('settings.audio.norm.status')}</div>
                <div className="ssub">{t(NORM_STATUS_KEY[normStatus])}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Устройство вывода */}
      <div className="sc">
        <h3>{t('settings.audio.output')}</h3>
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="sl2">{t('settings.audio.device')}</div>
            <div className="ssub">
              {!devSupported
                ? t('settings.audio.device.unsupported')
                : needUnlock
                  ? t('settings.audio.device.needUnlock')
                  : devices == null
                    ? t('settings.audio.device.pick')
                    : deviceCountLabel(devices.length, locale)}
            </div>
          </div>
          {devSupported && needUnlock ? (
            <button className="btn btg" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => void unlockDevices()}>
              {t('settings.audio.device.show')}
            </button>
          ) : (
            <select
              className="ssel"
              value={deviceId}
              disabled={!devSupported}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="">{t('settings.audio.device.default')}</option>
              {(devices ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.named ? d.label : t('settings.audio.device.fallback', { id: d.label })}</option>
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

/** Счётчик устройств с учётом плюрализации языка. */
const deviceCountLabel = (n: number, locale: string): string =>
  locale === 'ru'
    ? `${n} ${plural(n, ['устройство', 'устройства', 'устройств'])}`
    : `${n} ${n === 1 ? 'device' : 'devices'}`

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="tele-sw">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="tele-sw-track" />
  </label>
)
