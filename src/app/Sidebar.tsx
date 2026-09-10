import { useState } from 'react'
import { cn } from '@shared/lib/cn'
import { useTauriEvent } from '@shared/hooks'
import { useT } from '@shared/i18n'
import { Ico, type IconName } from '@shared/ui/icons/solar'
import { SidebarAvatar, useProfileStore } from '@features/profile'
import { openMiniplayer, closeMiniplayer } from '@features/player'
import { useUiPrefsStore } from '@features/settings'
import { useDetailStore, useDetailOpen } from '@features/search'
// Прямой импорт store (НЕ barrel @features/library) — по той же причине, что и
// в navigationStore: barrel тянет ./ui и замыкает цикл импортов.
import { useLibStore } from '@features/library/model/store'
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
  // Знак Bloom вместо иконки «Главная» — маска по /logo.png, красится currentColor
  // (тот же приём, что у `.win-icon` в тайтлбаре), поэтому hover/active работают как у иконок.
  const navHomeLogo = useUiPrefsStore((s) => s.navHomeLogo)
  const profileName = useProfileStore((s) => s.name)

  // Открыт ли детальный вид (артист/альбом/плейлист) на текущей странице.
  const detailOpen = useDetailOpen()
  const closeDetail = useDetailStore((s) => s.close)
  /**
   * Клик по вкладке: обычный переход, а повторный клик по УЖЕ активной вкладке
   * работает как «выход» — закрывает детальный вид (артист/альбом/плейлист)
   * этой страницы, а в библиотеке дополнительно возвращает к обзору-сетке.
   */
  const nav = (p: PageId) => {
    if (page !== p) {
      goNav(p)
      return
    }
    if (detailOpen) {
      closeDetail()
      return
    }
    if (p === 'lib') useLibStore.getState().backToGrid()
  }
  // Клик по вкладке «Поиск» всегда ведёт на страницу; всплывающий ввод — только Ctrl+T.
  const onSearchClick = () => nav('search')

  // Тоггл PiP-окна: первый клик показывает окно, повторный — закрывает
  // (в Rust и в API оно по-прежнему `miniplayer` — переименована только подпись)
  //. Флаг синхронизируем с событием
  // `bloom-mp-closed` — на случай закрытия мини его собственным крестиком.
  const [miniOpen, setMiniOpen] = useState(false)
  useTauriEvent('bloom-mp-closed', () => setMiniOpen(false))
  // PiP открывают и мимо этого тоггла — кнопкой в попапе трея.
  useTauriEvent('bloom-mp-opened', () => setMiniOpen(true))
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
      <Sni
        p="home"
        icon={navHomeLogo ? undefined : 'home'}
        label={t('nav.home')}
        active={page === 'home'}
        onClick={() => nav('home')}
      >
        <span className="sni-logo" />
      </Sni>

      <div className="sb-sep" />

      <div className="sb-nav">
        <Sni p="player" icon="play" label={t('nav.player')} active={page === 'player'} onClick={() => nav('player')} />
        <Sni p="lib" icon="library" label={t('nav.library')} active={page === 'lib'} onClick={() => nav('lib')} />
        <Sni p="search" icon="search" iconSize={20} label={t('nav.search')} active={page === 'search'} onClick={onSearchClick} />
      </div>

      <div className="sb-sep" />

      <div className="sb-bot">
        <div className="sni" id="floatPlayerToggleBtn" onClick={toggleMini} style={navFloatBtn ? (miniOpen ? { color: 'var(--accent)' } : undefined) : { display: 'none' }}>
          <span className="sni-ico"><Ico name="pip" variant={miniOpen ? 'bold' : 'linear'} width={19} height={19} /></span>
          <span className="sni-lbl">{t('nav.mini')}</span>
        </div>
        <Sni p="settings" icon="settings" label={t('nav.settings')} active={false} onClick={openSettings} />
        <Sni p="account" label={profileName || t('nav.profile')} active={page === 'account'} onClick={() => nav('account')}>
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
