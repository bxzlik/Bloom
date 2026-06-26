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
import { Ico } from '@shared/ui/icons/solar'
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
        <Ico name={allSelected ? 'checkSquare' : 'square'} variant={allSelected ? 'bold' : 'linear'} width={16} height={16} />
      </button>
      <span className="sb-count">{t('lib.sel.selectedCount', { n: selected.size })}</span>
      <div className="sb-sep" />

      {/* Теги — массовый редактор (#bulkTagOverlay) */}
      <button
        className="btn bta"
        onClick={() => setBulkOpen(true)}
        disabled={selected.size === 0}
      >
        <Ico name="edit" width={11} height={11} />
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
        <Ico name="note" width={11} height={11} />
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
          <Ico name="heart" variant="bold" width={11} height={11} style={{ color: '#e03030' }} />{' '}
          {t('lib.sel.unfav')}
        </button>
      ) : (
        <button className="btn bta" onClick={onAddToFav}>
          <Ico name="heart" variant="bold" width={11} height={11} />{' '}
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
        <Ico name="close" width={13} height={13} />
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

