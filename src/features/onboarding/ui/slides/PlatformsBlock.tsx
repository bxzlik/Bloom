import { useEffect, useState, type ReactNode } from 'react'
import { ScLogo, YtmLogo, SpLogo, YmLogo, providerBrandColor } from '@entities/track'
import { getManualClientId, setManualClientId, checkConnection } from '@features/soundcloud'
import { useSpAuthStore } from '@features/spotify'
import { useYmAuthStore } from '@features/yandex'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Блок «Площадки» на слайде «Подключи музыку» — аккордеон из четырёх строк.
 *
 * Флоу у каждой площадки свой и здесь он настоящий, а не заглушка:
 *  • SoundCloud — ручной `client_id` в localStorage (или авто-подбор «Проверить»);
 *  • YouTube Music — авторизации не требует, строка не раскрывается;
 *  • Spotify — client_id + client_secret, проверяются обменом на токен в Rust;
 *  • Яндекс.Музыка — OAuth device-flow: код + открытие страницы + поллинг.
 *
 * Раскрыта максимум одна строка: в карточке 460px иначе не хватает высоты.
 * Состояния берутся из тех же сторов, что и секции настроек, поэтому
 * подключённое здесь видно там и наоборот.
 */

type PlatId = 'sc' | 'ytm' | 'sp' | 'ym'

export const PlatformsBlock = () => {
  const t = useT()
  const [open, setOpen] = useState<PlatId | null>(null)

  const spEnabled = useSpAuthStore((s) => s.enabled)
  const spRefresh = useSpAuthStore((s) => s.refresh)
  const ymAuthed = useYmAuthStore((s) => s.authed)
  const ymRefresh = useYmAuthStore((s) => s.refresh)
  const ymCancel = useYmAuthStore((s) => s.cancelAuth)

  const [scSaved, setScSaved] = useState(() => !!getManualClientId())

  // Статусы площадок живут в Rust/localStorage — подтянуть при открытии слайда.
  // Поллинг Яндекса обрываем при уходе со слайда (как это делает секция настроек).
  useEffect(() => {
    void spRefresh()
    void ymRefresh()
    return () => ymCancel()
  }, [spRefresh, ymRefresh, ymCancel])

  const toggle = (id: PlatId) => setOpen((cur) => (cur === id ? null : id))

  return (
    <div className="ob-plats">
      <Row
        id="sc"
        open={open === 'sc'}
        onToggle={toggle}
        logo={<ScLogo size={17} />}
        tint={providerBrandColor('soundcloud')}
        name="SoundCloud"
        connected={scSaved}
      >
        <ScForm onSaved={setScSaved} />
      </Row>

      <Row
        id="ym"
        open={open === 'ym'}
        onToggle={toggle}
        logo={<YmLogo size={18} />}
        tint={providerBrandColor('yandex')}
        name={t('settings.nav.yandex')}
        connected={ymAuthed}
      >
        <YmForm />
      </Row>

      <Row
        id="sp"
        open={open === 'sp'}
        onToggle={toggle}
        logo={<SpLogo size={17} />}
        tint={providerBrandColor('spotify')}
        name="Spotify"
        connected={spEnabled}
      >
        <SpForm />
      </Row>

      <Row
        id="ytm"
        logo={<YtmLogo size={17} />}
        tint={providerBrandColor('ytmusic')}
        name="YouTube Music"
        connected
        connectedText={t('settings.ytm.status')}
      />
    </div>
  )
}

// ── Строка аккордеона ──

interface RowProps {
  id: PlatId
  logo: ReactNode
  /** Фирменный цвет площадки — лого красятся `currentColor`. */
  tint?: string
  name: string
  connected: boolean
  /** Текст статуса при `connected`. По умолчанию — «Подключено». */
  connectedText?: string
  /** Без `onToggle` строка не раскрывается (YouTube Music). */
  open?: boolean
  onToggle?: (id: PlatId) => void
  children?: ReactNode
}

const Row = ({ id, logo, tint, name, connected, connectedText, open = false, onToggle, children }: RowProps) => {
  const t = useT()
  const expandable = !!onToggle

  return (
    <div className={`ob-plat${open ? ' open' : ''}`} style={tint ? { ['--ob-tint' as string]: tint } : undefined}>
      <button
        type="button"
        className="ob-plat-head"
        onClick={expandable ? () => onToggle(id) : undefined}
        disabled={!expandable}
      >
        <span className="ob-plat-logo">{logo}</span>
        <span className="ob-plat-name">{name}</span>
        <span className={`ob-plat-status${connected ? ' ok' : ''}`}>
          {connected ? (connectedText ?? t('onb.plat.connected')) : t('onb.plat.notConnected')}
        </span>
        {expandable && <Ico name="arrowDown" width={13} height={13} className="ob-plat-chev" />}
      </button>

      {expandable && (
        <div className="ob-plat-body">
          <div className="ob-plat-body-in">
            <div className="ob-plat-form">{children}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SoundCloud: ручной client_id ──

const ScForm = ({ onSaved }: { onSaved: (v: boolean) => void }) => {
  const t = useT()
  const [value, setValue] = useState(() => getManualClientId() ?? '')
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const save = () => {
    const v = value.trim()
    setManualClientId(v || null)
    onSaved(!!v)
    setStatus({ text: v ? t('settings.sc.status.saved') : t('settings.sc.status.reset'), kind: v ? 'ok' : 'info' })
  }

  const check = async () => {
    setChecking(true)
    setStatus({ text: t('settings.sc.status.checking'), kind: 'info' })
    const r = await checkConnection()
    setChecking(false)
    if (r.ok) {
      // Авто-подбор сработал — подставим ключ в поле, чтобы его можно было сохранить.
      if (!value.trim() && r.clientId) setValue(r.clientId)
      setStatus({ text: t('settings.sc.status.ok'), kind: 'ok' })
    } else {
      setStatus({ text: t('settings.sc.status.failPrefix') + (r.error || t('settings.sc.status.errFallback')), kind: 'err' })
    }
  }

  return (
    <>
      <input
        className="ob-plat-inp"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder={t('settings.sc.placeholder')}
        spellCheck={false}
      />
      <div className="ob-plat-actions">
        <button className="ob-plat-btn primary" onClick={save}>
          {t('common.save')}
        </button>
        <button className="ob-plat-btn" onClick={() => void check()} disabled={checking}>
          {t('onb.plat.autoCheck')}
        </button>
      </div>
      <StatusLine status={status} />
    </>
  )
}

// ── Spotify: client_id + client_secret ──

const SpForm = () => {
  const t = useT()
  const checking = useSpAuthStore((s) => s.checking)
  const status = useSpAuthStore((s) => s.status)
  const enabled = useSpAuthStore((s) => s.enabled)
  const saveAndCheck = useSpAuthStore((s) => s.saveAndCheck)
  const clear = useSpAuthStore((s) => s.clear)

  // Поля живут в сторе, а не в локальном state: `refresh()` подтягивает
  // сохранённые creds асинхронно и уже после монтирования этой формы —
  // локальная копия так и осталась бы пустой.
  const id = useSpAuthStore((s) => s.clientId)
  const secret = useSpAuthStore((s) => s.clientSecret)
  const setFields = useSpAuthStore((s) => s.setFields)

  const save = () => void saveAndCheck(id, secret)

  return (
    <>
      <input
        className="ob-plat-inp"
        value={id}
        onChange={(e) => setFields(e.target.value, secret)}
        placeholder="client_id"
        spellCheck={false}
      />
      <input
        className="ob-plat-inp"
        type="password"
        value={secret}
        onChange={(e) => setFields(id, e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="client_secret"
        spellCheck={false}
      />
      <div className="ob-plat-actions">
        <button className="ob-plat-btn primary" onClick={save} disabled={checking}>
          {t('settings.sp.saveCheck')}
        </button>
        {enabled && (
          <button className="ob-plat-btn" onClick={() => void clear()}>
            {t('settings.sp.clear')}
          </button>
        )}
      </div>
      <StatusLine status={status} />
    </>
  )
}

// ── Яндекс.Музыка: device-flow ──

const YmForm = () => {
  const t = useT()
  const authed = useYmAuthStore((s) => s.authed)
  const connecting = useYmAuthStore((s) => s.connecting)
  const userCode = useYmAuthStore((s) => s.userCode)
  const verifyUrl = useYmAuthStore((s) => s.verifyUrl)
  const status = useYmAuthStore((s) => s.status)
  const startAuth = useYmAuthStore((s) => s.startAuth)
  const logout = useYmAuthStore((s) => s.logout)

  if (authed) {
    return (
      <>
        <div className="ob-plat-note">{t('settings.ym.connected')}</div>
        <div className="ob-plat-actions">
          <button className="ob-plat-btn" onClick={() => void logout()}>
            {t('settings.ym.logout')}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="ob-plat-note">{t('settings.ym.loginHint')}</div>
      {connecting && userCode && (
        <div className="ob-plat-code">
          <span>
            {t('settings.ym.codePrompt.a')} {verifyUrl} {t('settings.ym.codePrompt.b')}
          </span>
          <b>{userCode}</b>
        </div>
      )}
      <div className="ob-plat-actions">
        <button className="ob-plat-btn primary" onClick={() => void startAuth()} disabled={connecting}>
          {t('settings.ym.connect')}
        </button>
      </div>
      <StatusLine status={status} />
    </>
  )
}

// ── Общее ──

type Status = { text: string; kind: 'ok' | 'err' | 'info' } | null

const StatusLine = ({ status }: { status: Status }) =>
  status ? <div className={`ob-plat-status-line ${status.kind}`}>{status.text}</div> : null
