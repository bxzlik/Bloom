import { useState } from 'react'
import { cn } from '@shared/lib/cn'
import { useTauriEvent } from '@shared/hooks'
import { SidebarAvatar } from '@features/profile'
import { openMiniplayer, closeMiniplayer } from '@features/player'
import { useUiPrefsStore } from '@features/settings'
import { useNavStore, type PageId } from './navigationStore'

/**
 * Sidebar блока `.sidebar#sidebarEl`.
 * Иконки и SVG-разметка скопированы без изменений.
 *
 * Структура: [home] | sep | [player, lib, search] | sep | [mp-toggle, settings, account]
 */
export const Sidebar = () => {
  const page = useNavStore((s) => s.page)
  const goNav = useNavStore((s) => s.goNav)
  const openSettings = useNavStore((s) => s.openSettings)
  const navFloatBtn = useUiPrefsStore((s) => s.navFloatBtn)

  // Тоггл мини-плеера: первый клик показывает мини-окно, повторный — закрывает
  //. Флаг синхронизируем с событием
  // `bloom-mp-closed` — на случай закрытия мини его собственным крестиком.
  const [miniOpen, setMiniOpen] = useState(false)
  useTauriEvent('bloom-mp-closed', () => setMiniOpen(false))
  const toggleMini = () => {
    if (miniOpen) {
      void closeMiniplayer().catch(() => {})
      setMiniOpen(false)
    } else {
      void openMiniplayer().catch(() => {})
      setMiniOpen(true)
    }
  }

  return (
    <div className="sidebar" id="sidebarEl">
      <Sni p="home" active={page === 'home'} onClick={() => goNav('home')}>
        <svg
          width="19"
          height="19"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </Sni>

      <div className="sb-sep" />

      <div className="sb-nav">
        <Sni p="player" active={page === 'player'} onClick={() => goNav('player')}>
          <svg width="19" height="19" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
          </svg>
        </Sni>
        <Sni p="lib" active={page === 'lib'} onClick={() => goNav('lib')}>
          <svg
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
        </Sni>
        <Sni p="search" active={page === 'search'} onClick={() => goNav('search')}>
          <svg
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </Sni>
      </div>

      <div className="sb-sep" />

      <div className="sb-bot">
        <div className="sni" id="floatPlayerToggleBtn" onClick={toggleMini} style={navFloatBtn ? (miniOpen ? { color: 'var(--accent)' } : undefined) : { display: 'none' }}>
          <svg
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <rect x="2" y="7" width="20" height="15" rx="2" />
            <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
            <line x1="12" y1="12" x2="12" y2="16" />
            <line x1="10" y1="14" x2="14" y2="14" />
          </svg>
        </div>
        <Sni p="settings" active={false} onClick={openSettings}>
          <svg
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Sni>
        <Sni p="account" active={page === 'account'} onClick={() => goNav('account')}>
          <SidebarAvatar />
        </Sni>
      </div>
    </div>
  )
}

const Sni = ({
  p,
  active,
  onClick,
  children,
}: {
  p: PageId | 'settings'
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) => (
  <div
    className={cn('sni', active && 'active')}
    data-p={p}
    onClick={onClick}
    style={p === 'home' ? { flexShrink: 0 } : undefined}
  >
    {children}
  </div>
)
