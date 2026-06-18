import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '@entities/track'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useSelectionStore, useLibStore } from '../model'
import { compressCover, idbUpdateMeta } from '../lib'

export interface BulkTagModalProps {
  /** true = модалка открыта. */
  open: boolean
  onClose: () => void
}

/**
 * Модалка массового редактирования тегов `#bulkTagOverlay`
 *.
 *
 * Использует CSS: `.bulk-tag-overlay`, `.bulk-tag-modal`, `.bt-head/.bt-body/
 * .bt-foot/.bt-info` + общие `.te-title/.te-close/.te-field/.te-label/.te-input/.te-cover`.
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
  const fileRef = useRef<HTMLInputElement | null>(null)

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
    setTimeout(() => onClose(), 260)
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
      className={`bulk-tag-overlay${opening ? ' open' : ''}`}
      id="bulkTagOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="bulk-tag-modal">
        <div className="bt-head">
          <div className="te-title">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              style={{ marginRight: 7, verticalAlign: 'middle' }}
            >
              <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
            {t('lib.bulk.title')}
          </div>
          <button className="te-close" onClick={handleClose} aria-label={t('common.close')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="bt-body">
          <div className="bt-info" id="bulkTagInfo">
            {t('lib.bulk.selected', { n: count })}
          </div>

          <div className="te-field">
            <div className="te-label">{t('lib.bulk.setArtist')}</div>
            <input
              className="te-input"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder={t('lib.bulk.placeholderKeep')}
              maxLength={200}
            />
          </div>

          <div className="te-field">
            <div className="te-label">{t('lib.bulk.setAlbum')}</div>
            <input
              className="te-input"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              placeholder={t('lib.bulk.placeholderKeep')}
              maxLength={200}
            />
          </div>

          <div className="te-field">
            <div className="te-label">{t('lib.bulk.setCover')}</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div
                className="te-cover"
                id="bulkCoverPreview"
                style={{ width: 44, height: 44, borderRadius: 'calc(var(--radius)*.5)' }}
              >
                {coverDataUrl ? (
                  <img
                    src={coverDataUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                  />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.3 }}>
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{t('lib.bulk.chooseCover')}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onCoverChange}
              />
            </label>
          </div>
        </div>

        <div className="bt-foot">
          <button className="btn btg" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <button className="btn bta" onClick={() => void onSave()}>
            {t('common.apply')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
