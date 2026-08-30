import { useState } from 'react'
import { cn } from '@shared/lib/cn'
import { useTauriEvent } from '@shared/hooks'
import { useT } from '@shared/i18n'
import { Ico, type IconName } from '@shared/ui/icons/solar'
import { SidebarAvatar, useProfileStore } from '@features/profile'
import { openMiniplayer, closeMiniplayer } from '@features/player'
import { useUiPrefsStore } from '@features/settings'
import { useSearchOverlayStore } from '@features/search'
import { useNavStore, type PageId } from './navigationStore'

/**
 * Sidebar блока `.sidebar#sidebarEl`.
 * Иконки и SVG-разметка скопированы без изменений.
 *
 * Структура: [home] | sep | [player, lib, search] | sep | [mp-toggle, settings, account]
 *
 * Подписи (`.sni-lbl`) рендерятся всегда, показывает их только CSS в режиме
 * `sidebarView: 'full'` (`.app.sidebar-full`, см. base.css) — так переключение
 * вида не трогает разметку.
 */
export const Sidebar = () => {
  const t = useT()
  const page = useNavStore((s) => s.page)
  const goNav = useNavStore((s) => s.goNav)
  const openSettings = useNavStore((s) => s.openSettings)
  const navFloatBtn = useUiPrefsStore((s) => s.navFloatBtn)
  const profileName = useProfileStore((s) => s.name)
  // Вид поиска: страница (переход по вкладке) или всплывающий ввод поверх текущей.
  const searchView = useUiPrefsStore((s) => s.searchView)
  const toggleSearchOverlay = useSearchOverlayStore((s) => s.toggle)
  const onSearchClick = () => (searchView === 'overlay' ? toggleSearchOverlay() : goNav('search'))

  // Тоггл PiP-окна: первый клик показывает окно, повторный — закрывает
  // (в Rust и в API оно по-прежнему `miniplayer` — переименована только подпись)
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
      <Sni p="home" icon="home" label={t('nav.home')} active={page === 'home'} onClick={() => goNav('home')} />

      <div className="sb-sep" />

      <div className="sb-nav">
        <Sni p="player" icon="play" label={t('nav.player')} active={page === 'player'} onClick={() => goNav('player')} />
        <Sni p="lib" icon="library" label={t('nav.library')} active={page === 'lib'} onClick={() => goNav('lib')} />
        <Sni p="search" icon="search" iconSize={20} label={t('nav.search')} active={page === 'search'} onClick={onSearchClick} />
      </div>

      <div className="sb-sep" />

      <div className="sb-bot">
        <div className="sni" id="floatPlayerToggleBtn" onClick={toggleMini} style={navFloatBtn ? (miniOpen ? { color: 'var(--accent)' } : undefined) : { display: 'none' }}>
          <span className="sni-ico"><Ico name="pip" variant={miniOpen ? 'bold' : 'linear'} width={19} height={19} /></span>
          <span className="sni-lbl">{t('nav.mini')}</span>
        </div>
        <Sni p="settings" icon="settings" label={t('nav.settings')} active={false} onClick={openSettings} />
        <Sni p="account" label={profileName || t('nav.profile')} active={page === 'account'} onClick={() => goNav('account')}>
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
  iconSize = 21,
  label,
  onClick,
  children,
}: {
  p: PageId | 'settings'
  active: boolean
  /** Если задан — Sni сам рисует иконку (linear, либо bold когда active). */
  icon?: IconName
  iconSize?: number
  /** Подпись вкладки — видна только в режиме «С подписями». */
  label?: string
  onClick: () => void
  children?: React.ReactNode
}) => (
  <div
    className={cn('sni', active && 'active')}
    data-p={p}
    onClick={onClick}
    style={p === 'home' ? { flexShrink: 0 } : undefined}
  >
    {/* `.sni-ico` — display:contents в обычном режиме (разметка не меняется),
        в режиме «С подписями» превращается в колонку фиксированной ширины. */}
    <span className="sni-ico">
      {icon ? (
        <Ico name={icon} variant={active ? 'bold' : 'linear'} width={iconSize} height={iconSize} />
      ) : (
        children
      )}
    </span>
    {label ? <span className="sni-lbl">{label}</span> : null}
  </div>
)
