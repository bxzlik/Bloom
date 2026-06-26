import { useState } from 'react'
import { cn } from '@shared/lib/cn'
import { useTauriEvent } from '@shared/hooks'
import { Ico, type IconName } from '@shared/ui/icons/solar'
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
      <Sni p="home" icon="home" active={page === 'home'} onClick={() => goNav('home')} />

      <div className="sb-sep" />

      <div className="sb-nav">
        <Sni p="player" icon="play" active={page === 'player'} onClick={() => goNav('player')} />
        <Sni p="lib" icon="library" active={page === 'lib'} onClick={() => goNav('lib')} />
        <Sni p="search" icon="search" iconSize={18} active={page === 'search'} onClick={() => goNav('search')} />
      </div>

      <div className="sb-sep" />

      <div className="sb-bot">
        <div className="sni" id="floatPlayerToggleBtn" onClick={toggleMini} style={navFloatBtn ? (miniOpen ? { color: 'var(--accent)' } : undefined) : { display: 'none' }}>
          <Ico name="pip" variant={miniOpen ? 'bold' : 'linear'} width={17} height={17} />
        </div>
        <Sni p="settings" icon="settings" active={false} onClick={openSettings} />
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
  icon,
  iconSize = 19,
  onClick,
  children,
}: {
  p: PageId | 'settings'
  active: boolean
  /** Если задан — Sni сам рисует иконку (linear, либо bold когда active). */
  icon?: IconName
  iconSize?: number
  onClick: () => void
  children?: React.ReactNode
}) => (
  <div
    className={cn('sni', active && 'active')}
    data-p={p}
    onClick={onClick}
    style={p === 'home' ? { flexShrink: 0 } : undefined}
  >
    {icon ? (
      <Ico name={icon} variant={active ? 'bold' : 'linear'} width={iconSize} height={iconSize} />
    ) : (
      children
    )}
  </div>
)
