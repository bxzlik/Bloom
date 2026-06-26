import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Минималистичные строительные блоки для вкладок интеграций в настройках
 * (SoundCloud / Genius / Last.fm / Яндекс.Музыка).
 *
 * Идея: компактная карточка с иконкой площадки и статусом в шапке, длинная
 * инструкция спрятана под кнопкой «?» (попап-портал), а ввод ключа/токена —
 * одно поле с инлайн-«глазом» и кнопкой-галочкой «сохранить».
 */

const EyeIcon = () => <Ico name="eye" width={14} height={14} />

const CheckIcon = () => <Ico name="check" width={16} height={16} />

/**
 * Кнопка «?» с попапом-подсказкой. Попап рендерится порталом в body и
 * позиционируется fixed под кнопкой (как меню «Моей волны») — иначе его
 * перекрывает контент секции и обрезает скролл-контейнер настроек.
 */
export const HelpPopup = ({ children }: { children: ReactNode }) => {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  usePopupOpenAnimation(popRef, pos)

  const toggle = () => {
    if (pos) {
      setPos(null)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
  }

  // Координаты fixed-попапа теряют актуальность при ресайзе/скролле — закрываем.
  useLayoutEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [pos])

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label="?"
        aria-haspopup="dialog"
        aria-expanded={pos !== null}
        style={{
          width: 24,
          height: 24,
          flexShrink: 0,
          borderRadius: '50%',
          background: pos ? 'var(--accent)' : 'var(--hover)',
          color: pos ? 'var(--accent-text,#fff)' : 'var(--text2)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: 'var(--font)',
          transition: '.15s',
        }}
      >
        ?
      </button>
      {pos &&
        createPortal(
          <>
            <div onClick={() => setPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 9000 }} />
            <div
              ref={popRef}
              role="dialog"
              style={{
                position: 'fixed',
                top: pos.top,
                right: pos.right,
                zIndex: 9001,
                transformOrigin: 'top right',
                width: 320,
                maxWidth: 'calc(100vw - 24px)',
                padding: 14,
                background: 'color-mix(in srgb,var(--block-color),var(--text) 1%)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 'calc(var(--radius)*.7)',
                boxShadow: '0 20px 60px rgba(0,0,0,.85),0 6px 20px rgba(0,0,0,.5),0 0 0 0.5px rgba(255,255,255,.04)',
                fontSize: 12,
                color: 'var(--text2)',
                lineHeight: 1.6,
              }}
            >
              {children}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

/**
 * Поле для секретного ключа/токена: моноширинный ввод с инлайн-«глазом»
 * (показать/скрыть) и квадратной кнопкой-галочкой «сохранить» справа.
 * Enter в поле тоже сохраняет.
 */
export const SecretInput = ({
  value,
  onChange,
  onSave,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  placeholder?: string
}) => {
  const [visible, setVisible] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave()
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1,
            fontFamily: 'monospace',
            fontSize: 12,
            padding: '9px 34px 9px 12px',
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'calc(var(--radius) * 0.6)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        <button
          onClick={() => setVisible((v) => !v)}
          aria-label="toggle visibility"
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text2)',
            display: 'flex',
            padding: 2,
          }}
        >
          <EyeIcon />
        </button>
      </div>
      <button
        onClick={onSave}
        aria-label="save"
        style={{
          width: 40,
          flexShrink: 0,
          background: 'var(--accent)',
          color: 'var(--accent-text,#fff)',
          border: 'none',
          borderRadius: 'calc(var(--radius) * 0.6)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: '.15s',
        }}
      >
        <CheckIcon />
      </button>
    </div>
  )
}

/**
 * Минималистичная карточка интеграции. Шапка: иконка-плашка площадки
 * (красится её брендовым цветом `tint`), название, строка статуса, опциональные
 * действия (напр. «Выйти») и кнопка «?» с попапом-инструкцией. Ниже — тело.
 */
export const IntegrationCard = ({
  icon,
  tint,
  title,
  status,
  help,
  actions,
  children,
  style,
}: {
  icon: ReactNode
  /** Брендовый цвет площадки — фон/цвет иконки-плашки. */
  tint: string
  title: ReactNode
  status?: ReactNode
  /** Содержимое попапа-инструкции под кнопкой «?». Если нет — кнопка скрыта. */
  help?: ReactNode
  /** Действия справа в шапке (напр. кнопка «Выйти»). */
  actions?: ReactNode
  children?: ReactNode
  style?: CSSProperties
}) => (
  <div
    className="intg-card"
    style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
      margin: '0 2px',
      ...style,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 'calc(var(--radius)*.55)',
          background: `color-mix(in srgb, ${tint} 16%, transparent)`,
          color: tint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.2 }}>{title}</div>
        {status && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{status}</div>
        )}
      </div>
      {actions}
      {help && <HelpPopup>{help}</HelpPopup>}
    </div>
    {children && <div style={{ marginTop: 14 }}>{children}</div>}
  </div>
)

/** Заголовок блока внутри попапа-инструкции. */
export const HelpTitle = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{children}</div>
)

/** Нумерованный список шагов внутри попапа-инструкции. */
export const HelpSteps = ({ children }: { children: ReactNode }) => (
  <ol style={{ fontSize: 11.5, color: 'var(--text2)', paddingLeft: 18, lineHeight: 1.9, margin: 0 }}>
    {children}
  </ol>
)
