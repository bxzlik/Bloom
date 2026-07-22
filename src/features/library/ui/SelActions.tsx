import { useState, useRef } from 'react'
import { AddPopup, addTracksToQueue, playTracksNext, playFromSource } from '@features/player'
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

/**
 * Bulk-операции над выделенными треками — живут прямо в шапке `.lib-hero-btns`,
 * подменяя собой обычный ряд («Играть все» / shuffle / поиск / карандаш / «…»)
 * пока активен selMode. Отдельной нижней панели больше нет.
 *
 * Кнопки в стиле шапки: акцентная капсула-счётчик (она же select-all/deselect-all)
 * + иконочные `.btn-icon`:
 *   - Теги (массовый редактор — BulkTagModal)
 *   - В плейлист (AddPopup)
 *   - В любимые / Из любимого (toggle: красное сердце = всё выделенное залайкано)
 *   - — Из плейлиста (только в mode='pl')
 *   - Удалить (треки которые загружались через handleFiles)
 *   - ✕ выход из режима
 */
export const SelActions = () => {
  const t = useT()
  const locale = useLocale()
  const selected = useSelectionStore((s) => s.selected)
  const selectAll = useSelectionStore((s) => s.selectAll)
  const deselect = useSelectionStore((s) => s.deselect)
  const clear = useSelectionStore((s) => s.clear)
  // Подписываемся на tracks/searchQuery чтобы пересчитывать allSelected
  // (мы используем getCurrentView() для actuals, но нужен trigger при изменении).
  const tracksDep = useLibStore((s) => s.tracks)
  const searchDep = useLibStore((s) => s.searchQuery)
  void tracksDep
  void searchDep
  const viewTracks = getCurrentView().tracks

  const mode = useLibStore((s) => s.mode)
  const plId = useLibStore((s) => s.plId)
  // Подписка на favs (а не getState) — сердце должно перекрашиваться сразу,
  // как только выделение стало целиком залайканным.
  const favs = useFavStore((s) => s.favs)
  const setFav = useFavStore((s) => s.setFav)
  // playlists подписка нужна для render-trigger; список идёт через AddPopup
  void usePlaylistStore((s) => s.playlists)
  const addTrackToPl = usePlaylistStore((s) => s.addTrackToPl)
  const removeTrackFromPl = usePlaylistStore((s) => s.removeTrackFromPl)

  const [addOpen, setAddOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement | null>(null)

  const empty = selected.size === 0
  const allSelected =
    viewTracks.length > 0 && viewTracks.every((t) => selected.has(t.id))

  const onSelAllToggle = () => {
    if (allSelected) deselect()
    else selectAll(viewTracks.map((t) => t.id))
  }

  // Сердце — toggle, а не «добавить»: если всё выделенное уже в любимых,
  // кнопка красная и снимает лайк (в любом разделе, не только в «Любимых»).
  const selIds = [...selected]
  const allFav = selIds.length > 0 && selIds.every((id) => favs.has(id))
  const onFavToggle = () => {
    selIds.forEach((id) => setFav(id, !allFav))
    deselect()
  }
  const onAddToPlaylist = (targetPlId: string) => {
    // addTrackToPl prepend'ит по одному — реверсим, чтобы батч лёг наверх
    // плейлиста в исходном порядке выделения.
    ;[...selected].reverse().forEach((id) => addTrackToPl(targetPlId, id))
    setAddOpen(false)
    deselect()
  }
  // Выделенное — в очередь (в конец / сразу после текущего). Порядок берём по
  // текущему виду, а не по порядку кликов (Set хранит порядок вставки), чтобы
  // треки легли как в списке.
  const selIdsInViewOrder = (): string[] =>
    getCurrentView().tracks.filter((tr) => selected.has(tr.id)).map((tr) => tr.id)
  // Играть только выделенное: очередь = выделенные треки, ярлык источника
  // оставляем от текущего вида (плейлист/папка), чтобы пилюля не сбрасывалась.
  const onPlaySel = () => {
    const ids = selIdsInViewOrder()
    if (!ids.length) return
    playFromSource(ids, getCurrentView().source)
    deselect()
  }
  const onToQueue = () => {
    const ids = selIdsInViewOrder()
    if (!ids.length) return
    addTracksToQueue(ids, getCurrentView().source)
    deselect()
  }
  const onPlayNext = () => {
    const ids = selIdsInViewOrder()
    if (!ids.length) return
    playTracksNext(ids, getCurrentView().source)
    deselect()
  }
  const onRemoveFromPl = () => {
    if (!plId) return
    selected.forEach((id) => removeTrackFromPl(plId, id))
    deselect()
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
    deselect()
  }

  const inPl = mode === 'pl' && !!plId

  return (
    <>
      {/* Капсула на месте «Играть все»: счётчик + select-all/deselect-all */}
      <button
        key="sel-count"
        className="btn-play-all btn-sel-count"
        onClick={onSelAllToggle}
        disabled={viewTracks.length === 0}
      >
        <Ico
          name={allSelected ? 'checkSquare' : 'square'}
          variant={allSelected ? 'bold' : 'linear'}
          width={15}
          height={15}
        />
        {t('lib.sel.selectedCount', { n: selected.size })}
      </button>

      {/* Воспроизведение выделенного — отдельной капсулой, сразу за счётчиком
          (в обычном ряду шапки на этом месте тоже «играть»). */}
      <div key="sel-play" className="lib-btn-group">
        <button
          className="btn-icon"
          aria-label={t('player.aria.play')}
          disabled={empty}
          onClick={onPlaySel}
        >
          <Ico name="play" width={13} height={13} />
        </button>

        <button
          className="btn-icon"
          aria-label={t('lib.ctx.toQueue')}
          disabled={empty}
          onClick={onToQueue}
        >
          <Ico name="addQueue" width={14} height={14} />
        </button>

        <button
          className="btn-icon"
          aria-label={t('lib.plmenu.playNext')}
          disabled={empty}
          onClick={onPlayNext}
        >
          <Ico name="playNext" width={13} height={13} />
        </button>
      </div>

      {/* Операции над выделением — одной капсулой, выход — отдельной (как в
          обычном ряду шапки и на странице артиста). */}
      <div key="sel-ops" className="lib-btn-group">
        {/* Теги — массовый редактор (#bulkTagOverlay) */}
        <button
          className="btn-icon"
          aria-label={t('lib.sel.tags')}
          onClick={() => setBulkOpen(true)}
          disabled={empty}
        >
          {/* Карандаш — тот же, что «Редактировать плейлист» и «Редактировать теги» в ctx-меню */}
          <Ico name="edit" width={14} height={14} />
        </button>

        {/* В плейлист — общий AddPopup (сам переворачивается вниз от шапки) */}
        <button
          ref={addBtnRef}
          className="btn-icon"
          aria-label={t('lib.ctx.toPlaylist')}
          disabled={empty}
          onClick={(e) => {
            e.stopPropagation()
            setAddOpen((v) => !v)
          }}
        >
          <Ico name="add" width={14} height={14} />
        </button>

        <button
          className={allFav ? 'btn-icon is-danger' : 'btn-icon'}
          aria-label={allFav ? t('lib.sel.unfav') : t('lib.sel.fav')}
          disabled={empty}
          onClick={onFavToggle}
        >
          <Ico name="heart" width={14} height={14} />
        </button>

        {inPl && (
          <button
            className="btn-icon is-danger"
            aria-label={t('lib.sel.removeFromPl')}
            disabled={empty}
            onClick={onRemoveFromPl}
          >
            <Ico name="minus" width={14} height={14} />
          </button>
        )}
        <button
          className="btn-icon is-danger"
          aria-label={t('common.delete')}
          disabled={empty}
          onClick={onDelete}
        >
          <Ico name="trash" width={14} height={14} />
        </button>
      </div>

      <div key="sel-exit" className="lib-btn-group">
        <button
          className="btn-icon"
          aria-label={t('lib.sel.exit')}
          onClick={clear}
        >
          <Ico name="close" width={14} height={14} />
        </button>
      </div>

      <BulkTagModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <AddPopup
        open={addOpen}
        onClose={() => setAddOpen(false)}
        anchorRef={addBtnRef}
        hasTrack={!empty}
        canAddToLib={false}
        onPickPlaylist={onAddToPlaylist}
      />
    </>
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
