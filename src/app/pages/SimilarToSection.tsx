import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { useT } from '@shared/i18n'
import { playSingleTrack, PlayStateOverlay } from '@features/player'
import { extractCoverHsl, useUiPrefsStore } from '@features/settings'
import { useYmAuthStore } from '@features/yandex'
import { useDetailStore } from '@features/search'
import {
  buildSimilarTo,
  onSimilarToReset,
  readSimilarToCache,
  writeSimilarToCache,
  type SimilarSeed,
  type SimilarTo,
} from '@features/library'
import { ArtistLinks, CoverSourceBadge, type Track } from '@entities/track'
import type { Artist } from '@entities/artist'
import { CardMarquee, EmptyCover } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Витрина «Похожие на X» на главной: слева плитка сида (артист или трек из
 * топа), справа полоса похожих — треки и артисты вперемешку.
 *
 * Подбор целиком в `features/library/lib/similarTo` — здесь только показ.
 * Поведение как у «Для вас»: пока данных нет, секции нет вовсе; витрина живёт
 * сутки; провайдеры регистрируются позже первого кадра, отсюда тик и тихие
 * повторы (подробно — в шапке ForYouSection).
 */
const RETRY_MS = [1500, 4000]

type Hsl = { h: number; s: number; l: number }

/** Доминанта обложки → тёмный фон плитки; та же формула, что у ReleaseCard. */
const tileTint = (hsl: Hsl): string => {
  const s = Math.round(Math.min(0.55, hsl.s * 0.8) * 100)
  const l = Math.round(Math.max(0.13, Math.min(0.24, hsl.l * 0.5)) * 100)
  return `hsl(${Math.round(hsl.h)} ${s}% ${l}%)`
}

/**
 * Тот же оттенок для имени сида в заголовке. Тон плитки тёмный — текстом на
 * тёмной странице он не читается, поэтому оттенок держим, а светлоту задаём
 * свою: светлую для тёмной темы, тёмную для светлой (выбор — в home.css).
 * Серую обложку не раскрашиваем: у неё оттенок случайный, вышел бы красный.
 */
const inkTone = (hsl: Hsl, light: number): string => {
  const s = hsl.s < 0.12 ? hsl.s : Math.max(0.35, Math.min(0.8, hsl.s))
  return `hsl(${Math.round(hsl.h)} ${Math.round(s * 100)}% ${light}%)`
}

/**
 * Тона секции по URL обложки сида — плитка и заголовок берут их из CSS-
 * переменных на корне секции. Кеш живёт до перезапуска: скан обложки может
 * уйти за байтами в Rust, а главная перемонтируется на каждый заход.
 */
const tonesCache = new Map<string, CSSProperties>()

const useSeedTones = (cover: string | null): CSSProperties | undefined => {
  const [tones, setTones] = useState<CSSProperties | undefined>(() => (cover ? tonesCache.get(cover) : undefined))
  useEffect(() => {
    if (!cover) {
      setTones(undefined)
      return
    }
    const hit = tonesCache.get(cover)
    if (hit) {
      setTones(hit)
      return
    }
    let dead = false
    void extractCoverHsl(cover).then((hsl) => {
      if (!hsl) return
      const v = {
        '--sim-tint': tileTint(hsl),
        '--sim-ink': inkTone(hsl, 72),
        '--sim-ink-light': inkTone(hsl, 34),
      } as CSSProperties
      tonesCache.set(cover, v)
      if (!dead) setTones(v)
    })
    return () => {
      dead = true
    }
  }, [cover])
  return tones
}

const openArtist = (providerId: string, id: string, title: string, cover: string | null): void => {
  useDetailStore.getState().open({ kind: 'artist', providerId, id, title, cover, round: true })
}

/** Клик по сиду — плитка или имя в заголовке: артист открывает страницу, трек играет. */
const openSeed = (seed: SimilarSeed): void => {
  if (seed.kind === 'artist') openArtist(seed.providerId, seed.id, seed.name, seed.cover)
  else if (seed.track) playSingleTrack(seed.track.id)
}

/** Трек-сид без самого трека (не нашёлся после рестарта) играть нечем. */
const seedClickable = (seed: SimilarSeed): boolean => seed.kind === 'artist' || !!seed.track

/** Плитка сида. Тон (--sim-tint) приходит с корня секции, см. useSeedTones. */
const SeedTile = ({ seed }: { seed: SimilarSeed }) => {
  const t = useT()
  return (
    <div className={`sim-seed is-${seed.kind}`} onClick={() => openSeed(seed)}>
      <div className="sim-seed-cov">
        {seed.cover ? <img src={seed.cover} alt="" draggable={false} /> : <EmptyCover />}
      </div>
      {/* «Похожие на» — в заголовке секции; здесь только сам сид. */}
      <div className="sim-seed-txt">
        <div className="sim-seed-name">{seed.name}</div>
        <div className="sim-seed-sub">{seed.kind === 'artist' ? t('home.similar.artist') : seed.artist}</div>
      </div>
    </div>
  )
}

const TrackTile = ({ tr, onTrackCtx }: { tr: Track; onTrackCtx: (e: ReactMouseEvent, t: Track) => void }) => (
  <div className="home-card mqh" onClick={() => playSingleTrack(tr.id)} onContextMenu={(e) => onTrackCtx(e, tr)}>
    <div className="hc-cover">
      {tr.cover ? <img src={tr.cover} alt="" /> : <EmptyCover />}
      <CoverSourceBadge track={tr} size={24} />
      <div className="hc-play-overlay">
        <div className="hc-play-btn">
          <Ico name="play" width="100%" height="100%" style={{ color: 'var(--accent)', marginLeft: 2 }} />
        </div>
      </div>
      <PlayStateOverlay trackId={tr.id} size="card" />
    </div>
    <CardMarquee className="hc-name">{tr.name}</CardMarquee>
    <CardMarquee className="hc-artist">
      <ArtistLinks
        artist={tr.artist}
        scId={tr.artistScId}
        permalink={tr.artistPermalink}
        artistId={tr.artistId}
        provider={tr.artistProvider}
      />
    </CardMarquee>
  </div>
)

/**
 * Артист в полосе: та же геометрия, что у трека, только круг — низ ряда ровный.
 * Ховер как у артистов в поиске (.sp-artist-card): общий наезд из
 * overrides-main.css + плёнка со стрелкой «открыть» вместо «играть».
 */
const ArtistTile = ({ artist, providerId }: { artist: Artist; providerId: string }) => {
  const t = useT()
  return (
    <div
      className="home-card sim-art mqh"
      onClick={() => openArtist(providerId, artist.id, artist.name, artist.avatar ?? null)}
    >
      <div className="hc-cover">
        {artist.avatar ? <img src={artist.avatar} alt="" draggable={false} /> : <EmptyCover />}
        <div className="hc-play-overlay">
          <div className="hc-play-btn">
            <Ico name="arrowRightStraight" width="100%" height="100%" style={{ color: 'var(--accent)' }} />
          </div>
        </div>
      </div>
      <CardMarquee className="hc-name">{artist.name}</CardMarquee>
      <CardMarquee className="hc-artist">{t('home.similar.artist')}</CardMarquee>
    </div>
  )
}

export const SimilarToSection = ({
  active,
  onTrackCtx,
}: {
  active: boolean
  onTrackCtx: (e: ReactMouseEvent, t: Track) => void
}) => {
  const t = useT()
  const show = useUiPrefsStore((s) => s.homeSimilar)
  const [data, setData] = useState<SimilarTo | null>(() => readSimilarToCache())
  const doneRef = useRef(false)
  const inFlight = useRef(false)

  useEffect(
    () =>
      onSimilarToReset(() => {
        doneRef.current = false
        setData(null)
      }),
    [],
  )

  const ymAuthed = useYmAuthStore((s) => s.authed)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setTick((n) => n + 1), 0)
    return () => clearTimeout(id)
  }, [active, ymAuthed])

  useEffect(() => {
    if (!show || !active || doneRef.current || inFlight.current) return
    if (data?.items.length) return
    inFlight.current = true
    let alive = true
    let timer = 0
    const attempt = (n: number): void => {
      buildSimilarTo()
        .then((res) => {
          if (!alive) return
          if (res?.items.length) {
            doneRef.current = true
            writeSimilarToCache(res)
            setData(res)
            inFlight.current = false
            return
          }
          if (n < RETRY_MS.length) {
            timer = window.setTimeout(() => attempt(n + 1), RETRY_MS[n])
            return
          }
          inFlight.current = false
        })
        .catch(() => {
          inFlight.current = false
        })
    }
    attempt(0)
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      inFlight.current = false
    }
  }, [show, active, tick, data])

  // До раннего return: хук не может зависеть от того, есть ли данные.
  const tones = useSeedTones(data?.seed.cover ?? null)

  if (!show || !data?.items.length) return null

  return (
    <div className="home-section home-disc" style={tones}>
      <div className="home-section-hdr">
        <span className="sim-hdr-lbl">{t('home.similarTo')}</span>
        <button
          type="button"
          className="sim-hdr-name"
          disabled={!seedClickable(data.seed)}
          onClick={() => openSeed(data.seed)}
        >
          {data.seed.name}
        </button>
      </div>
      <div className="sim-row">
        <SeedTile seed={data.seed} />
        <div className="home-cards sim-cards">
          {data.items.map((it) =>
            it.kind === 'track' ? (
              <TrackTile key={it.track.id} tr={it.track} onTrackCtx={onTrackCtx} />
            ) : (
              <ArtistTile key={it.artist.id} artist={it.artist} providerId={it.providerId} />
            ),
          )}
        </div>
      </div>
    </div>
  )
}
