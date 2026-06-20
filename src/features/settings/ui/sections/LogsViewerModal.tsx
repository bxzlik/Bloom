import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { runEnterAnimation } from '@shared/lib/enterAnimation'

/**
 * Просмотрщик логов: модалка с моноширинным содержимым (хвост лога из `read_logs`).
 * Контролируется снаружи: `content === null` → закрыта.
 *
 * Анимация — как у остальных модалок (`.logs-backdrop`/`.logs-modal` в modals.css):
 * фон fade'ит opacity, окно выезжает bouncy-scale'ом. Поэтому держим свои
 * `mounted`/`opening`: при закрытии сначала проигрываем exit-переход и только по
 * `transitionEnd` размонтируем. `text` — снимок содержимого, чтобы при закрытии
 * (content → null) не мигало пустотой во время exit-анимации.
 */
export const LogsViewerModal = ({
  content,
  onClose,
}: {
  content: string | null
  onClose: () => void
}) => {
  const t = useT()
  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    if (content !== null) {
      setText(content)
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false) // запускаем exit-переход; размонтирование — в onTransitionEnd
  }, [content])

  useEffect(() => {
    if (content === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [content, onClose])

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('logs.copied'))
    } catch {
      toast(t('logs.copyFail'))
    }
  }

  if (!mounted) return null

  return createPortal(
    <div
      className={`logs-backdrop${opening ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTransitionEnd={(e) => {
        if (content === null && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div className="logs-modal">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,.08)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t('logs.title')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btg"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => void onCopy()}
            >
              {t('logs.copy')}
            </button>
            <button
              className="btn btg"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={onClose}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
        <pre
          style={{
            flex: 1,
            margin: 0,
            padding: '12px 16px',
            overflow: 'auto',
            fontSize: 11.5,
            lineHeight: 1.5,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'rgba(255,255,255,.82)',
            userSelect: 'text',
            WebkitUserSelect: 'text',
            cursor: 'text',
          }}
        >
          {text || t('logs.empty')}
        </pre>
      </div>
    </div>,
    document.body,
  )
}
