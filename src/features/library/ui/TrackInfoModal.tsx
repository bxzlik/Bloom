import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '@entities/track'
import { useThemeStore } from '@features/settings'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT } from '@shared/i18n'
import { ExpandDesc, PathLine } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Модалка «Инфо о треке» — `#trackInfoOverlay` / `openTrackInfo`
 *. Использует `.ti-*` CSS.
 *
 * Hero: размытая обложка-фон + cover + name (+ explicit) + artist (avatar /
 * verified / ссылка) + credited. Body: сетка (Альбом / Год / Длительность /
 * Паблишер / Жанры) + описание, которое по клику разворачивается попапом,
 * если не влезло в две строки (shared/ui/ExpandDesc).
 *
 * Открытие/закрытие — модальная конвенция: класс `.open` (opacity .26s + scale
 * /translate .32s, см. [[project-modal-style]]). Unmount после transition.
 *
 * `--ti-r/g/b` ставим из текущего цвета блока (`--block-color`) —
 * (там из blockR/G/B настроек). Без них CSS падает на дефолт rgb(15,15,15).
 * На :root, а не на модалке, т.к. .ti-overlay — не предок всех потребителей.
 */
export const TrackInfoModal = ({
  track,
  onClose,
}: {
  track: Track | null
  onClose: () => void
}) => {
  const tr = useT()
  const blockColor = useThemeStore((s) => s.blockColor)
  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const [shownTrack, setShownTrack] = useState<Track | null>(null)

  const open = track !== null

  // Кешируем последний непустой track, чтобы во время exit-анимации (track уже
  // null, но модалка ещё в DOM) контент не схлопывался в «—» / плейсхолдер.
  useEffect(() => {
    if (track) setShownTrack(track)
  }, [track])

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    } else {
      setOpening(false)
    }
  }, [open])

  // --ti-r/g/b из цвета блока.
  useEffect(() => {
    if (!mounted) return
    const { r, g, b } = hexToRgb(blockColor)
    const root = document.documentElement
    root.style.setProperty('--ti-r', String(r))
    root.style.setProperty('--ti-g', String(g))
    root.style.setProperty('--ti-b', String(b))
  }, [mounted, blockColor])

  // Esc → закрыть.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  // Берём последний непустой track (чтобы во время exit-анимации не мигало «—»).
  const t = track ?? shownTrack
  const hasYear = !!t?.year
  const hasDur = !!(t?.dur && t.dur !== '—')
  const genres = t?.genres?.length ? t.genres : []

  return createPortal(
    <>
      <div
        className={`ti-overlay${opening ? ' open' : ''}`}
        id="trackInfoOverlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
        onTransitionEnd={(e) => {
          if (!open && e.target === e.currentTarget) setMounted(false)
        }}
      >
        <div className="ti-modal" id="tiModal">
          <div className="ti-head">
            <button className="ti-close" onClick={onClose} aria-label={tr('common.close')}>
              <Ico name="close" width={12} height={12} />
            </button>
          </div>
          <div className="ti-hero">
            <div
              className="ti-hero-bg"
              id="tiHeroBg"
              style={t?.cover ? { backgroundImage: `url('${t.cover}')` } : undefined}
            />
            <div className="ti-hero-grad" />
            <div className="ti-cover" id="tiCover">
              {t?.cover ? (
                <img src={t.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Ico name="note" width={24} height={24} style={{ opacity: 0.3 }} />
              )}
            </div>
            <div className="ti-hero-info">
              <div className="ti-name-row">
                <div className="ti-name" id="tiName">{t?.name || '—'}</div>
                {t?.explicit && <span className="ti-explicit" id="tiExplicit">E</span>}
              </div>
              <div className="ti-artist-row">
                {t?.artistAvatar && (
                  <img className="ti-artist-ava" id="tiArtistAva" src={t.artistAvatar} alt="" />
                )}
                <a
                  className="ti-artist-link"
                  id="tiArtist"
                  {...(t?.artistPermalink
                    ? { href: t.artistPermalink, target: '_blank', rel: 'noopener' }
                    : {})}
                >
                  {t?.artist || '—'}
                </a>
                {t?.artistVerified && (
                  <span className="ti-verified" id="tiVerified">
                    <Ico name="check" variant="bold" width={12} height={12} />
                  </span>
                )}
              </div>
              {t?.creditedArtist && t.creditedArtist !== t.artist && (
                <div className="ti-credited" id="tiCredited">{t.creditedArtist}</div>
              )}
            </div>
          </div>
          <div className="ti-body">
            {(t?.album || hasYear || hasDur || t?.publisher || genres.length > 0 || t?._localPath || t?._folder) && (
              <div className="ti-grid" id="tiGrid">
                {t?.album && (
                  <div className="ti-cell full">
                    <div className="ti-lbl">{tr('lib.ti.album')}</div>
                    <div className="ti-val muted">{t.album}</div>
                  </div>
                )}
                {hasYear && hasDur ? (
                  <>
                    <div className="ti-cell">
                      <div className="ti-lbl">{tr('lib.ti.year')}</div>
                      <div className="ti-val muted">{t!.year}</div>
                    </div>
                    <div className="ti-cell">
                      <div className="ti-lbl">{tr('lib.ti.duration')}</div>
                      <div className="ti-val muted">{t!.dur}</div>
                    </div>
                  </>
                ) : hasYear ? (
                  <div className="ti-cell full">
                    <div className="ti-lbl">{tr('lib.ti.year')}</div>
                    <div className="ti-val muted">{t!.year}</div>
                  </div>
                ) : hasDur ? (
                  <div className="ti-cell full">
                    <div className="ti-lbl">{tr('lib.ti.duration')}</div>
                    <div className="ti-val muted">{t!.dur}</div>
                  </div>
                ) : null}
                {t?.publisher && (
                  <div className="ti-cell full">
                    <div className="ti-lbl">{tr('lib.ti.publisher')}</div>
                    <div className="ti-val muted">{t.publisher}</div>
                  </div>
                )}
                {genres.length > 0 && (
                  <div className="ti-cell full">
                    <div className="ti-lbl">{tr('lib.ti.genres')}</div>
                    <div className="ti-genres">
                      {genres.map((g, i) => (
                        <span className="ti-genre-tag" key={`${g}-${i}`}>{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Треки площадок путей не имеют — ячейки только у локальных.
                    У папочного трека показываем обе: папку-источник и сам файл. */}
                {t?._folder && (
                  <div className="ti-cell full">
                    <div className="ti-lbl">{tr('lib.ti.folderPath')}</div>
                    <PathLine className="ti-val muted" path={t._folder} kind="folder" />
                  </div>
                )}
                {t?._localPath && (
                  <div className="ti-cell full">
                    <div className="ti-lbl">{tr('lib.ti.file')}</div>
                    <PathLine className="ti-val muted" path={t._localPath} kind="file" />
                  </div>
                )}
              </div>
            )}
            {t?.description && (
              <div className="ti-desc-cell" id="tiDescRow">
                <div className="ti-lbl">{tr('lib.ti.description')}</div>
                <ExpandDesc className="ti-desc" id="tiDesc" text={t.description} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return { r: 15, g: 15, b: 15 }
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) }
}
