import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '@entities/track'
import { useThemeStore } from '@features/settings'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT } from '@shared/i18n'

/**
 * Модалка «Инфо о треке» — `#trackInfoOverlay` / `openTrackInfo`
 *. Использует `.ti-*` CSS.
 *
 * Hero: размытая обложка-фон + cover + name (+ explicit) + artist (avatar /
 * verified / ссылка) + credited. Body: сетка (Альбом / Год / Длительность /
 * Паблишер / Жанры) + описание с hover-попапом (#tiDescPopup) для длинного текста.
 *
 * Открытие/закрытие — модальная конвенция: класс `.open` (opacity .26s + scale
 * /translate .32s, см. [[project-modal-style]]). Unmount после transition.
 *
 * `--ti-r/g/b` ставим из текущего цвета блока (`--block-color`) —
 * (там из blockR/G/B настроек). Без них CSS падает на дефолт rgb(15,15,15).
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
  const [descPopup, setDescPopup] = useState<{ html: string; left: number; top: number } | null>(null)

  const open = track !== null

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    } else {
      setOpening(false)
      setDescPopup(null)
    }
  }, [open])

  // --ti-r/g/b из цвета блока (на :root, т.к. #tiDescPopup рендерится отдельно).
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
  const t = track
  const hasYear = !!t?.year
  const hasDur = !!(t?.dur && t.dur !== '—')
  const genres = t?.genres?.length ? t.genres : []
  const longDesc = !!t?.description && (t.description.length > 100 || t.description.split('\n').length > 2)

  const onDescEnter = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!t?.description || !longDesc) return
    const pw = 320, ph = 220
    let left = e.clientX + 14
    if (left + pw > window.innerWidth - 8) left = e.clientX - pw - 14
    let top = e.clientY + 14
    if (top + ph > window.innerHeight - 8) top = e.clientY - ph - 14
    setDescPopup({ html: parseDesc(t.description), left: Math.max(8, left), top: Math.max(8, top) })
  }

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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
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
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.3 }}>
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  </span>
                )}
              </div>
              {t?.creditedArtist && t.creditedArtist !== t.artist && (
                <div className="ti-credited" id="tiCredited">{t.creditedArtist}</div>
              )}
            </div>
          </div>
          <div className="ti-body">
            {(t?.album || hasYear || hasDur || t?.publisher || genres.length > 0) && (
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
              </div>
            )}
            {t?.description && (
              <div className="ti-desc-cell" id="tiDescRow">
                <div className="ti-lbl">{tr('lib.ti.description')}</div>
                <div
                  className="ti-desc"
                  id="tiDesc"
                  onMouseEnter={onDescEnter}
                  onMouseLeave={(e) => {
                    const rt = e.relatedTarget as Node | null
                    const popup = document.getElementById('tiDescPopup')
                    if (rt && popup?.contains(rt)) return
                    setDescPopup(null)
                  }}
                >
                  {t.description}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {descPopup && (
        <div
          id="tiDescPopup"
          style={{ display: 'block', left: descPopup.left, top: descPopup.top }}
          onMouseLeave={() => setDescPopup(null)}
          dangerouslySetInnerHTML={{ __html: descPopup.html }}
        />
      )}
    </>,
    document.body,
  )
}

/** Парс описания: URL → ссылки, остальное эскейпится. tiParseDesc. */
const parseDesc = (text: string): string => {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts
    .map((p, i) => {
      if (i % 2 === 1)
        return `<a href="${p.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a>`
      return p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    })
    .join('')
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return { r: 15, g: 15, b: 15 }
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) }
}
