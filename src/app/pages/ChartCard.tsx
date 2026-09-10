import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { useT } from '@shared/i18n'
import { playSingleTrack, PlayStateOverlay, useQueueStore } from '@features/player'
import { extractCoverHsl } from '@features/settings'
import { ArtistLinks, ChartTrend, type Track } from '@entities/track'
import { CardMarquee, EmptyCover } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Карточка чарта для витрины на главной: обложка, цифра позиции внахлёст слева
 * и плашка «название · артист · play» снизу — тон плашки берётся из доминанты
 * обложки, как у [ReleaseCard]. Топ-3 — сплошная белая цифра, дальше контурная.
 *
 * Геометрия — ручки `--ch-w` / `--ch-rank` / `--ch-overlap` в `.ch-row` (home.css).
 */

/** Доминанта обложки → тёмный фон плашки (тот же коридор, что у релизов). */
const tileTint = (hsl: { h: number; s: number; l: number }): string => {
  const s = Math.round(Math.min(0.55, hsl.s * 0.8) * 100)
  const l = Math.round(Math.max(0.13, Math.min(0.24, hsl.l * 0.5)) * 100)
  return `hsl(${Math.round(hsl.h)} ${s}% ${l}%)`
}

/** Кеш тонов по URL обложки: витрина перемонтируется на каждый заход на главную. */
const tintCache = new Map<string, string>()

export const ChartCard = ({
  track,
  pos,
  onCtxMenu,
}: {
  track: Track
  /** Место в чарте (1-based) — цифра на карточке. */
  pos: number
  onCtxMenu: (e: ReactMouseEvent, t: Track) => void
}) => {
  const t = useT()
  // Резолв стрима показываем спиннером в кнопке play, а не плёнкой на обложке.
  const loading = useQueueStore((s) => s.loadingId === track.id)
  const [tint, setTint] = useState<string | null>(() => (track.cover ? tintCache.get(track.cover) ?? null : null))

  useEffect(() => {
    const cover = track.cover
    if (!cover || tintCache.has(cover)) return
    let dead = false
    void extractCoverHsl(cover).then((hsl) => {
      if (!hsl) return
      const c = tileTint(hsl)
      tintCache.set(cover, c)
      if (!dead) setTint(c)
    })
    return () => {
      dead = true
    }
  }, [track.cover])

  return (
    <div
      className={`ch-card mqh${pos <= 3 ? ' is-top' : ''}`}
      style={tint ? ({ '--ch-tint': tint } as CSSProperties) : undefined}
      onClick={() => playSingleTrack(track.id)}
      onContextMenu={(e) => onCtxMenu(e, track)}
    >
      <div className="ch-head">
        {/* Бейдж площадки не ставим: чарт целиком с одной площадки, а в углу
            обложки он спорит с бейджем динамики. */}
        <div className="ch-cover">
          {track.cover ? <img src={track.cover} alt="" draggable={false} /> : <EmptyCover />}
          <ChartTrend track={track} variant="chip" />
          {/* Плёнку резолва не показываем — вместо неё спиннер в кнопке play
              (тёмный прямоугольник поверх обложки читался как заплатка).
              Эквалайзер играющего трека остаётся. */}
          <PlayStateOverlay trackId={track.id} size="card" showLoading={false} />
        </div>
        {/* Цифра — сестра обложки, а не её потомок: обложка режет по overflow. */}
        <div className="ch-rank">{pos}</div>
      </div>

      <div className="ch-tile">
        <div className="ch-meta">
          <CardMarquee className="ch-title">{track.name}</CardMarquee>
          <CardMarquee className="ch-artist">
            <ArtistLinks
              artist={track.artist}
              scId={track.artistScId}
              permalink={track.artistPermalink}
              artistId={track.artistId}
              provider={track.artistProvider}
            />
          </CardMarquee>
        </div>
        <button
          type="button"
          className={`ch-play${loading ? ' is-busy' : ''}`}
          aria-label={t('player.aria.play')}
          onClick={(e) => {
            e.stopPropagation()
            playSingleTrack(track.id)
          }}
        >
          {loading ? (
            <div className="sc-spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0 }} />
          ) : (
            <Ico name="play" variant="bold" size={14} />
          )}
        </button>
      </div>
    </div>
  )
}
