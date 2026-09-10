import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useT } from '@shared/i18n'
import { getProviders, type NewReleases } from '@features/providers'
import { playSingleTrack, PlayStateOverlay } from '@features/player'
import { useYmAuthStore } from '@features/yandex'
import { useUiPrefsStore } from '@features/settings'
import { useDetailStore } from '@features/search'
import { ArtistLinks, CoverSourceBadge, type Track } from '@entities/track'
import type { Playlist } from '@entities/playlist'
import { CardMarquee, EmptyCover } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'
import { ReleaseCard } from './ReleaseCard'
import { ChartCard } from './ChartCard'

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

/**
 * Сколько мест чарта показывать на главной. Площадка отдаёт весь чарт (у Яндекса
 * ~100 позиций) — витрина берёт только верх, полный список открывается кликом по
 * заголовку (страница чарта, DetailView kind='chart').
 */
const HOME_CHART_MAX = 15

/**
 * Сколько релизов в полосе на главной. Остальное (до 60, см. NEW_RELEASES_MAX в
 * yandex.rs) — на странице «Релизы» сеткой: карточка релиза широкая (320px) и
 * каждая сканирует обложку ради тона плашки, длинная полоса тут не нужна.
 */
const HOME_REL_MAX = 10

/** Кеш загруженных секций (по mode+провайдеру), чтобы не дёргать сеть на каждый заход. */
const cache = new Map<string, { data: BlockData; at: number }>()
const TTL = 30 * 60 * 1000
/** Паузы перед тихими повторами, если ответ пустой/упал (последняя = сдаёмся). */
const RETRY_MS = [1500, 4000]

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
  // Кешируем только непустой результат: пустой ответ у Яндекса почти всегда —
  // транзиентный сбой landing3 (а не «данных нет»). Иначе один пустой ответ
  // застревал бы на весь TTL и блок висел бы «Не удалось загрузить».
  const empty = data.kind === 'tracks' ? data.tracks.length === 0 : data.albums.length === 0
  if (!empty) cache.set(key, { data, at: Date.now() })
  return data
}

/** Площадки, поддерживающие данный режим (и включённые сейчас). */
const providersFor = (mode: Mode): { id: string; label: string }[] =>
  getProviders()
    .filter((p) => (mode === 'chart' ? !!p.getCharts : !!p.getNewReleases))
    .map((p) => ({ id: p.id, label: p.label }))

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

  // Площадка секции — первая доступная (сейчас чарты/новинки даёт только
  // Яндекс, переключателя нет).
  const tabs = providersFor(mode)
  const selected = tabs[0]?.id ?? null

  const [data, setData] = useState<BlockData | null>(null)
  const reqRef = useRef(0)

  useEffect(() => {
    if (!selected || !active) return
    const req = ++reqRef.current
    // Кеш есть — показываем мгновенно; иначе грузим.
    const key = `${mode}:${selected}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL) {
      setData(hit.data)
      return
    }
    let timer = 0
    // Пока данных нет — секции нет вовсе: ни скелетона, ни «Не удалось загрузить».
    // Пустое место выглядит лучше мигающей заглушки, а сбой landing3 у Яндекса
    // почти всегда транзиентный, поэтому тихо перезапрашиваем — секция просто
    // появится чуть позже. Ранее показанные данные при сбое не стираем.
    const attempt = (n: number) => {
      fetchBlock(mode, selected)
        .then((d) => {
          if (req !== reqRef.current) return
          const empty = !d || (d.kind === 'tracks' ? d.tracks.length === 0 : d.albums.length === 0)
          if (!empty) {
            setData(d)
            return
          }
          if (n < RETRY_MS.length) timer = window.setTimeout(() => attempt(n + 1), RETRY_MS[n])
        })
        .catch(() => {
          if (req !== reqRef.current) return
          if (n < RETRY_MS.length) timer = window.setTimeout(() => attempt(n + 1), RETRY_MS[n])
        })
    }
    attempt(0)
    return () => {
      if (timer) clearTimeout(timer)
    }
    // tick — форс переоценки после регистрации провайдеров.
  }, [mode, selected, active, tick])

  // Нет площадки для режима либо данные ещё не пришли — блок скрыт целиком.
  if (!tabs.length || !selected || !data) return null

  // Заголовок ведёт на полную страницу раздела: чарт — списком до 100 позиций,
  // релизы — сеткой альбомов. У SoundCloud «New & Hot» приходит треками, сетки
  // релизов для них нет — заголовок остаётся обычным.
  const openFull = () =>
    useDetailStore.getState().open({
      kind: mode === 'chart' ? 'chart' : 'releases',
      providerId: selected,
      id: mode === 'chart' ? 'chart' : 'releases',
      title: t(mode === 'chart' ? 'home.charts' : 'home.releases'),
      cover: data.kind === 'tracks' ? data.tracks[0]?.cover ?? null : data.albums[0]?.cover ?? null,
      round: false,
    })
  const linkedHdr = mode === 'chart' || data.kind === 'albums'

  return (
    <div className={`home-section home-disc${data.kind === 'albums' ? ' rel-sec' : mode === 'chart' ? ' ch-sec' : ''}`}>
      {linkedHdr ? (
        <button type="button" className="home-section-hdr is-link" onClick={openFull}>
          {t(mode === 'chart' ? 'home.charts' : 'home.releases')}
          <Ico name="arrowRight" width={22} height={22} />
        </button>
      ) : (
        <div className="home-section-hdr">{t('home.releases')}</div>
      )}

      {data.kind === 'tracks' && mode === 'chart' ? (
        // Витрина показывает только верх чарта — остальное на странице чарта.
        <div className="home-cards ch-row">
          {data.tracks.slice(0, HOME_CHART_MAX).map((tr, i) => (
            <ChartCard key={tr.id} track={tr} pos={tr.chartPos ?? i + 1} onCtxMenu={onTrackCtx} />
          ))}
        </div>
      ) : data.kind === 'tracks' ? (
        <div className="home-cards">
          {data.tracks.map((tr) => (
            <div className="home-card mqh" key={tr.id} onClick={() => playSingleTrack(tr.id)} onContextMenu={(e) => onTrackCtx(e, tr)}>
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
          ))}
        </div>
      ) : (
        // Альбомы бывают только у режима «Релизы» — там своя крупная карточка
        // (круг с фото артиста + плашка релиза), см. ReleaseCard.
        <div className="home-cards rel-row">
          {data.albums.slice(0, HOME_REL_MAX).map((a) => (
            <ReleaseCard key={a.id} album={a} providerId={selected} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Обе секции витрины на главной. Сначала «Новинки», затем «Чарты». Каждая
 * скрывается отдельно из «Настройки → Страницы → Главная».
 */
export const DiscoverSections = ({
  active,
  onTrackCtx,
}: {
  active: boolean
  onTrackCtx: (e: ReactMouseEvent, t: Track) => void
}) => {
  const showNew = useUiPrefsStore((s) => s.homeNew)
  const showCharts = useUiPrefsStore((s) => s.homeCharts)
  return (
    <>
      {showNew && <DiscoverBlock mode="new" active={active} onTrackCtx={onTrackCtx} />}
      {showCharts && <DiscoverBlock mode="chart" active={active} onTrackCtx={onTrackCtx} />}
    </>
  )
}
