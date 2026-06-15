import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '@entities/track'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useLibStore } from '../model'
import { compressCover, idbUpdateMeta } from '../lib'

export interface TagEditorProps {
  /** Track для редактирования; null = модалка закрыта. */
  track: Track | null
  onClose: () => void
}

/**
 * Модалка редактирования тегов трека `#tagEditorOverlay`
 *.
 *
 * Использует CSS: `.tag-editor-overlay`, `.tag-editor-modal`,
 * `.te-head/.te-body/.te-foot/.te-cover-* /.te-field/.te-input/.te-label/.te-title/.te-close`.
 *
 * Сохранение: обновляем меру в useLibStore.addTracks (merge by id) + idbUpdateMeta.
 * Если есть новая обложка — сжимаем через compressCover (300×300 JPEG 80%).
 *
 * Для треков из folder_watcher (без записи в IDB) idbUpdateMeta тихо вернёт —
 * меры обновляются только в runtime-сторе, persist отложен (folder-watcher
 * пере-присылает teги при следующем сканировании).
 */
export const TagEditor = ({ track, onClose }: TagEditorProps) => {
  const [name, setName] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [genres, setGenres] = useState('')
  const [year, setYear] = useState('')
  const [publisher, setPublisher] = useState('')
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  // Заполняем поля при открытии.
  useEffect(() => {
    if (!track) return
    setName(track.name || '')
    setArtist(track.artist || '')
    setAlbum(track.album || '')
    setGenres((track.genres || []).join(', '))
    setYear(track.year || '')
    setPublisher(track.publisher || '')
    setCoverDataUrl(null)
    // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
    return runEnterAnimation(setOpening)
  }, [track?.id])

  // Esc для закрытия.
  useEffect(() => {
    if (!track) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id])

  const handleClose = () => {
    setOpening(false)
    // Ждём анимацию закрытия (260ms) и зовём родителя.
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
    if (!track) return
    const updated: Track = {
      ...track,
      name: name.trim() || track.name,
      artist: artist.trim() || 'Неизвестный',
      album: album.trim(),
      genres: genres.trim()
        ? genres
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean)
        : [],
      year: year.trim(),
      publisher: publisher.trim(),
    }
    if (coverDataUrl) {
      try {
        const compressed = await compressCover(coverDataUrl)
        updated.cover = compressed
      } catch (e) {
        console.warn('compressCover failed', e)
        // Если сжатие сломалось — сохраняем (могут быть проблемы с размером).
        updated.cover = coverDataUrl
      }
    }
    useLibStore.getState().addTracks([updated])
    try {
      await idbUpdateMeta(updated)
    } catch (e) {
      console.warn('idbUpdateMeta failed', e)
    }
    handleClose()
  }

  if (!track) return null

  const coverSrc = coverDataUrl ?? track.cover ?? null

  return createPortal(
    <div
      className={`tag-editor-overlay${opening ? ' open' : ''}`}
      id="tagEditorOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="tag-editor-modal">
        <div className="te-head">
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
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Редактор тегов
          </div>
          <button className="te-close" onClick={handleClose} aria-label="Закрыть">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="te-body">
          <div className="te-cover-wrap">
            <label style={{ cursor: 'pointer' }}>
              <div className="te-cover" id="teCover">
                {coverSrc ? (
                  <img src={coverSrc} alt="" />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.3 }}>
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                )}
              </div>
              <div className="te-cover-overlay">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onCoverChange}
              />
            </label>
            <div style={{ fontSize: 9.5, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }}>
              Обложка
            </div>
          </div>

          <div className="te-fields">
            <Field label="Название">
              <input
                className="te-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название трека..."
                maxLength={200}
                autoFocus
              />
            </Field>
            <Field label="Исполнитель">
              <input
                className="te-input"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Имя исполнителя..."
                maxLength={200}
              />
            </Field>
            <Field label="Альбом">
              <input
                className="te-input"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Название альбома..."
                maxLength={200}
              />
            </Field>
            <Field
              label={
                <>
                  Жанры{' '}
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.6 }}>
                    (через запятую)
                  </span>
                </>
              }
            >
              <input
                className="te-input"
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                placeholder="Rock, Pop, Electronic..."
                maxLength={300}
              />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Год" style={{ flex: 1 }}>
                <input
                  className="te-input"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2024"
                  maxLength={4}
                  style={{ width: '100%' }}
                />
              </Field>
              <Field label="Паблишер" style={{ flex: 2 }}>
                <input
                  className="te-input"
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  placeholder="Лейбл / издатель..."
                  maxLength={200}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="te-foot">
          <button className="btn btg" onClick={handleClose}>
            Отмена
          </button>
          <button className="btn bta" onClick={() => void onSave()}>
            Сохранить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const Field = ({
  label,
  children,
  style,
}: {
  label: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) => (
  <div className="te-field" style={style}>
    <div className="te-label">{label}</div>
    {children}
  </div>
)
