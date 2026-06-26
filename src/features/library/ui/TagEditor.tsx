import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '@entities/track'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT } from '@shared/i18n'
import { useLibStore, useTagEditStore } from '../model'
import { Ico } from '@shared/ui/icons/solar'
import { compressCover, idbUpdateMeta } from '../lib'

export interface TagEditorProps {
  /** Track для редактирования; null = панель закрыта. */
  track: Track | null
  onClose: () => void
}

/**
 * Редактор тегов трека — боковая панель-drawer (`.spanel-backdrop`/`.spanel`),
 * выезжает справа, как редактирование профиля. Каркас/тело/футер переиспользуют
 * общие классы `.spanel-*` (modals.css) и `.pedit-*`.
 *
 * Сохранение: обновляем меру в useLibStore.addTracks (merge by id) + idbUpdateMeta.
 * Если есть новая обложка — сжимаем через compressCover (300×300 JPEG 80%).
 *
 * Для треков из folder_watcher (без записи в IDB) idbUpdateMeta тихо вернёт —
 * меры обновляются только в runtime-сторе, persist отложен (folder-watcher
 * пере-присылает теги при следующем сканировании).
 */
export const TagEditor = ({ track, onClose }: TagEditorProps) => {
  const t = useT()
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
    // Ждём анимацию закрытия и зовём родителя (он обнулит track → демонтаж).
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
    if (!track) return
    const updated: Track = {
      ...track,
      name: name.trim() || track.name,
      artist: artist.trim() || t('common.unknownArtist'),
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
      className={`spanel-backdrop${opening ? ' open' : ''}`}
      id="tagEditorOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="spanel">
        {/* HERO: крупная обложка по центру + название + подпись */}
        <div className="spanel-hero">
          <label className="spanel-cover">
            {coverSrc ? (
              <img src={coverSrc} alt="" />
            ) : (
              <Ico name="note" width={34} height={34} style={{ opacity: 0.3 }} />
            )}
            <div className="spanel-cover-cam">
              <Ico name="camera" width={20} height={20} />
            </div>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onCoverChange} />
          </label>
          <div className={`spanel-hero-name${name.trim() ? '' : ' empty'}`}>
            {name.trim() || t('lib.tag.titlePlaceholder')}
          </div>
          <div className="spanel-hero-sub">{t('lib.tag.editorTitle')}</div>
        </div>

        <div className="pedit-body">
          <div className="pedit-card">
            <div className="pedit-card-title">
              <Ico name="edit" width={14} height={14} />
              {t('lib.tag.editorTitle')}
            </div>

            <Field label={t('lib.tag.title')}>
              <input
                className="pedit-nick-inp"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('lib.tag.titlePlaceholder')}
                maxLength={200}
                autoFocus
              />
            </Field>
            <Field label={t('lib.tag.artist')}>
              <input
                className="pedit-nick-inp"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder={t('lib.tag.artistPlaceholder')}
                maxLength={200}
              />
            </Field>
            <Field label={t('lib.ti.album')}>
              <input
                className="pedit-nick-inp"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder={t('lib.tag.albumPlaceholder')}
                maxLength={200}
              />
            </Field>
            <Field
              label={
                <>
                  {t('lib.ti.genres')}{' '}
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.6 }}>
                    {t('lib.tag.genresHint')}
                  </span>
                </>
              }
            >
              <input
                className="pedit-nick-inp"
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                placeholder="Rock, Pop, Electronic..."
                maxLength={300}
              />
            </Field>
            <div className="spanel-row">
              <Field label={t('lib.ti.year')} style={{ flex: 1 }}>
                <input
                  className="pedit-nick-inp"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2024"
                  maxLength={4}
                />
              </Field>
              <Field label={t('lib.ti.publisher')} style={{ flex: 2 }}>
                <input
                  className="pedit-nick-inp"
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  placeholder={t('lib.tag.publisherPlaceholder')}
                  maxLength={200}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="pedit-foot">
          <button className="pedit-btn-cancel" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <button className="pedit-btn-save" onClick={() => void onSave()}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Единый хост редактора тегов, управляемый глобальным стором `useTagEditStore`.
 * Монтируется один раз в App — переживает закрытие BigPicture и других окон.
 */
export const TagEditorHost = () => {
  const track = useTagEditStore((s) => s.track)
  const close = useTagEditStore((s) => s.close)
  return <TagEditor track={track} onClose={close} />
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
  <div className="pedit-eg" style={style}>
    <div className="pedit-bio-label" style={{ marginBottom: 0 }}>{label}</div>
    {children}
  </div>
)
