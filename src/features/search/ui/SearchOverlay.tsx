import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { useT, useLocale, type TranslationKey } from '@shared/i18n'
import { useNavStore } from '@app/navigationStore'
import { useUiPrefsStore } from '@features/settings'
import type { Track } from '@entities/track'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import { useSearchStore, looksLikeUrl, type RecentItem } from '../model/store'
import { useSearchOverlayStore } from '../model/overlayStore'
import {
  openArtistFromSearch,
  openPlaylistFromSearch,
  playSearchTrack,
  openRecentItem,
} from '../lib/openActions'
import { IconSearch, IconClose, SourceDropdown, RecentKindIcon } from './SearchPage'

/** Строка списка оверлея: подсказка по выдаче либо элемент истории. */
type Row =
  | { key: string; kind: 'query' }
  | { key: string; kind: 'track'; track: Track }
  | { key: string; kind: 'artist'; artist: Artist }
  | { key: string; kind: 'playlist'; playlist: Playlist; album: boolean }
  | { key: string; kind: 'recentSearch'; q: string }
  | { key: string; kind: 'recentItem'; item: RecentItem }

/**
 * Всплывающий поиск (второй вид, `uiPrefs.searchView === 'overlay'`).
 *
 * Центральный оверлей поверх текущей страницы: та же строка ввода, что и на
 * `SearchPage` (`.sp-inp-wrap` + выбор источника), под ней — недавние запросы и
 * открытое, а при вводе — живые подсказки из общей выдачи (`useSearchStore`).
 *
 * Разделение ролей: оверлей — быстрый доступ (сыграть трек / открыть артиста),
 * Enter уводит на страницу поиска с полной выдачей, табами и фильтрами. Запрос и
 * результаты общие со страницей, поэтому переход не перезапрашивает то же самое.
 *
 * Клавиши: ↑/↓ — по строкам, Enter — активная строка либо переход на страницу,
 * Esc — закрыть.
 */
export const SearchOverlay = () => {
  const t = useT()
  useLocale()
  const open = useSearchOverlayStore((s) => s.open)
  const close = useSearchOverlayStore((s) => s.close)
  const toggle = useSearchOverlayStore((s) => s.toggle)
  const hotkeyOn = useUiPrefsStore((s) => s.searchHotkey)

  const query = useSearchStore((s) => s.query)
  const setQuery = useSearchStore((s) => s.setQuery)
  const runSearch = useSearchStore((s) => s.runSearch)
  const clear = useSearchStore((s) => s.clear)
  const results = useSearchStore((s) => s.results)
  const loading = useSearchStore((s) => s.loading)
  const searched = useSearchStore((s) => s.searched)
  const source = useSearchStore((s) => s.source)
  const setSource = useSearchStore((s) => s.setSource)
  const recentSearches = useSearchStore((s) => s.recentSearches)
  const recentItems = useSearchStore((s) => s.recentItems)
  const removeRecentItem = useSearchStore((s) => s.removeRecentItem)
  const removeRecentSearch = useSearchStore((s) => s.removeRecentSearch)
  const goNav = useNavStore((s) => s.goNav)

  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState(-1)
  usePopupOpenAnimation(panelRef, open)

  const hasQuery = query.trim().length > 0

  // Фокус в поле сразу после открытия (rAF — панель уже в DOM и не перебивает
  // фокус собственной open-анимацией).
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  // Ctrl+T — показать/скрыть всплывающий поиск. Локальный capture-хендлер на
  // документе (как удержание Tab у QuickWheel), а не глобальный Tauri-шорткат:
  // работает только когда окно в фокусе. Ось независимая от вида поиска: хоткей
  // открывает всплывающий ввод и когда клик по вкладке ведёт на страницу.
  useEffect(() => {
    if (!hotkeyOn) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || e.code !== 'KeyT') return
      e.preventDefault()
      toggle()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [hotkeyOn, toggle])

  // Esc закрывает оверлей независимо от того, где фокус (в поле его ловит
  // onKeyDown, но после клика по строке фокус может быть уже не там).
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Курсор сбрасываем на каждый новый запрос/открытие — иначе он «висит» на
  // строке, которой в новом списке уже нет.
  useEffect(() => setCursor(-1), [open, query])

  // Ведём скролл списка за курсором: строки ниже видимой области сами не
  // подтягиваются, и клавишами доходишь «в никуда» (приходилось крутить колесом).
  // `block:'nearest'` не дёргает список, пока строка и так видна.
  useEffect(() => {
    if (cursor < 0) return
    const row = listRef.current?.children[cursor]
    row?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  // Debounce живых подсказок — как на странице: ссылка резолвится дольше.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const onChange = (v: string) => {
    setQuery(v)
    clearTimeout(timer.current)
    if (!v.trim()) {
      clear()
      return
    }
    timer.current = setTimeout(() => void runSearch(v), looksLikeUrl(v.trim()) ? 800 : 350)
  }

  /** Enter без выбранной строки: полная выдача на странице поиска. */
  const goToPage = () => {
    const q = query.trim()
    if (!q) return
    clearTimeout(timer.current)
    void runSearch(q)
    goNav('search')
    close()
  }

  /* ── Строки списка ── */
  const { artists, playlists, albums, tracks } = results
  // Подсказки: артисты сверху (самое точное совпадение), затем треки, затем
  // плейлисты/альбомы — до 9 строк, чтобы панель не превращалась в страницу.
  const suggestRows: Row[] = hasQuery
    ? [
        { key: 'q', kind: 'query' as const },
        ...artists.slice(0, 2).map((a) => ({ key: `a:${a.id}`, kind: 'artist' as const, artist: a })),
        ...tracks.slice(0, 5).map((tr) => ({ key: `t:${tr.id}`, kind: 'track' as const, track: tr })),
        ...playlists.slice(0, 1).map((p) => ({ key: `p:${p.id}`, kind: 'playlist' as const, playlist: p, album: false })),
        ...albums.slice(0, 1).map((p) => ({ key: `al:${p.id}`, kind: 'playlist' as const, playlist: p, album: true })),
      ]
    : []
  // Пустой ввод — объединённая история (запросы + открытое) по убыванию времени.
  const historyRows: Row[] = hasQuery
    ? []
    : [
        ...recentSearches.map((s) => ({ ts: s.ts, row: { key: `rs:${s.q}`, kind: 'recentSearch' as const, q: s.q } })),
        ...recentItems.map((it) => ({ ts: it.ts ?? 0, row: { key: `ri:${it.id}`, kind: 'recentItem' as const, item: it } })),
      ]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 10)
        .map((x) => x.row)
  const rows = hasQuery ? suggestRows : historyRows

  const activate = (r: Row) => {
    switch (r.kind) {
      case 'query':
        goToPage()
        return
      case 'track':
        playSearchTrack(r.track)
        break
      case 'artist':
        openArtistFromSearch(r.artist)
        break
      case 'playlist':
        openPlaylistFromSearch(r.playlist, r.album ? 'album' : 'playlist')
        break
      case 'recentSearch':
        // Недавний запрос применяем прямо в оверлее — панель остаётся открытой
        // с подсказками по нему.
        setQuery(r.q)
        void runSearch(r.q)
        return
      case 'recentItem':
        openRecentItem(r.item)
        break
    }
    close()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return
      e.preventDefault()
      setCursor((c) => {
        const next = e.key === 'ArrowDown' ? c + 1 : c - 1
        return next < -1 ? rows.length - 1 : next >= rows.length ? -1 : next
      })
      return
    }
    if (e.key === 'Enter') {
      clearTimeout(timer.current)
      const row = cursor >= 0 ? rows[cursor] : null
      if (row) activate(row)
      else goToPage()
    }
  }

  if (!open) return null

  const showEmpty = hasQuery && !loading && searched && rows.length === 1 // только строка «искать»

  return createPortal(
    <div
      className="sov-back"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="sov-panel" ref={panelRef}>
        <div className="sp-inp-wrap sov-inp">
          <IconSearch />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="sov-clear" aria-label={t('common.clear')} onClick={() => { clear(); inputRef.current?.focus() }}>
              <IconClose />
            </button>
          )}
          <SourceDropdown source={source} onSource={setSource} />
        </div>

        {(rows.length > 0 || loading || showEmpty) && (
          <div className="sov-list" ref={listRef}>
            {rows.map((r, i) => (
              <SovRow
                key={r.key}
                active={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => activate(r)}
                {...rowContent(r.kind === 'query' ? { kind: 'query', text: query.trim() } : r, t)}
                onRemove={
                  r.kind === 'recentSearch'
                    ? () => removeRecentSearch(r.q)
                    : r.kind === 'recentItem'
                      ? () => removeRecentItem(r.item.id)
                      : undefined
                }
              />
            ))}
            {loading && <div className="sov-note">{t('search.ov.loading')}</div>}
            {showEmpty && !loading && <div className="sov-note">{t('search.ov.empty')}</div>}
          </div>
        )}

        <div className="sov-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('search.ov.hintNav')}</span>
          <span><kbd>Enter</kbd> {t('search.ov.hintEnter')}</span>
          <span><kbd>Esc</kbd> {t('search.ov.hintEsc')}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ── Строка списка ── */
type RowContent = { icon: ReactNode; round?: boolean; title: string; sub?: string }

/** Разметка одной строки: обложка/иконка, название, подпись, крестик удаления. */
const SovRow = ({
  icon,
  round,
  title,
  sub,
  active,
  onClick,
  onMouseEnter,
  onRemove,
}: RowContent & {
  active: boolean
  onClick: () => void
  onMouseEnter: () => void
  onRemove?: () => void
}) => (
  <div className={`sov-row${active ? ' active' : ''}`} onClick={onClick} onMouseEnter={onMouseEnter}>
    <span className="sov-ico" style={round ? { borderRadius: '50%' } : undefined}>{icon}</span>
    <span className="sov-txt">
      <span className="sov-title">{title}</span>
      {sub && <span className="sov-sub">{sub}</span>}
    </span>
    {onRemove && (
      <button
        className="sov-del"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <IconClose />
      </button>
    )}
  </div>
)

/** Содержимое строки по её типу (иконка/обложка + подписи). */
const rowContent = (
  r: Exclude<Row, { kind: 'query' }> | { kind: 'query'; text: string },
  t: (k: TranslationKey, p?: Record<string, string | number>) => string,
): RowContent => {
  // Тип сущности («Трек»/«Артист»/…) — ключи `search.kind.*` совпадают с kind.
  const kindLabel = (kind: string) => t(`search.kind.${kind}` as TranslationKey)
  switch (r.kind) {
    case 'query':
      return { icon: <IconSearch />, title: r.text, sub: t('search.ov.openPage') }
    case 'track':
      return {
        icon: r.track.cover ? <img src={r.track.cover} alt="" /> : <RecentKindIcon kind="track" />,
        title: r.track.name,
        sub: `${r.track.artist} · ${kindLabel('track')}`,
      }
    case 'artist':
      return {
        icon: r.artist.avatar ? <img src={r.artist.avatar} alt="" /> : <RecentKindIcon kind="artist" />,
        round: true,
        title: r.artist.name,
        sub: kindLabel('artist'),
      }
    case 'playlist':
      return {
        icon: r.playlist.cover ? <img src={r.playlist.cover} alt="" /> : <RecentKindIcon kind="playlist" />,
        title: r.playlist.title,
        sub: [r.playlist.ownerName, kindLabel(r.album ? 'album' : 'playlist')].filter(Boolean).join(' · '),
      }
    case 'recentSearch':
      return { icon: <IconSearch />, title: r.q }
    case 'recentItem':
      return {
        icon: r.item.cover ? <img src={r.item.cover} alt="" /> : <RecentKindIcon kind={r.item.kind} />,
        round: r.item.round,
        title: r.item.title,
        sub: [r.item.author, kindLabel(r.item.kind)].filter(Boolean).join(' · '),
      }
  }
}
