import { useEffect, useRef, useState } from 'react'
import { useT, useLocale } from '@shared/i18n'
import { useNotifStore, type NotifItem, type NotifKind } from './notificationsStore'

/**
 * Колокольчик уведомлений в тайтлбаре (`<NotifBell/>`, вставляется в `.win-btns`
 * рядом с закрепом). Бейдж = число непрочитанных; клик открывает панель-историю
 * (`.notif-panel`, CSS в shared/styles/notifications.css). Открытие помечает всё
 * прочитанным. Видимость самого колокольчика — флаг `tbBell` в uiPrefsStore.
 */
export const NotifBell = () => {
  const t = useT()
  useLocale()
  const items = useNotifStore((s) => s.items)
  const markAllRead = useNotifStore((s) => s.markAllRead)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const unread = items.reduce((n, it) => n + (it.read ? 0 : 1), 0)

  // Открытие панели = всё прочитано (бейдж гаснет).
  useEffect(() => {
    if (open) markAllRead()
  }, [open, markAllRead])

  // Закрытие по клику вне / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className={`win-btn win-bell${open ? ' on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={t('titlebar.notifs')}
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label={t('notif.title')}>
          {items.length === 0 ? (
            <div className="notif-empty">{t('notif.empty')}</div>
          ) : (
            <div className="notif-list">
              {items.map((it) => (
                <NotifCard key={it.id} item={it} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const NotifCard = ({ item }: { item: NotifItem }) => {
  const t = useT()
  const time = new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className={`notif-card notif-${item.kind}`}>
      <span className="notif-ico">{KIND_ICON[item.kind]}</span>
      <div className="notif-body">
        <div className="notif-card-head">
          <span className="notif-card-title">{t(item.titleKey)}</span>
          <span className="notif-time">{time}</span>
        </div>
        {item.body && <div className="notif-text">{item.body}</div>}
        {item.action && (
          <button className="notif-action" onClick={item.action}>
            {t(item.actionLabelKey ?? 'notif.details')}
          </button>
        )}
      </div>
    </div>
  )
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const KIND_ICON: Record<NotifKind, React.ReactNode> = {
  error: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16.5" x2="12" y2="16.5" />
    </svg>
  ),
  success: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9" />
    </svg>
  ),
  info: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="7.5" x2="12" y2="7.5" />
    </svg>
  ),
  update: (
    <svg {...iconProps}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 4 21 9 16 9" />
    </svg>
  ),
}
