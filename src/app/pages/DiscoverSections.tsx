import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@shared/i18n'
import { getProviders, type NewReleases } from '@features/providers'
import { playSingleTrack, PlayStateOverlay } from '@features/player'
import { useDetailStore } from '@features/search'
import { useYmAuthStore } from '@features/yandex'
import { usePopupOpenAnimation } from '@shared/hooks'
import { ArtistLinks, CoverSourceBadge, CoverProviderBadge, YmLogo, providerBrandColor, type Track } from '@entities/track'
import type { Playlist } from '@entities/playlist'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Витрина «Чарты и новинки» на главной. Два независимых блока (чарт / новинки),
 * у каждого — переключатель площадки. Данные берём у провайдеров через
 * опциональные `getCharts` / `getNewReleases` (площадка без метода не участвует).
 *
 * Секции провайдеро-агностичны: чарт всегда треки; новинки — альбомы (YM/YTM)
 * либо треки (SoundCloud «New & Hot»), см. `NewReleases`.
 */

type Mode = 'chart' | 'new'
type BlockData =
  | { kind: 'tracks'; tracks: Track[] }
  | { kind: 'albums'; albums: Playlist[] }

/** Кеш загруженных секций (по mode+провайдеру), чтобы не дёргать сеть на каждый заход. */
const cache = new Map<string, { data: BlockData; at: number }>()
const TTL = 30 * 60 * 1000

const fetchBlock = async (mode: Mode, pid: string): Promise<BlockData | null> => {
  const key = `${mode}:${pid}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data
  const p = getProviders().find((x) => x.id === pid)
  if (!p) return null
  let data: BlockData | null = null
  if (mode === 'chart') {
    if (!p.getCharts) return null
    data = { kind: 'tracks', tracks: await p.getCharts() }
  } else {
    if (!p.getNewReleases) return null
    const r: NewReleases = await p.getNewReleases()
    data = r.kind === 'albums' ? { kind: 'albums', albums: r.albums } : { kind: 'tracks', tracks: r.tracks }
  }
  cache.set(key, { data, at: Date.now() })
  return data
}

/** Площадки, поддерживающие данный режим (и включённые сейчас). */
const providersFor = (mode: Mode): { id: string; label: string }[] =>
  getProviders()
    .filter((p) => (mode === 'chart' ? !!p.getCharts : !!p.getNewReleases))
    .map((p) => ({ id: p.id, label: p.label }))

/**
 * Кнопка-инфо «(i)» в заголовке секции. Чарты/новинки сейчас отдаёт только
 * Яндекс, поэтому вместо переключателя площадок — попап с бейджем Яндекса и
 * подписью «доступно только для Яндекс Музыки». Механика попапа — как у кнопки
 * «!» карточки «Продолжить» (fixed-портал в body, чтобы overflow секции его не
 * обрезал): открывается НАД кнопкой.
 */
const DiscInfoBadge = () => {
  const t = useT()
  const [pos, setPos] = useState<{ top: number; cx: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  usePopupOpenAnimation(popRef, pos)
  const toggle = () => {
    if (pos) {
      setPos(null)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    // Открываем НАД кнопкой: якорим низ попапа к верху кнопки (translateY(-100%)).
    setPos({ top: r.top - 8, cx: r.left + r.width / 2 })
  }
  // Ресайз/скролл → координаты fixed-попапа устаревают, закрываем.
  useLayoutEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [pos])
  return (
    <>
      <button
        ref={btnRef}
        className={`home-disc-info${pos ? ' active' : ''}`}
        onClick={toggle}
        aria-label={t('home.info')}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
      >
        <Ico name="info" width={16} height={16} />
      </button>
      {pos &&
        createPortal(
          <>
            {/* клик мимо — закрыть */}
            <div onClick={() => setPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 8000 }} />
            <div style={{ position: 'fixed', top: pos.top, left: pos.cx, zIndex: 8001, transform: 'translate(-50%, -100%)' }}>
              <div ref={popRef} className="hcc-info-pop" role="menu">
                <div className="hcc-info-item">
                  <span className="hcc-info-ico" style={{ color: providerBrandColor('yandex') ?? 'var(--text2)' }}>
                    <YmLogo size={16} />
                  </span>
                  <span className="hcc-info-txt">
                    <span className="hcc-info-cap">{t('home.discOnlyCap')}</span>
                    <span className="hcc-info-val">{t('home.discOnlyVal')}</span>
                  </span>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

const openAlbum = (pid: string, a: Playlist): void => {
  useDetailStore.getState().open({
    kind: 'album',
    providerId: pid,
    id: a.id,
    title: a.title,
    cover: a.cover ?? null,
    round: false,
  })
}

/** Один блок витрины (чарт ИЛИ новинки) с переключателем площадки. */
const DiscoverBlock = ({
  mode,
  active,
  onTrackCtx,
}: {
  mode: Mode
  active: boolean
  onTrackCtx: (e: ReactMouseEvent, t: Track) => void
}) => {
  const t = useT()
  // Пере-вычисляем список площадок при: логине Яндекса, заходе на главную,
  // а также один раз после первого кадра (провайдеры регистрируются в эффекте App).
  const ymAuthed = useYmAuthStore((s) => s.authed)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setTick((n) => n + 1), 0)
    return () => clearTimeout(id)
  }, [active, ymAuthed])

  // Площадка секции — первая доступная (сейчас чарты/новинки даёт только Яндекс,
  // переключателя нет; вместо него в заголовке кнопка-инфо DiscInfoBadge).
  const tabs = providersFor(mode)
  const selected = tabs[0]?.id ?? null

  const [data, setData] = useState<BlockData | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const reqRef = useRef(0)

  useEffect(() => {
    if (!selected || !active) return
    const req = ++reqRef.current
    setFailed(false)
    // Кеш есть — показываем мгновенно, без спиннера; иначе грузим.
    const key = `${mode}:${selected}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL) {
      setData(hit.data)
      setLoading(false)
      return
    }
    setLoading(true)
    fetchBlock(mode, selected)
      .then((d) => {
        if (req !== reqRef.current) return
        setData(d)
        setFailed(!d || (d.kind === 'tracks' ? d.tracks.length === 0 : d.albums.length === 0))
      })
      .catch(() => {
        if (req !== reqRef.current) return
        setData(null)
        setFailed(true)
      })
      .finally(() => {
        if (req === reqRef.current) setLoading(false)
      })
    // tick — форс переоценки после регистрации провайдеров.
  }, [mode, selected, active, tick])

  // Нет ни одной площадки для режима — блок скрыт целиком.
  if (!tabs.length || !selected) return null

  return (
    <div className="home-section home-disc">
      <div className="home-disc-hdr">
        <div className="home-section-hdr">{t(mode === 'chart' ? 'home.charts' : 'home.newReleases')}</div>
        <DiscInfoBadge />
      </div>

      {loading && !data ? (
        <div className="home-cards home-disc-loading">
          {Array.from({ length: 7 }).map((_, i) => (
            <div className="home-card" key={i}>
              <div className="hc-cover" />
            </div>
          ))}
        </div>
      ) : failed || !data ? (
        <div className="home-empty-hint">{t('home.discFail')}</div>
      ) : data.kind === 'tracks' ? (
        <div className="home-cards">
          {data.tracks.map((tr) => (
            <div className="home-card" key={tr.id} onClick={() => playSingleTrack(tr.id)} onContextMenu={(e) => onTrackCtx(e, tr)}>
              <div className="hc-cover">
                {tr.cover ? <img src={tr.cover} alt="" /> : <Ico name="note" width={24} height={24} />}
                <CoverSourceBadge track={tr} size={24} />
                <div className="hc-play-overlay">
                  <div className="hc-play-btn">
                    <Ico name="play" width="100%" height="100%" style={{ color: 'var(--accent)', marginLeft: 2 }} />
                  </div>
                </div>
                <PlayStateOverlay trackId={tr.id} size="card" />
              </div>
              <div className="hc-name">{tr.name}</div>
              <div className="hc-artist">
                <ArtistLinks
                  artist={tr.artist}
                  scId={tr.artistScId}
                  permalink={tr.artistPermalink}
                  artistId={tr.artistId}
                  provider={tr.artistProvider}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="home-cards">
          {data.albums.map((a) => (
            <div className="home-card" key={a.id} onClick={() => openAlbum(selected, a)}>
              <div className="hc-cover">
                {a.cover ? <img src={a.cover} alt="" /> : <Ico name="note" width={24} height={24} />}
                <CoverProviderBadge provider={a.source} size={24} />
                <div className="hc-play-overlay">
                  <div className="hc-play-btn">
                    <Ico name="play" width="100%" height="100%" style={{ color: 'var(--accent)', marginLeft: 2 }} />
                  </div>
                </div>
              </div>
              <div className="hc-name">{a.title}</div>
              <div className="hc-artist">{a.ownerName}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Обе секции витрины на главной. Сначала «Новинки», затем «Чарты». */
export const DiscoverSections = ({
  active,
  onTrackCtx,
}: {
  active: boolean
  onTrackCtx: (e: ReactMouseEvent, t: Track) => void
}) => (
  <>
    <DiscoverBlock mode="new" active={active} onTrackCtx={onTrackCtx} />
    <DiscoverBlock mode="chart" active={active} onTrackCtx={onTrackCtx} />
  </>
)
