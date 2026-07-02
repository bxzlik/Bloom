import { useEffect, useState } from 'react'
import { toast } from '@shared/ui'
import { useT, type TranslationKey } from '@shared/i18n'
import {
  useHotkeysStore,
  captureFromEvent,
  acceleratorSegments,
  HOTKEY_ORDER,
  type HotkeyAction,
  type Captured,
} from '../../model/hotkeysStore'
import { Ico, type IconName } from '@shared/ui/icons/solar'

/**
 * Секция «Горячие клавиши» — настраиваемые СИСТЕМНЫЕ (OS-global) хоткеи.
 * Каждое действие: иконка + название + описание + кнопка «Назначить» (или
 * назначенное комбо с крестиком). Перехват новой клавиши сохраняется в
 * `useHotkeysStore`; регистрацию в ОС делает `app/useGlobalHotkeys`.
 * Отдельный НЕнастраиваемый Win+Shift+X (окно) — в Rust.
 */

interface ActionMeta {
  icon: IconName
  title: TranslationKey
  sub: TranslationKey
}

const ACTION_META: Record<HotkeyAction, ActionMeta> = {
  play: { icon: 'play', title: 'settings.hotkeys.action.play', sub: 'settings.hotkeys.desc.play' },
  next: { icon: 'next', title: 'settings.hotkeys.action.next', sub: 'settings.hotkeys.desc.next' },
  prev: { icon: 'prev', title: 'settings.hotkeys.action.prev', sub: 'settings.hotkeys.desc.prev' },
  like: { icon: 'heart', title: 'settings.hotkeys.action.like', sub: 'settings.hotkeys.desc.like' },
  volUp: { icon: 'volumeLoud', title: 'settings.hotkeys.action.volUp', sub: 'settings.hotkeys.desc.volUp' },
  volDown: { icon: 'volumeSmall', title: 'settings.hotkeys.action.volDown', sub: 'settings.hotkeys.desc.volDown' },
  toggleOverlay: { icon: 'monitor', title: 'settings.hotkeys.action.toggleOverlay', sub: 'settings.hotkeys.desc.toggleOverlay' },
}

/** Бейдж комбо: сегменты через «+». */
const Badge = ({ segments }: { segments: string[] }) => (
  <div className="hk-badge">
    {segments.map((s, i) => (
      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {i > 0 && <span className="sc-plus">+</span>}
        <span className="hk-key">{s}</span>
      </span>
    ))}
  </div>
)

export const HotkeysSection = () => {
  const t = useT()
  const enabled = useHotkeysStore((s) => s.enabled)
  const bindings = useHotkeysStore((s) => s.bindings)
  const capturing = useHotkeysStore((s) => s.capturing)
  const setEnabled = useHotkeysStore((s) => s.setEnabled)
  const setBinding = useHotkeysStore((s) => s.setBinding)
  const resetAll = useHotkeysStore((s) => s.resetAll)
  const setCapturing = useHotkeysStore((s) => s.setCapturing)
  const [pending, setPending] = useState<Captured | null>(null)

  // Перехват новой клавиши (capture-фаза, чтобы ничего в приложении не сработало).
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCapturing(null)
        setPending(null)
        return
      }
      if (['Control', 'Alt', 'Meta', 'Shift'].includes(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      const cap = captureFromEvent(e)
      if (cap) setPending(cap)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [capturing, setCapturing])

  const startCapture = (k: HotkeyAction) => {
    if (!enabled) return
    setPending(null)
    setCapturing(k)
  }
  const save = (k: HotkeyAction) => {
    if (pending) {
      setBinding(k, pending.accelerator)
      toast(t('settings.hotkeys.toast.updated'))
    }
    setCapturing(null)
    setPending(null)
  }
  const cancel = () => {
    setCapturing(null)
    setPending(null)
  }
  const clear = (k: HotkeyAction) => {
    setBinding(k, null)
    toast(t('settings.hotkeys.toast.cleared'))
  }
  const onResetAll = () => {
    resetAll()
    setCapturing(null)
    setPending(null)
    toast(t('settings.hotkeys.toast.reset'))
  }

  return (
    <div className="s-section active" id="ssec-hotkeys">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="keyboard" width={15} height={15} />{' '}
          {t('settings.hotkeys.heading')}
        </div>
        <button className="s-section-reset" onClick={onResetAll}>
          <Ico name="refresh" width={10} height={10} />{' '}
          {t('common.reset')}
        </button>
      </div>

      <div className="sc">
        <h3>{t('settings.hotkeys.heading')}</h3>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.hotkeys.enabled.title')}</div>
            <div className="ssub">{t('settings.hotkeys.enabled.sub')}</div>
          </div>
          <label className="tele-sw">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="tele-sw-track" />
          </label>
        </div>
      </div>

      <div className="hk-active-head">
        <span className="hk-cat">{t('settings.hotkeys.active')}</span>
        <button className="btn btg hk-reset" onClick={onResetAll} disabled={!enabled}>
          <Ico name="refresh" width={11} height={11} />
          {t('common.reset')}
        </button>
      </div>
      <div className={`hk-list${enabled ? '' : ' hk-disabled'}`}>
        {HOTKEY_ORDER.map((k) => {
            const meta = ACTION_META[k]
            const accel = bindings[k]
            const isCap = capturing === k
            return (
              <div className="hk-card" key={k}>
                <div className="hk-ico">
                  <Ico name={meta.icon} width={18} height={18} />
                </div>
                <div className="hk-text">
                  <div className="hk-title">{t(meta.title)}</div>
                  <div className="hk-sub">{t(meta.sub)}</div>
                </div>

                {isCap ? (
                  <div className="hk-capture active">
                    <div className="hk-cap-field">
                      {pending
                        ? acceleratorSegments(pending.accelerator).join(' + ')
                        : t('settings.hotkeys.pressKey')}
                    </div>
                    <button className="hk-cap-ok" onClick={() => save(k)} disabled={!pending}>
                      {t('settings.hotkeys.ok')}
                    </button>
                    <button className="hk-cap-cancel" onClick={cancel}>✕</button>
                  </div>
                ) : accel ? (
                  <div className="hk-assigned">
                    <button className="hk-assign-btn" onClick={() => startCapture(k)} disabled={!enabled}>
                      <Badge segments={acceleratorSegments(accel)} />
                    </button>
                    <button className="hk-clear" onClick={() => clear(k)} disabled={!enabled} aria-label={t('settings.hotkeys.clear')}>
                      <Ico name="close" width={13} height={13} />
                    </button>
                  </div>
                ) : (
                  <button className="hk-assign" onClick={() => startCapture(k)} disabled={!enabled}>
                    <span className="hk-assign-plus">+</span>
                    {t('settings.hotkeys.assign')}
                  </button>
                )}
              </div>
            )
        })}
      </div>
    </div>
  )
}
