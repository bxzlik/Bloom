import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useT } from '@shared/i18n'
import { playFromSource, playSingleTrack, PlayStateOverlay } from '@features/player'
import { useUiPrefsStore } from '@features/settings'
import { useYmAuthStore } from '@features/yandex'
import { buildForYou, onForYouReset, readForYouCache, writeForYouCache } from '@features/library'
import { ArtistLinks, CoverSourceBadge, type Track } from '@entities/track'
import { CardMarquee, EmptyCover } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Витрина «Для вас» на главной: похожие на то, что человек слушает чаще всего.
 *
 * Подбор целиком в `features/library/lib/forYou` — здесь только показ. Секция
 * ведёт себя как соседние витрины: пока данных нет, её нет вовсе (ни скелетона,
 * ни «не удалось загрузить») — пустое место честнее мигающей заглушки.
 *
 * Подборка живёт сутки: пересобирать её на каждый заход значит терять трек,
 * который человек заметил, но не успел открыть. Кэш держит сами треки, а не id,
 * см. шапку `forYou.ts`.
 */
/** Паузы перед тихими повторами сборки (последняя — сдаёмся до следующего захода). */
const RETRY_MS = [1500, 4000]

export const ForYouSection = ({
  active,
  onTrackCtx,
}: {
  active: boolean
  onTrackCtx: (e: ReactMouseEvent, t: Track) => void
}) => {
  const t = useT()
  const show = useUiPrefsStore((s) => s.homeForYou)
  const [tracks, setTracks] = useState<Track[] | null>(() => readForYouCache())
  // Успешно собрали — больше не пересобираем за сеанс (несколько сетевых
  // запросов подряд). Пустой результат НЕ защёлкиваем: на первом кадре он
  // означает не «похожих нет», а «спросить было ещё некого», см. ниже.
  const doneRef = useRef(false)
  const inFlight = useRef(false)

  // «Очистить статистику» выбивает сиды, по которым подборка собрана. Главная
  // при этом смонтирована, так что забываем подборку здесь же и снимаем
  // защёлку — эффект ниже соберёт новую (сразу или при следующем заходе).
  useEffect(
    () =>
      onForYouReset(() => {
        doneRef.current = false
        setTracks(null)
      }),
    [],
  )

  // Провайдеры площадок регистрируются в эффекте `App`, а эффекты потомков в
  // React выполняются РАНЬШЕ родительских — на первом кадре реестр пуст.
  // Поэтому тик после первого кадра (и на логин Яндекса, который добавляет
  // площадку уже по ходу сеанса), как в DiscoverSections.
  const ymAuthed = useYmAuthStore((s) => s.authed)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setTick((n) => n + 1), 0)
    return () => clearTimeout(id)
  }, [active, ymAuthed])

  useEffect(() => {
    if (!show || !active || doneRef.current || inFlight.current) return
    if (tracks?.length) return
    inFlight.current = true
    let alive = true
    let timer = 0
    // Тика после первого кадра мало: площадка может зарегистрироваться позже
    // (а при HMR — принести новый объект провайдера в уже занятый реестр).
    // Поэтому тихие повторы, как у витрины чартов.
    const attempt = (n: number): void => {
      buildForYou()
        .then((res) => {
          if (!alive) return
          if (res.length) {
            doneRef.current = true
            writeForYouCache(res)
            setTracks(res)
            inFlight.current = false
            return
          }
          if (n < RETRY_MS.length) {
            timer = window.setTimeout(() => attempt(n + 1), RETRY_MS[n])
            return
          }
          // Сдались — но не защёлкиваем: следующий заход на главную попробует
          // снова (подборка суточная, лишней сети это не создаёт).
          inFlight.current = false
        })
        .catch(() => {
          // Секция просто не появится — главная от этого не ломается.
          inFlight.current = false
        })
    }
    attempt(0)
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      inFlight.current = false
    }
  }, [show, active, tick, tracks])

  if (!show || !tracks?.length) return null

  // Стопка запускает всю подборку очередью, одиночная карточка — только свой
  // трек. Из одного трека стопка не складывается, да и повторяла бы соседа.
  const playAll = (): void =>
    playFromSource(
      tracks.map((x) => x.id),
      { kind: 'sc', label: t('home.forYou'), cover: tracks[0]!.cover ?? null },
    )
  const [front, left, right] = tracks

  return (
    <div className="home-section home-disc">
      <div className="home-section-hdr">{t('home.forYou')}</div>
      <div className="home-cards">
        {tracks.length > 1 && (
          <div className="home-card fy-all mqh" onClick={playAll}>
            <div className="fy-stack">
              {/* Порядок в DOM = порядок слоёв: задние раньше верхней. */}
              {left && <div className="fy-back l">{left.cover ? <img src={left.cover} alt="" draggable={false} /> : <EmptyCover />}</div>}
              {right && <div className="fy-back r">{right.cover ? <img src={right.cover} alt="" draggable={false} /> : <EmptyCover />}</div>}
              <div className="hc-cover fy-front">
                {front!.cover ? <img src={front!.cover} alt="" draggable={false} /> : <EmptyCover />}
                <div className="hc-play-overlay">
                  <div className="hc-play-btn">
                    <Ico name="play" width="100%" height="100%" style={{ color: 'var(--accent)', marginLeft: 2 }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="hc-name fy-title">{t('home.forYouAll')}</div>
          </div>
        )}
        {tracks.map((tr) => (
          <div
            className="home-card mqh"
            key={tr.id}
            onClick={() => playSingleTrack(tr.id)}
            onContextMenu={(e) => onTrackCtx(e, tr)}
          >
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
    </div>
  )
}
