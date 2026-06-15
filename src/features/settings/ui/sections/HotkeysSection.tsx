import { useEffect, useState } from 'react'
import { toast } from '@shared/ui'
import {
  useHotkeysStore,
  modSymbol,
  type HotkeyAction,
  type HotkeyMod,
} from '../../model/hotkeysStore'
import { TeleToggleRow } from '../controls/TeleToggleRow'

/**
 * Секция «Горячие клавиши».
 * Глобальная Win+Shift+X (Rust) — read-only; локальные клавиши плеера —
 * редактируемые (перехват новой клавиши, сохранение в `useHotkeysStore`).
 * Диспетчер клавиш на действия — `app/useGlobalHotkeys`.
 */

const PRETTY: Record<string, string> = {
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
}

const baseDisplay = (e: KeyboardEvent): string => {
  if (PRETTY[e.code]) return PRETTY[e.code]
  if (e.code.startsWith('Key')) return e.code.slice(3)
  if (e.code.startsWith('Digit')) return e.code.slice(5)
  if (e.code.startsWith('Arrow')) return e.code.slice(5)
  return e.key.length === 1 ? e.key.toUpperCase() : e.code
}

interface Pending {
  code: string
  mod: HotkeyMod
  display: string
}

export const HotkeysSection = () => {
  const enabled = useHotkeysStore((s) => s.enabled)
  const hotkeys = useHotkeysStore((s) => s.hotkeys)
  const capturing = useHotkeysStore((s) => s.capturing)
  const setEnabled = useHotkeysStore((s) => s.setEnabled)
  const setHotkey = useHotkeysStore((s) => s.setHotkey)
  const resetAll = useHotkeysStore((s) => s.resetAll)
  const setCapturing = useHotkeysStore((s) => s.setCapturing)
  const [pending, setPending] = useState<Pending | null>(null)

  // Перехват новой клавиши во время редактирования (capture-фаза, чтобы
  // глобальный диспетчер не сработал; он и так замьючен флагом capturing).
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
      const mod: HotkeyMod = e.ctrlKey ? 'Ctrl' : e.shiftKey ? 'Shift' : e.altKey ? 'Alt' : null
      setPending({ code: e.code, mod, display: baseDisplay(e) })
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [capturing, setCapturing])

  const startCapture = (k: HotkeyAction) => {
    setPending(null)
    setCapturing(k)
  }
  const save = (k: HotkeyAction) => {
    if (pending) {
      setHotkey(k, pending)
      toast('Горячая клавиша обновлена')
    }
    setCapturing(null)
    setPending(null)
  }
  const cancel = () => {
    setCapturing(null)
    setPending(null)
  }
  const onResetAll = () => {
    resetAll()
    toast('Горячие клавиши сброшены')
  }

  return (
    <div className="s-section active" id="ssec-hotkeys">
      <div className="sc">
        <h3>Общие</h3>
        <TeleToggleRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
            </svg>
          }
          title="Горячие клавиши включены"
          sub="Управление плеером с клавиатуры (вне полей ввода)"
          checked={enabled}
          onChange={setEnabled}
        />
      </div>

      <div className="sc">
        <h3>Глобальные</h3>
        <div className="hk-row">
          <div className="hk-label">Показать tray-popup</div>
          <div className="hk-badge">
            <span className="hk-key">Win</span>
            <span className="sc-plus">+</span>
            <span className="hk-key">Shift</span>
            <span className="sc-plus">+</span>
            <span className="hk-key">X</span>
          </div>
        </div>
      </div>

      <div className="sc">
        <h3>В приложении</h3>
        {(Object.keys(hotkeys) as HotkeyAction[]).map((k) => {
          const h = hotkeys[k]
          const isCap = capturing === k
          return (
            <div className="hk-row" key={k} style={enabled ? undefined : { opacity: 0.5 }}>
              <div className="hk-label">{h.label}</div>

              {!isCap && (
                <div className="hk-badge">
                  {h.mod && (
                    <>
                      <span className="hk-key">{modSymbol(h.mod)}</span>
                      <span className="sc-plus">+</span>
                    </>
                  )}
                  <span className="hk-key">{h.display}</span>
                </div>
              )}

              {isCap && (
                <div className="hk-capture active">
                  <div className="hk-cap-field">
                    {pending
                      ? (pending.mod ? modSymbol(pending.mod) + ' ' : '') + pending.display
                      : 'Нажми клавишу…'}
                  </div>
                  <button className="hk-cap-ok" onClick={() => save(k)}>Ок</button>
                  <button className="hk-cap-cancel" onClick={cancel}>✕</button>
                </div>
              )}

              {!isCap && (
                <button className="hk-edit-btn" onClick={() => startCapture(k)} disabled={!enabled}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
              )}
            </div>
          )
        })}

        <div style={{ marginTop: 10 }}>
          <button className="btn btg" style={{ fontSize: 11, padding: '5px 11px', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onResetAll}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
            Сбросить всё
          </button>
        </div>
      </div>
    </div>
  )
}
