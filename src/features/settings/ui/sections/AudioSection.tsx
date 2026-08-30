import { useEffect, useState } from 'react'
import { useAudioStore, type NormStatus } from '../../model/audioStore'
import { useSettingsStore } from '../../model/settingsStore'
import { useT, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Секция «Аудио»: запуск (восстановление сессии), кроссфейд, нормализация
 * громкости, устройство вывода. Кроссфейд/нормализация/устройство пишутся в
 * `useAudioStore` (движок `useAudioEffects` в App их применяет), восстановление
 * и автовоспроизведение — в Rust `AppSettings` через `useSettingsStore`.
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

/**
 * Chromium/WebView2 дописывает к имени USB-устройства его `vid:pid`
 * («Наушники гарнитуры (G435 Wireless) (046d:0acb)»). В карточке разносим:
 * имя — заголовком, аппаратный id — подписью.
 */
const splitHwId = (label: string): { name: string; hw: string | null } => {
  const m = /^(.*?)\s*\(([0-9a-f]{4}:[0-9a-f]{4})\)\s*$/i.exec(label)
  return m ? { name: m[1], hw: m[2] } : { name: label, hw: null }
}

/** Иконка карточки по имени устройства (наушники / bluetooth / колонки). */
const deviceIcon = (label: string): 'speaker' | 'headphones' | 'bluetooth' => {
  const s = label.toLowerCase()
  if (/headphone|headset|earbud|наушник|гарнитур/.test(s)) return 'headphones'
  if (/bluetooth|блютуз/.test(s)) return 'bluetooth'
  return 'speaker'
}

export const AudioSection = () => {
  const t = useT()
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
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const restoreQueue = useSettingsStore((s) => s.restore_queue)
  const autoplay = useSettingsStore((s) => s.autoplay)
  const setRestoreQueue = useSettingsStore((s) => s.setRestoreQueue)
  const setAutoplay = useSettingsStore((s) => s.setAutoplay)

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

      {/* Запуск: восстановление прошлой сессии и автовоспроизведение.
          Автовоспроизведение — вложенная настройка восстановления («и сразу
          продолжить»), само оно ничего не восстанавливает. Поэтому строка
          появляется только при включённом восстановлении, а его выключение
          гасит и её (см. `setRestoreQueue`): скрытый флаг не должен остаться
          поднятым, иначе возврат восстановления дал бы играющий с порога плеер. */}
      <div className="sc">
        <h3>{t('settings.system.startup')}</h3>
        <div className="sr" style={restoreQueue ? undefined : { borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="sl2">{t('settings.system.restoreQueue.title')}</div>
            <div className="ssub">{t('settings.system.restoreQueue.sub')}</div>
          </div>
          <Toggle
            checked={restoreQueue}
            disabled={!settingsLoaded}
            onChange={(v) => void setRestoreQueue(v)}
          />
        </div>
        {restoreQueue && (
          <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <div>
              <div className="sl2">{t('settings.system.autoplay.title')}</div>
              <div className="ssub">{t('settings.system.autoplay.sub')}</div>
            </div>
            <Toggle
              checked={autoplay}
              disabled={!settingsLoaded}
              onChange={(v) => void setAutoplay(v)}
            />
          </div>
        )}
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

      {/* Устройство вывода — сетка карточек вместо <select> */}
      <div className="sc">
        <h3>{t('settings.audio.output')}</h3>
        <div className="sr sr-block">
          <div className="sc-title">{t('settings.audio.output.title')}</div>
          <div className="sc-desc">
            {!devSupported
              ? t('settings.audio.device.unsupported')
              : needUnlock
                ? t('settings.audio.device.needUnlock')
                : t('settings.audio.output.sub')}
          </div>
          {devSupported && (
            <div className="s-dev-grid">
              <DeviceCard
                icon="speaker"
                name={t('settings.audio.device.default')}
                sub={t('settings.audio.device.system')}
                active={deviceId === ''}
                onClick={() => setDeviceId('')}
              />
              {(devices ?? []).map((d) => {
                const { name, hw } = splitHwId(d.label)
                return (
                  <DeviceCard
                    key={d.id}
                    icon={deviceIcon(d.label)}
                    name={d.named ? name : t('settings.audio.device.fallback', { id: d.label })}
                    sub={hw}
                    active={deviceId === d.id}
                    onClick={() => setDeviceId(d.id)}
                  />
                )
              })}
              {needUnlock && (
                <button className="s-dev-card s-dev-unlock" onClick={() => void unlockDevices()}>
                  <Ico name="refresh" width={17} height={17} />
                  <div className="s-dev-name">{t('settings.audio.device.show')}</div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Карточка аудиовыхода: иконка сверху, имя и аппаратный id снизу. */
const DeviceCard = ({ icon, name, sub, active, onClick }: {
  icon: 'speaker' | 'headphones' | 'bluetooth'
  name: string
  sub: string | null
  active: boolean
  onClick: () => void
}) => (
  <button className={`s-dev-card${active ? ' active' : ''}`} onClick={onClick}>
    <Ico name={icon} width={17} height={17} />
    <div className="s-dev-name">{name}</div>
    {sub && <div className="s-dev-sub">{sub}</div>}
  </button>
)

const Toggle = ({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  /** Настройки ещё не подтянулись из Rust — иначе клик перетёрло бы бутстрапом. */
  disabled?: boolean
  onChange: (v: boolean) => void
}) => (
  <label className="tele-sw">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="tele-sw-track" />
  </label>
)
