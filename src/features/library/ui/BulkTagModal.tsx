import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '@entities/track'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useSelectionStore, useLibStore } from '../model'
import { compressCover, idbUpdateMeta } from '../lib'

export interface BulkTagModalProps {
  /** true = панель открыта. */
  open: boolean
  onClose: () => void
}

/**
 * Массовое редактирование тегов — боковая панель-drawer (`.spanel-*`), как
 * редактирование профиля. Каркас/тело/футер общие с TagEditor.
 *
 * Применяет к выделенным трекам (useSelectionStore.selected) одно из:
 *   - исполнитель (если поле непустое)
 *   - альбом (если поле непустое)
 *   - обложка для всех (если выбрана) — сжимается один раз через compressCover.
 * Пустые поля = «не менять». Сохранение: addTracks (merge by id)
 * + idbUpdateMeta для каждого трека (cover хранится в meta как data-URL).
 */
export const BulkTagModal = ({ open, onClose }: BulkTagModalProps) => {
  const t = useT()
  const count = useSelectionStore((s) => s.selected.size)
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  // Сброс полей + анимация открытия.
  useEffect(() => {
    if (!open) return
    setArtist('')
    setAlbum('')
    setCoverDataUrl(null)
    return runEnterAnimation(setOpening)
  }, [open])

  // Esc для закрытия.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleClose = () => {
    setOpening(false)
    setTimeout(() => onClose(), 300)
  }

  const onCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = ev.target?.result
      if (typeof data === 'string') setCoverDataUrl(data)
    }
    reader.readAsDataURL(f)
  }

  const onSave = async () => {
    const a = artist.trim()
    const al = album.trim()
    const selected = useSelectionStore.getState().selected
    const byId = new Map(useLibStore.getState().tracks.map((t) => [t.id, t]))

    // Обложку сжимаем один раз, а не на каждый трек (улучшение vs-loop).
    let compressedCover: string | null = null
    if (coverDataUrl) {
      try {
        compressedCover = await compressCover(coverDataUrl)
      } catch (e) {
        console.warn('compressCover failed', e)
        compressedCover = coverDataUrl
      }
    }

    const updated: Track[] = []
    selected.forEach((id) => {
      const t = byId.get(id)
      if (!t) return
      const next: Track = { ...t }
      if (a) next.artist = a
      if (al) next.album = al
      if (compressedCover) next.cover = compressedCover
      updated.push(next)
    })

    if (updated.length) {
      useLibStore.getState().addTracks(updated)
      for (const t of updated) {
        try {
          await idbUpdateMeta(t)
        } catch (e) {
          console.warn('idbUpdateMeta failed', e)
        }
      }
    }

    toast(t('lib.bulk.toast.updated', { n: updated.length }))
    useSelectionStore.getState().clear()
    handleClose()
  }

  if (!open) return null

  return createPortal(
    <div
      className={`spanel-backdrop${opening ? ' open' : ''}`}
      id="bulkTagOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="spanel">
        {/* HERO: обложка-для-всех (клик = выбрать) + заголовок + кол-во треков */}
        <div className="spanel-hero">
          <label className="spanel-cover" id="bulkCoverPreview">
            {coverDataUrl ? (
              <img src={coverDataUrl} alt="" />
            ) : (
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.3 }}>
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            )}
            <div className="spanel-cover-cam">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onCoverChange} />
          </label>
          <div className="spanel-hero-name">{t('lib.bulk.title')}</div>
          <div className="spanel-hero-sub" id="bulkTagInfo">{t('lib.bulk.selected', { n: count })}</div>
        </div>

        <div className="pedit-body">
          <div className="pedit-card">
            <div className="pedit-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
              {t('lib.bulk.title')}
            </div>

            <div className="pedit-eg">
              <div className="pedit-bio-label" style={{ marginBottom: 0 }}>{t('lib.bulk.setArtist')}</div>
              <input
                className="pedit-nick-inp"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder={t('lib.bulk.placeholderKeep')}
                maxLength={200}
              />
            </div>

            <div className="pedit-eg">
              <div className="pedit-bio-label" style={{ marginBottom: 0 }}>{t('lib.bulk.setAlbum')}</div>
              <input
                className="pedit-nick-inp"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder={t('lib.bulk.placeholderKeep')}
                maxLength={200}
              />
            </div>
          </div>
        </div>

        <div className="pedit-foot">
          <button className="pedit-btn-cancel" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <button className="pedit-btn-save" onClick={() => void onSave()}>
            {t('common.apply')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
