import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { fetchWaveFaces, pickDisplaySeeds, type WaveFace } from '@/wave'
import { useLibStore } from '@features/library/model/store'
import { useFavStore } from '@features/library/model/favStore'
import { trackRegistry, coverCache, type Track } from '@entities/track'

/**
 * Сколько обложек в полосе. Плитки — flex:1, поэтому число задаёт не размер, а
 * ПЛОТНОСТЬ коллажа: 7 на ширине ~1100px даёт плитку ~160px (портретный кроп,
 * как на макете). Больше — превращается в частокол полосок, меньше — обложки
 * читаются как отдельные картинки, а не как фон.
 */
const TILES = 7
/**
 * Запрашиваем вдвое больше обложек, чем плиток: лишние — запас, из которого
 * идёт перетасовка. Меньше двукратного — набор быстро зацикливается и одни и те
 * же картинки мелькают туда-сюда.
 */
const POOL = TILES * 2
/**
 * Период смены ОДНОЙ плитки. При 7 плитках каждая обновляется раз в ~35с —
 * коллаж живёт, но не мельтешит под заголовком. Длительность самого кроссфейда
 * — в CSS (hwbFadeIn/hwbFadeOut, 1.1s).
 */
const SWAP_MS = 5000

/** Стабильная пустышка: см. мемо `pool` ниже — новый литерал зациклил бы эффекты. */
const EMPTY: WaveFace[] = []

/**
 * Обложка сида: библиотека → реестр площадок → персистентный `coverCache`.
 * Последний нужен потому, что реестр живёт в памяти — после перезапуска треки
 * площадок не резолвятся и коллаж собрался бы из пары картинок (та же логика,
 * что у коллажей «Любимые»/«История» на главной).
 */
const resolveCover = (id: string, libById: Map<string, Track>): string | undefined => {
  const live = (libById.get(id) ?? trackRegistry.get(id))?.cover
  if (live) coverCache.put(id, live)
  return live ?? coverCache.get(id) ?? undefined
}

/** Экономия/доступность: в этих режимах перетасовка не идёт вовсе. */
const motionOff = (): boolean =>
  document.body.classList.contains('bars-hidden') ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Одна плитка коллажа. Держит ДВА слоя: приходящий и уходящий — смена обложки
 * идёт кроссфейдом, а не подменой src (иначе картинка моргает белым).
 *
 * Анимацию перезапускает `key` по url: без ремонта <img> CSS-анимация с тем же
 * именем не играет повторно. Уходящий слой снимаем по таймеру, чуть длиннее
 * самого фейда, — иначе в DOM копятся прозрачные картинки.
 */
const CollageTile = memo(function CollageTile({ cover, loading }: { cover?: string; loading: boolean }) {
  const [cur, setCur] = useState<string | undefined>(cover)
  const [prev, setPrev] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (cover === cur) return
    setPrev(cur)
    setCur(cover)
  }, [cover])

  useEffect(() => {
    if (!prev) return
    const id = window.setTimeout(() => setPrev(undefined), 1300)
    return () => window.clearTimeout(id)
  }, [prev])

  return (
    <div className={`hwb-ct${!cur ? ' is-empty' : ''}${loading ? ' is-load' : ''}`}>
      {prev && <img key={`p:${prev}`} className="hwb-ct-l is-out" src={prev} alt="" decoding="async" />}
      {cur && <img key={cur} className="hwb-ct-l is-in" src={cur} alt="" loading="lazy" decoding="async" />}
    </div>
  )
})

/**
 * Фон баннера «Моя волна»: полоса обложек того, что волна играла бы прямо
 * сейчас. Чистая декорация — плитки не кликабельны (aria-hidden), запуск идёт
 * одной кнопкой в герое.
 *
 * Обложки берём У ВЫБРАННОЙ ПЛОЩАДКИ (`fetchWaveFaces`), а не из библиотеки:
 * SoundCloud → related личных сидов, Яндекс → батч rotor'а. Переключатель
 * площадки в попапе «Настроить» меняет и содержимое коллажа. Библиотечные сиды
 * остаются только фолбэком, когда площадка ничего не отдала (нет сети / не
 * залогинен).
 *
 * Живость: раз в SWAP_MS одна плитка кроссфейдом меняется на обложку из запаса
 * (то, что на экран ещё не попало), по кругу слева направо. Это единственное
 * движение баннера — дрейф всей полосы вбок был снят как незаметный.
 *
 * Мемо по `source`: ре-рендеры WaveCard (загрузка, открытие попапа) не должны
 * дёргать <img> — иначе полоса моргает на каждый клик.
 */
export const WaveCollage = memo(function WaveCollage({ source }: { source: 'sc' | 'ym' }) {
  const libTracks = useLibStore((s) => s.tracks)
  const favs = useFavStore((s) => s.favs)
  // null = ещё грузим (показываем заглушки), [] = площадка не отдала ничего.
  const [faces, setFaces] = useState<WaveFace[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setFaces(null)
    void fetchWaveFaces(source, POOL).then((f) => {
      if (!cancelled) setFaces(f)
    })
    return () => {
      cancelled = true
    }
  }, [source])

  // Фолбэк по библиотеке. Пересчитываем только при изменении библиотеки/лайков:
  // pickDisplaySeeds детерминирована, поэтому полоса не тасуется на каждом
  // прослушивании.
  const libTiles = useMemo<WaveFace[]>(() => {
    const libById = new Map(libTracks.map((tr) => [tr.id, tr]))
    const out: WaveFace[] = []
    for (const id of pickDisplaySeeds(POOL * 4)) {
      const cover = resolveCover(id, libById)
      if (!cover) continue
      const tr = libById.get(id) ?? trackRegistry.get(id)
      out.push({ id, cover, name: tr?.name ?? '' })
      if (out.length === POOL) break
    }
    coverCache.save()
    return out
  }, [libTracks, favs])

  const loading = faces === null
  // ГОЧА: обязательно мемо. Пул — зависимость сразу трёх эффектов, один из
  // которых зовёт setOrder; свежий литерал `[]` на каждый рендер закольцевал бы
  // их (рендер → эффект → setState → рендер).
  const pool = useMemo<WaveFace[]>(
    () => (faces && faces.length ? faces : loading ? EMPTY : libTiles),
    [faces, loading, libTiles],
  )

  // Что сейчас в какой плитке: индексы в `pool`. Пересобирается при смене пула.
  const [order, setOrder] = useState<number[]>([])
  // Курсоры перетасовки: какую плитку меняем следующей и с какого места пула
  // ищем не показанную сейчас обложку.
  const slotRef = useRef(0)
  const poolRef = useRef(TILES)

  useEffect(() => {
    slotRef.current = 0
    poolRef.current = TILES
    setOrder(Array.from({ length: TILES }, (_, i) => i))
  }, [pool])

  // Прогреваем весь запас: подменяемая обложка должна появиться мгновенно, иначе
  // кроссфейд проявляет пустое место, пока картинка тянется по сети.
  useEffect(() => {
    for (const f of pool.slice(TILES)) {
      const im = new Image()
      im.src = f.cover
    }
  }, [pool])

  useEffect(() => {
    // Меняться нечем: обложек ровно на плитки (или меньше) — запаса нет.
    if (pool.length <= TILES) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => {
      // Экономию энергии проверяем на каждом тике, а не при подписке: класс
      // навешивается на body уже после монтирования (optEngine).
      if (motionOff() || document.hidden) return
      setOrder((cur) => {
        const next = cur.slice()
        const slot = slotRef.current % TILES
        slotRef.current += 1
        // Берём первую обложку из запаса, которой сейчас нет НИ В ОДНОЙ плитке,
        // — иначе одна и та же картинка окажется в полосе дважды.
        for (let n = 0; n < pool.length; n++) {
          const cand = (poolRef.current + n) % pool.length
          if (!next.includes(cand)) {
            next[slot] = cand
            poolRef.current = cand + 1
            break
          }
        }
        return next
      })
    }, SWAP_MS)
    return () => window.clearInterval(id)
  }, [pool])

  return (
    <div className="hwb-collage">
      {Array.from({ length: TILES }, (_, i) => (
        // Обложек меньше, чем плиток, либо ещё грузятся — дырок в полосе быть не
        // должно, плитка сама покажет нейтральную заглушку.
        <CollageTile key={i} cover={pool[order[i] ?? i]?.cover} loading={loading} />
      ))}
    </div>
  )
})
