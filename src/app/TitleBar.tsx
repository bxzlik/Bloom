import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useDetailStore } from '@features/search'
import { useUiPrefsStore } from '@features/settings'
import { useNavStore, type PageId } from './navigationStore'

/** Ключ метки тайтлбара: страница ИЛИ открытая детальная сущность. */
type LabelKey = PageId | 'artist' | 'album' | 'playlist'

/**
 * Кастомный titlebar (`#winTitlebar`).
 * Стилизация — через shared/styles/soundcloud-system.css (#winTitlebar, .win-icon, .win-title,
 * #winTitleCenter, .win-btns, .win-btn, .win-close, .win-minimize,
 * .win-maxrestore). Tailwind НЕ используется.
 */
export const TitleBar = () => {
  const page = useNavStore((s) => s.page)
  // На странице поиска при открытом детальном виде метка = тип сущности
  // ( _updateTitlebarLabel('search','artist'|'album'|'playlist')).
  const detailKind = useDetailStore((s) => s.stack[s.stack.length - 1]?.kind ?? null)
  const titlebarLabel = useUiPrefsStore((s) => s.titlebarLabel)
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

  // Детальный вид — глобальный оверлей (может быть открыт на любой странице),
  // поэтому метка артиста/альбома/плейлиста показывается независимо от page.
  const key: LabelKey = detailKind ?? page
  const label = pageLabel(key)
  const Icon = pageIcon(key)

  return (
    <div id="winTitlebar" data-tauri-drag-region>
      <span className="win-icon" />
      <span className="win-title" id="winTitleText">
        Bloom
      </span>
      <div id="winTitleCenter" style={titlebarLabel ? undefined : { display: 'none' }}>
        <Icon />
        <span id="wtcLabel" className="wtc-label">
          {label}
        </span>
      </div>
      <div className="win-btns">
        <button
          className="win-btn win-minimize"
          id="winMinBtn"
          onClick={onMin}
          aria-label="Свернуть"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="win-btn win-maxrestore"
          id="winMaxBtn"
          onClick={onMaxRestore}
          aria-label={maximized ? 'Восстановить' : 'Развернуть'}
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
        <button className="win-btn win-close" onClick={onClose} aria-label="Закрыть">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth={1.2} />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth={1.2} />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Маппинг page → label/icon ──

const pageLabel = (key: LabelKey): string => {
  switch (key) {
    case 'home':
      return 'Главная'
    case 'player':
      return 'Плеер'
    case 'lib':
      return 'Библиотека'
    case 'search':
      return 'Поиск'
    case 'account':
      return 'Профиль'
    case 'artist':
      return 'Артист'
    case 'album':
      return 'Альбом'
    case 'playlist':
      return 'Плейлист'
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

// Иконки со старых wtcIcon (stroke 1.8, viewBox 24).
const baseIconProps = {
  className: 'wtc-icon',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  viewBox: '0 0 24 24',
} as const

const HomeIcon = () => (
  <svg {...baseIconProps}>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const PlayerIcon = () => (
  <svg className="wtc-icon" fill="currentColor" viewBox="0 0 24 24">
    <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
  </svg>
)

const LibIcon = () => (
  <svg {...baseIconProps}>
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
)

const SearchIcon = () => (
  <svg {...baseIconProps}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const AccountIcon = () => (
  <svg {...baseIconProps}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a7 7 0 0114 0v1" />
  </svg>
)

// Детальные сущности — иконки со старых _updateTitlebarLabel svgs.
const ArtistIcon = () => (
  <svg {...baseIconProps}>
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const AlbumIcon = () => (
  <svg {...baseIconProps}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const PlaylistIcon = () => (
  <svg {...baseIconProps}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <polyline points="3 6 4 7 6 5" />
    <polyline points="3 12 4 13 6 11" />
    <polyline points="3 18 4 19 6 17" />
  </svg>
)
