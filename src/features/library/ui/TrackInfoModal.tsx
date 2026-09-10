import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '@entities/track'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT } from '@shared/i18n'
import { ExpandDesc, PathLine, EmptyCover } from '@shared/ui'
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
 * Открытие/закрытие — как у модалки «Статистика» (`.smodal`): подложка гаснет
 * за .22s, сама карточка выезжает из-за кромки окна за .42s. Демонтаж поэтому
 * по таймеру (ANIM_MS), а не по transitionEnd подложки — тот приходил бы на
 * середине выезда. Поверхность и рамки — общие токены приложения, своего цвета
 * по обложке у модалки больше нет.
 */

// Длительность slide-out (.ti-modal transform .42s) перед демонтажем.
const ANIM_MS = 440

export const TrackInfoModal = ({
  track,
  onClose,
}: {
  track: Track | null
  onClose: () => void
}) => {
  const tr = useT()
  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const [shownTrack, setShownTrack] = useState<Track | null>(null)
  const closeTimer = useRef<number | null>(null)

  const open = track !== null

  // Кешируем последний непустой track, чтобы во время exit-анимации (track уже
  // null, но модалка ещё в DOM) контент не схлопывался в «—» / плейсхолдер.
  useEffect(() => {
    if (track) setShownTrack(track)
  }, [track])

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation);
  // на закрытии — отложенный демонтаж под slide-out.
  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
    closeTimer.current = window.setTimeout(() => {
      setMounted(false)
      closeTimer.current = null
    }, ANIM_MS)
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
    }
  }, [open])

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
      >
        <div className="ti-modal" id="tiModal">
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
                <EmptyCover />
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
          <div className="ti-foot">
            <button className="stats-tool-btn" onClick={onClose}>
              <Ico name="arrowLeft" width={13} height={13} />
              {tr('common.back')}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
