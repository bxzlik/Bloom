import { useState, useRef } from 'react'
import { AddPopup } from '@features/player'
import { useT, useLocale } from '@shared/i18n'
import {
  useSelectionStore,
  useFavStore,
  usePlaylistStore,
  useLibStore,
} from '../model'
import { deleteUploadedTrack, getCurrentView } from '../lib'
import { BulkTagModal } from './BulkTagModal'

export interface SelBarProps {
  /** Не используется — viewTracks берутся из getCurrentView() в момент клика. */
}

/**
 * Bulk-операционная панель над tracklist'ом `.tr-sel-bar`
 *. Появляется когда selMode=true.
 *
 * Кнопки (контекстные к libMode):
 *   - Toggle select-all / deselect-all (чекбокс-иконка слева)
 *   - Count «Выбрано: N»
 *   - Теги (массовый редактор #bulkTagOverlay — BulkTagModal)
 *   - В плейлист — выбрать плейлист из меню
 *   - В любимые / Из любимого (зависит от libMode)
 *   - — Из плейлиста (только в mode='pl')
 *   - Удалить (треки которые загружались через handleFiles)
 *   - ✕ закрыть selection (clear)
 */
export const SelBar = (_: SelBarProps = {}) => {
  const t = useT()
  const locale = useLocale()
  const selMode = useSelectionStore((s) => s.selMode)
  const selected = useSelectionStore((s) => s.selected)
  const selectAll = useSelectionStore((s) => s.selectAll)
  const clear = useSelectionStore((s) => s.clear)
  // Подписываемся на tracks/playlists чтобы пересчитывать allSelected
  // (мы используем getCurrentView() для actuals, но нужен trigger при изменении).
  const tracksDep = useLibStore((s) => s.tracks)
  const searchDep = useLibStore((s) => s.searchQuery)
  void tracksDep
  void searchDep
  const viewTracks = getCurrentView().tracks

  const mode = useLibStore((s) => s.mode)
  const plId = useLibStore((s) => s.plId)
  const toggleFav = useFavStore((s) => s.toggleFav)
  // playlists подписка нужна для render-trigger; список идёт через AddPopup
  void usePlaylistStore((s) => s.playlists)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const removeTrackFromPl = usePlaylistStore((s) => s.removeTrackFromPl)

  const [addOpen, setAddOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement | null>(null)

  if (!selMode) return null

  const allSelected =
    viewTracks.length > 0 && viewTracks.every((t) => selected.has(t.id))

  const onSelAllToggle = () => {
    if (allSelected) clear()
    else selectAll(viewTracks.map((t) => t.id))
  }

  const onAddToFav = () => {
    const favs = useFavStore.getState().favs
    selected.forEach((id) => {
      if (!favs.has(id)) toggleFav(id)
    })
    clear()
  }
  const onRemoveFromFav = () => {
    const favs = useFavStore.getState().favs
    selected.forEach((id) => {
      if (favs.has(id)) toggleFav(id)
    })
    clear()
  }
  const onAddToPlaylist = (targetPlId: string) => {
    // addTrackToPl prepend'ит по одному — реверсим, чтобы батч лёг наверх
    // плейлиста в исходном порядке выделения.
    ;[...selected].reverse().forEach((id) => addTrackToPl(targetPlId, id))
    setAddOpen(false)
    clear()
  }
  const onRemoveFromPl = () => {
    if (!plId) return
    selected.forEach((id) => removeTrackFromPl(plId, id))
    clear()
  }
  const onDelete = () => {
    const n = selected.size
    const msg = locale === 'ru'
      ? `Удалить ${n} ${ru(n, ['трек', 'трека', 'треков'])}?`
      : `Delete ${n} ${n === 1 ? 'track' : 'tracks'}?`
    if (!confirm(msg)) return
    selected.forEach((id) => {
      void deleteUploadedTrack(id)
    })
    clear()
  }

  const inFav = mode === 'fav'
  const inPl = mode === 'pl' && !!plId

  return (
    <div className="tr-sel-bar" id="trSelBar">
      <button
        onClick={onSelAllToggle}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 3px 0 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text)',
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          {allSelected && <polyline points="7 12 11 16 17 8" />}
        </svg>
      </button>
      <span className="sb-count">{t('lib.sel.selectedCount', { n: selected.size })}</span>
      <div className="sb-sep" />

      {/* Теги — массовый редактор (#bulkTagOverlay) */}
      <button
        className="btn bta"
        onClick={() => setBulkOpen(true)}
        disabled={selected.size === 0}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
        {t('lib.sel.tags')}
      </button>
      <BulkTagModal open={bulkOpen} onClose={() => setBulkOpen(false)} />

      {/* В плейлист — использует общий AddPopup (открывается вверх) */}
      <button
        ref={addBtnRef}
        className="btn bta"
        onClick={(e) => {
          e.stopPropagation()
          setAddOpen((v) => !v)
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        {t('lib.ctx.toPlaylist')}
      </button>
      <AddPopup
        open={addOpen}
        onClose={() => setAddOpen(false)}
        anchorRef={addBtnRef}
        hasTrack={selected.size > 0}
        canAddToLib={false}
        onPickPlaylist={onAddToPlaylist}
      />

      {inFav ? (
        <button
          className="btn btg"
          style={{ color: '#e03030', borderColor: '#e03030' }}
          onClick={onRemoveFromFav}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#e03030" stroke="#e03030" strokeWidth={2}>
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>{' '}
          {t('lib.sel.unfav')}
        </button>
      ) : (
        <button className="btn bta" onClick={onAddToFav}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2}>
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>{' '}
          {t('lib.sel.fav')}
        </button>
      )}

      {/* sb-sep перед группой red-кнопок — всегда */}
      <div className="sb-sep" />
      {inPl && (
        <button
          className="btn btg"
          style={{ color: '#e03030', borderColor: '#e03030' }}
          onClick={onRemoveFromPl}
        >
          {t('lib.sel.removeFromPl')}
        </button>
      )}
      <button
        className="btn btg"
        style={{ color: '#e03030', borderColor: '#e03030' }}
        onClick={onDelete}
      >
        {t('common.delete')}
      </button>

      <button className="sb-close" onClick={clear}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────

const ru = (n: number, forms: [string, string, string]): string => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

