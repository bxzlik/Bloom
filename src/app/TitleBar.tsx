import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useDetailStore } from '@features/search'
import { useUiPrefsStore, UpdateButton } from '@features/settings'
import { useNavStore, type PageId } from './navigationStore'
import { NotifBell } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'
import { useT, useLocale, t as tt } from '@shared/i18n'

/** Ключ метки тайтлбара: страница ИЛИ открытая детальная сущность. */
type LabelKey = PageId | 'artist' | 'album' | 'playlist'

/**
 * Кастомный titlebar (`#winTitlebar`).
 * Стилизация — через shared/styles/soundcloud-system.css (#winTitlebar, .win-icon, .win-title,
 * #winTitleCenter, .win-btns, .win-btn, .win-close, .win-minimize,
 * .win-maxrestore). Tailwind НЕ используется.
 */
export const TitleBar = () => {
  const t = useT()
  useLocale()
  const page = useNavStore((s) => s.page)
  // На странице поиска при открытом детальном виде метка = тип сущности
  // ( _updateTitlebarLabel('search','artist'|'album'|'playlist')).
  const detailKind = useDetailStore((s) => s.stack[s.stack.length - 1]?.kind ?? null)
  const titlebarLabel = useUiPrefsStore((s) => s.titlebarLabel)
  const tbLogo = useUiPrefsStore((s) => s.tbLogo)
  const tbVersion = useUiPrefsStore((s) => s.tbVersion)
  const tbMin = useUiPrefsStore((s) => s.tbMin)
  const tbMax = useUiPrefsStore((s) => s.tbMax)
  const tbPin = useUiPrefsStore((s) => s.tbPin)
  const tbBell = useUiPrefsStore((s) => s.tbBell)
  const tbClose = useUiPrefsStore((s) => s.tbClose)
  const tbPinned = useUiPrefsStore((s) => s.tbPinned)
  const setPref = useUiPrefsStore((s) => s.set)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const win = getCurrentWindow()
    win.isMaximized().then(setMaximized).catch(() => {})
    const unlistenPromise = win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => {})
    })
    return () => {
      unlistenPromise.then((u) => u()).catch(() => {})
    }
  }, [])

  const onMin = () => getCurrentWindow().minimize()
  const onMaxRestore = () => getCurrentWindow().toggleMaximize()
  const onClose = () => getCurrentWindow().close()
  // Закрепление окна поверх остальных — стор сам применяет always-on-top и
  // persist'ит состояние (применяется и на следующем запуске).
  const onTogglePin = () => setPref('tbPinned', !tbPinned)

  // Детальный вид — глобальный оверлей (может быть открыт на любой странице),
  // поэтому метка артиста/альбома/плейлиста показывается независимо от page.
  const key: LabelKey = detailKind ?? page
  const label = pageLabel(key)
  const Icon = pageIcon(key)

  return (
    <div id="winTitlebar" data-tauri-drag-region>
      {tbLogo && <span className="win-icon" />}
      <span className="win-title" id="winTitleText">
        Bloom
      </span>
      {tbVersion && <span className="win-ver">v{__APP_VERSION__}</span>}
      <div id="winTitleCenter" style={titlebarLabel ? undefined : { display: 'none' }}>
        <Icon />
        <span id="wtcLabel" className="wtc-label">
          {label}
        </span>
      </div>
      <div className="win-btns">
        <UpdateButton />
        {tbBell && <NotifBell />}
        {tbPin && (
          <button
            className={`win-btn win-pin${tbPinned ? ' on' : ''}`}
            id="winPinBtn"
            onClick={onTogglePin}
            aria-label={tbPinned ? t('titlebar.unpinWin') : t('titlebar.pinWin')}
            aria-pressed={tbPinned}
          >
            {/* Канцелярская кнопка (pin) */}
            <Ico name="pin" width={12} height={12} />
          </button>
        )}
        {tbMin && (
          <button
            className="win-btn win-minimize"
            id="winMinBtn"
            onClick={onMin}
            aria-label={t('titlebar.min')}
          >
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect width="10" height="1" fill="currentColor" />
            </svg>
          </button>
        )}
        {tbMax && (
          <button
            className="win-btn win-maxrestore"
            id="winMaxBtn"
            onClick={onMaxRestore}
            aria-label={maximized ? t('titlebar.restore') : t('titlebar.max')}
          >
            {maximized ? (
              // Restore icon — (__bloomSetMaximized): квадрат + L-подложка.
              <svg id="winMaxIcon" width="10" height="10" viewBox="0 0 10 10">
                <path d="M3 3h6v6H3zM5 1h6v6" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
              </svg>
            ) : (
              <svg id="winMaxIcon" width="10" height="10" viewBox="0 0 10 10">
                <rect x=".5" y=".5" width="9" height="9" rx="1" fill="none" stroke="currentColor" />
              </svg>
            )}
          </button>
        )}
        {tbClose && (
          <button className="win-btn win-close" onClick={onClose} aria-label={t('common.close')}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth={1.2} />
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth={1.2} />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Маппинг page → label/icon ──

const pageLabel = (key: LabelKey): string => {
  switch (key) {
    case 'home':
      return tt('nav.home')
    case 'player':
      return tt('settings.nav.player')
    case 'lib':
      return tt('nav.library')
    case 'search':
      return tt('nav.search')
    case 'account':
      return tt('search.profile')
    case 'artist':
      return tt('search.kind.artist')
    case 'album':
      return tt('search.kind.album')
    case 'playlist':
      return tt('search.kind.playlist')
  }
}

const pageIcon = (key: LabelKey) => {
  switch (key) {
    case 'home':
      return HomeIcon
    case 'player':
      return PlayerIcon
    case 'lib':
      return LibIcon
    case 'search':
      return SearchIcon
    case 'account':
      return AccountIcon
    case 'artist':
      return ArtistIcon
    case 'album':
      return AlbumIcon
    case 'playlist':
      return PlaylistIcon
  }
}

// Иконки метки тайтлбара (Solar) — наследуют размер/цвет через класс wtc-icon.
const HomeIcon = () => <Ico name="home" className="wtc-icon" />
const PlayerIcon = () => <Ico name="play" className="wtc-icon" />
const LibIcon = () => <Ico name="library" className="wtc-icon" />
const SearchIcon = () => <Ico name="search" className="wtc-icon" />
const AccountIcon = () => <Ico name="user" className="wtc-icon" />
const ArtistIcon = () => <Ico name="user" className="wtc-icon" />
const AlbumIcon = () => <Ico name="vinyl" className="wtc-icon" />
const PlaylistIcon = () => <Ico name="list" className="wtc-icon" />
