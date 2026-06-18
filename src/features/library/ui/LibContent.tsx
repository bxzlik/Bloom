import { useEffect, useRef, useState } from 'react'
import { useUiPrefsStore } from '@features/settings'
import { useT, useLocale, t as tFn } from '@shared/i18n'
import { useLibStore, usePlaylistStore, useFavStore } from '../model'
import type { LibMode, Playlist } from '../model'
import type { Track } from '@entities/track'
import {
  tracksAndDuration,
  recordsLabel,
  sumDurations,
  usePlayHistoryCount,
  handleFiles,
  getCurrentView,
} from '../lib'
import { playFromSource, playShuffledFromSource } from '@features/player'
import { LibTracklist } from './LibTracklist'
import { LibGridOverview } from './LibGridOverview'
import { PlMenu } from './PlMenu'
import { NewPlaylistModal } from './NewPlaylistModal'
import { AddFromLibModal } from './AddFromLibModal'
import { SelBar } from './SelBar'

/**
 * Правая часть библиотеки `.lib-content`.
 * Hero отображает иконку + имя + sub-line + кнопки действий.
 */
export const LibContent = () => {
  const t = useT()
  useLocale()
  const mode = useLibStore((s) => s.mode)
  const folderPath = useLibStore((s) => s.folderPath)
  const plId = useLibStore((s) => s.plId)
  const allTracks = useLibStore((s) => s.tracks)
  const totalTracks = allTracks.length
  const folderTracks = folderPath
    ? allTracks.filter((t) => t._folder === folderPath)
    : []
  const folderTracksCount = folderTracks.length
  const historyCount = usePlayHistoryCount()
  const activePlaylist = usePlaylistStore((s) =>
    plId ? s.playlists.find((p) => p.id === plId) : undefined,
  )
  const searchQuery = useLibStore((s) => s.searchQuery)
  const setSearchQuery = useLibStore((s) => s.setSearchQuery)
  const selectBuiltin = useLibStore((s) => s.selectBuiltin)
  const backToGrid = useLibStore((s) => s.backToGrid)

  // Grid-вид библиотеки: на «домашней» сетке (gridHome) показываем обзор-сетку
  // вместо hero+трек-лист; провалившись в раздел — показываем трек-лист + «назад».
  const libView = useUiPrefsStore((s) => s.libView)
  const gridHome = useLibStore((s) => s.gridHome)
  const overview = libView === 'grid' && gridHome

  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // plMenu state (только для mode='pl')
  const plMenuBtnRef = useRef<HTMLButtonElement>(null)
  const [plMenuOpen, setPlMenuOpen] = useState(false)
  const [editPlId, setEditPlId] = useState<string | null>(null)
  const [addToPlId, setAddToPlId] = useState<string | null>(null)

  // При смене раздела закрываем поиск.
  useEffect(() => {
    setSearchOpen(false)
  }, [mode, plId, folderPath])

  // При открытии — фокус на input.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchQuery('')
      setSearchOpen(false)
    } else {
      setSearchOpen(true)
    }
  }

  const favs = useFavStore((s) => s.favs)
  // Резолвед-кол-во (видимые любимые), а не favs.size — иначе hero «Любимые»
  // показывал бы «висячие» лайки удалённых треков. Согласовано с видом и сайдбаром.
  const favCount = allTracks.filter((t) => favs.has(t.id)).length

  const { heroName, heroSub, heroIconClass, heroCover, HeroIcon } = heroFor(mode, {
    totalTracks,
    favCount,
    historyCount,
    folderPath,
    folderTracksCount,
    playlist: activePlaylist,
    allTracks,
    favs,
    folderTracks,
  })

  return (
    <div className="lib-content">
      {overview ? (
        <LibGridOverview />
      ) : (
      <>
      <div className="lib-content-head">
        <div className="lib-content-hero">
          <div
            className={`lib-hero-icon ${heroIconClass}`}
            id="libHeroIcon"
            style={{
              position: 'relative',
              cursor: 'default',
              ...(heroCover
                ? {
                    background: `center / cover no-repeat url(${heroCover})`,
                  }
                : mode === 'history'
                  ? { background: 'rgba(255,180,0,.15)' }
                  : {}),
            }}
          >
            {!heroCover && <HeroIcon />}
          </div>
          {!searchOpen && (
            <div style={{ flex: 1, minWidth: 0 }} id="libHeroNameWrap">
              <div className="lib-hero-name" id="libHeroName">
                {heroName}
              </div>
              {activePlaylist?.desc ? (
                <div className="lib-hero-desc" id="libHeroDesc">
                  {activePlaylist.desc}
                </div>
              ) : (
                <div className="lib-hero-desc" id="libHeroDesc" style={{ display: 'none' }} />
              )}
              <div className="lib-hero-sub" id="libHeroSub">
                {heroSub}
              </div>
            </div>
          )}
          {/* Inline-поиск `libInlineSearch` */}
          {searchOpen && (
            <div
              id="libInlineSearch"
              style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'center' }}
            >
              <div className="lib-isp-wrap">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  style={{ flexShrink: 0, opacity: 0.4 }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  id="libInlineSearchInp"
                  className="lib-isp-inp"
                  placeholder={t('lib.searchInPlaylist')}
                  autoComplete="off"
                  spellCheck={false}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchQuery('')
                      setSearchOpen(false)
                    }
                  }}
                />
              </div>
            </div>
          )}
          <div className="lib-hero-btns">
            {/* «Назад к сетке» — только в grid-виде, когда провалились в раздел. */}
            {libView === 'grid' && (
              <button
                className="btn-icon"
                id="libBackToGrid"
                onClick={backToGrid}
              >
                <svg
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <button
              className="btn-play-all"
              onClick={() => {
                const view = getCurrentView()
                if (!view.tracks.length) return
                playFromSource(view.tracks.map((t) => t.id), view.source)
              }}
            >
              <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
              </svg>
              {t('lib.playAll')}
            </button>
            <button
              className="btn-icon"
              onClick={() => {
                const view = getCurrentView()
                if (!view.tracks.length) return
                playShuffledFromSource(view.tracks.map((t) => t.id), view.source)
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" strokeLinecap="round" />
                <path d="m18 2 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2" strokeLinecap="round" />
                <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8" strokeLinecap="round" />
                <path d="m18 14 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <label
              id="libUploadBtn"
              className="btn-icon"
              style={{
                display: mode === 'all' ? 'flex' : 'none',
                cursor: 'pointer',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <input
                type="file"
                accept="audio/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files)
                  e.target.value = '' // сбрасываем чтобы можно было выбрать тот же файл снова
                }}
              />
            </label>
            <button
              className="btn-icon"
              id="libInlineSearchBtn"
              onClick={toggleSearch}
              style={
                searchOpen
                  ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                  : undefined
              }
            >
              {searchOpen ? (
                <svg
                  id="libInlineSearchBtnIcon"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  viewBox="0 0 24 24"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg
                  id="libInlineSearchBtnIcon"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )}
            </button>
            <button
              ref={plMenuBtnRef}
              className="btn-icon"
              id="plMenuBtn"
              onClick={(e) => {
                e.stopPropagation()
                setPlMenuOpen((v) => !v)
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <LibTracklist />
      {/* SelBar — снизу `insertBefore(bar, list.nextSibling)`. */}
      <SelBar />
      </>
      )}

      <PlMenu
        open={plMenuOpen}
        onClose={() => setPlMenuOpen(false)}
        anchorRef={plMenuBtnRef}
        mode={mode}
        heroName={heroName}
        heroSub={heroSub}
        playlist={activePlaylist ?? null}
        folderPath={folderPath}
        onReset={() => selectBuiltin('all')}
        onEdit={(id) => setEditPlId(id)}
        onAddTracks={(id) => setAddToPlId(id)}
      />
      <NewPlaylistModal
        open={editPlId !== null}
        onClose={() => setEditPlId(null)}
        editPlaylistId={editPlId}
      />
      <AddFromLibModal
        open={addToPlId !== null}
        onClose={() => setAddToPlId(null)}
        playlistId={addToPlId}
      />
    </div>
  )
}

// ── Hero конфигурация для каждого режима ──────────────────────────────

interface HeroCounts {
  totalTracks: number
  favCount: number
  historyCount: number
  folderPath: string | null
  folderTracksCount: number
  playlist?: Playlist
  allTracks: Track[]
  favs: Map<string, number>
  folderTracks: Track[]
}

const folderName = (path: string): string => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

interface HeroResult {
  heroName: string
  heroSub: string
  heroIconClass: string
  HeroIcon: () => React.JSX.Element
  /** Если есть — рендерится как background обложки вместо HeroIcon. */
  heroCover?: string
}

const heroFor = (mode: LibMode, c: HeroCounts): HeroResult => {
  switch (mode) {
    case 'fav': {
      const dur = sumDurations(
        c.allTracks.filter((t) => c.favs.has(t.id)).map((t) => t.dur),
      )
      return {
        heroName: tFn('lib.liked'),
        heroSub: tracksAndDuration(c.favCount, dur),
        heroIconClass: 'fav-icon',
        HeroIcon: HeartHeroIcon,
      }
    }
    case 'history':
      return {
        heroName: tFn('lib.history'),
        heroSub: recordsLabel(c.historyCount),
        heroIconClass: '',
        HeroIcon: HistoryHeroIcon,
      }
    case 'folder': {
      const dur = sumDurations(c.folderTracks.map((t) => t.dur))
      return {
        heroName: c.folderPath ? folderName(c.folderPath) : tFn('lib.folder'),
        heroSub: tracksAndDuration(c.folderTracksCount, dur),
        heroIconClass: 'off-icon',
        HeroIcon: NoteHeroIcon,
      }
    }
    case 'pl': {
      const pl = c.playlist
      const byId = new Map(c.allTracks.map((t) => [t.id, t]))
      const dur = pl ? sumDurations(pl.trs.map((id) => byId.get(id)?.dur)) : 0
      return {
        heroName: pl?.name ?? tFn('lib.playlist'),
        heroSub: tracksAndDuration(pl?.trs.length ?? 0, dur),
        heroIconClass: 'off-icon',
        HeroIcon: NoteHeroIcon,
        heroCover: pl?.cover,
      }
    }
    case 'all':
    default: {
      const dur = sumDurations(c.allTracks.map((t) => t.dur))
      return {
        heroName: tFn('lib.allTracks'),
        heroSub: tracksAndDuration(c.totalTracks, dur),
        heroIconClass: 'off-icon',
        HeroIcon: NoteHeroIcon,
      }
    }
  }
}

const NoteHeroIcon = () => (
  <svg
    width="44"
    height="44"
    viewBox="0 0 24 24"
    fill="none"
    stroke="rgba(255,255,255,0.7)"
    strokeWidth={1.5}
    strokeLinecap="round"
  >
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
)

const HeartHeroIcon = () => (
  <svg
    width="44"
    height="44"
    viewBox="0 0 24 24"
    fill="white"
    stroke="white"
    strokeWidth={1.5}
  >
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
  </svg>
)

const HistoryHeroIcon = () => (
  <svg
    width="44"
    height="44"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#ffb400"
    strokeWidth={1.5}
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)
