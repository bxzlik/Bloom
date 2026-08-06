import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import waveApi, { fetchWaveFaces, pickDisplaySeeds, type WaveFace } from '@/wave'
import { useLibStore } from '@features/library/model/store'
import { useFavStore } from '@features/library/model/favStore'
import { trackRegistry, coverCache, type Track } from '@entities/track'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Слот кольца: смещение от центра в px «дизайн-бокса» (620×400, см. home.css),
 * размер плитки, форма и параметры покачивания. Числа уезжают в CSS БЕЗ единиц:
 * там они умножаются на `--hwr-k` — длину одной px дизайн-бокса, которую считает
 * контейнерный запрос.
 *
 * Порядок массива = порядок заполнения обложками: сначала крупные боковые
 * плитки, туда попадают самые «сильные» сиды.
 */
type RingSlot = { x: number; y: number; size: number; round?: boolean; dur: number; delay: number }

/**
 * Ручки вида: rx=250 / ry=155 — эллипс кольца, size — сторона плитки. Кольцо
 * намеренно просторное, плитки некрупные: тесная сетка «в упор» (пробовал шаг
 * 135–150 при плитке 116–128) читается как таблица и душит середину.
 * Круглые — боковые и нижняя, они задают ритм.
 */
const RING_SLOTS: RingSlot[] = [
  { x: -250, y: 0, size: 96, round: true, dur: 9, delay: -1.2 },
  { x: 250, y: 0, size: 96, round: true, dur: 10.5, delay: -4.4 },
  { x: 0, y: -155, size: 86, dur: 8, delay: -2.6 },
  { x: -177, y: -110, size: 82, dur: 11, delay: -0.4 },
  { x: 177, y: -110, size: 78, dur: 9.5, delay: -3.1 },
  { x: -177, y: 110, size: 84, dur: 10, delay: -5.2 },
  { x: 177, y: 110, size: 80, dur: 8.5, delay: -1.8 },
  { x: 0, y: 155, size: 66, round: true, dur: 7.5, delay: -3.7 },
]

type Tile = WaveFace

/**
 * Обложка сида: библиотека → реестр площадок → персистентный `coverCache`.
 * Последний нужен потому, что реестр живёт в памяти — после перезапуска треки
 * площадок не резолвятся и кольцо собиралось бы из пары картинок (та же логика,
 * что у коллажей «Любимые»/«История» на главной).
 */
const resolveCover = (id: string, libById: Map<string, Track>): string | undefined => {
  const live = (libById.get(id) ?? trackRegistry.get(id))?.cover
  if (live) coverCache.put(id, live)
  return live ?? coverCache.get(id) ?? undefined
}

/**
 * Вид «Кольцо» блока «Моя волна»: обложки того, что волна играла бы прямо
 * сейчас, вокруг кнопки запуска (сама кнопка и заголовок живут в WaveCard —
 * здесь только фоновый слой плиток).
 *
 * Обложки берём У ВЫБРАННОЙ ПЛОЩАДКИ (`fetchWaveFaces`), а не из библиотеки:
 * SoundCloud → related личных сидов, Яндекс → батч rotor'а. Переключатель
 * площадки в «Настроить» меняет и содержимое кольца. Библиотечные сиды остаются
 * только фолбэком, когда площадка ничего не отдала (нет сети / не залогинен).
 *
 * Клик по обложке = запустить ЭТОТ трек и продолжить волной по нему
 * (`startByTrack(..., { seedFirst: true })`).
 */
export const WaveRing = ({ source }: { source: 'sc' | 'ym' }) => {
  const t = useT()
  const libTracks = useLibStore((s) => s.tracks)
  const favs = useFavStore((s) => s.favs)
  const [busy, setBusy] = useState<string | null>(null)
  // null = ещё грузим (показываем заглушки), [] = площадка не отдала ничего.
  const [faces, setFaces] = useState<Tile[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setFaces(null)
    void fetchWaveFaces(source, RING_SLOTS.length).then((f) => {
      if (!cancelled) setFaces(f)
    })
    return () => {
      cancelled = true
    }
  }, [source])

  // Фолбэк по библиотеке. Пересчитываем только при изменении библиотеки/лайков:
  // pickDisplaySeeds детерминирована, поэтому кольцо не тасуется на каждом
  // прослушивании.
  const libTiles = useMemo<Tile[]>(() => {
    const libById = new Map(libTracks.map((tr) => [tr.id, tr]))
    const out: Tile[] = []
    for (const id of pickDisplaySeeds(RING_SLOTS.length * 4)) {
      const cover = resolveCover(id, libById)
      if (!cover) continue
      const tr = libById.get(id) ?? trackRegistry.get(id)
      out.push({ id, cover, name: tr?.name ?? '' })
      if (out.length === RING_SLOTS.length) break
    }
    coverCache.save()
    return out
  }, [libTracks, favs])

  const loading = faces === null
  const tiles = faces && faces.length ? faces : loading ? [] : libTiles

  const start = async (id: string) => {
    if (busy) return
    setBusy(id)
    try {
      await waveApi.startByTrack(id, { seedFirst: true })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="hwr-ring">
      {RING_SLOTS.map((s, i) => {
        const tile = tiles[i]
        // --x/--y/--sz — БЕЗ единиц: в CSS они множатся на --hwr-k (длина одной
        // px дизайн-бокса). Иначе px×px даёт невалидный calc и вид схлопывается.
        const style = {
          '--x': s.x,
          '--y': s.y,
          '--sz': s.size,
          '--dur': `${s.dur}s`,
          '--delay': `${s.delay}s`,
        } as CSSProperties
        return (
          <div className={`hwr-slot${s.round ? ' is-round' : ''}`} key={i} style={style}>
            {tile ? (
              <button
                className={`hwr-tile${busy === tile.id ? ' is-busy' : ''}`}
                onClick={() => void start(tile.id)}
                aria-label={t('wave.startFrom', { name: tile.name })}
              >
                <img src={tile.cover} alt="" loading="lazy" decoding="async" />
                <span className="hwr-tile-ovl" aria-hidden="true">
                  <Ico name="play" variant="bold" width={18} height={18} />
                </span>
              </button>
            ) : (
              // Обложки ещё грузятся у площадки либо их меньше, чем слотов —
              // дырок в кольце быть не должно, ставим нейтральную заглушку.
              <div className={`hwr-tile is-empty${loading ? ' is-load' : ''}`} aria-hidden="true">
                <Ico name="note" width={20} height={20} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
