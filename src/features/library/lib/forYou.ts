// Витрина «Для вас» на главной: похожие на то, что человек слушает чаще всего.
//
// Сиды берутся из `db/playStats` (журнал на 60k событий с датами), а НЕ из
// `useHistoryStore`: тот держит 200 уникальных треков с вытеснением по давности,
// и «самое слушаемое» по нему — это «самое слушаемое из недавнего».
//
// Ключевая мелочь: сид не нужно резолвить в `Track`. id в журнале уже несёт
// площадочный (`sc_123`, `ym_456`), а провайдер снимает свой префикс сам — так
// что подборка собирается и после рестарта, когда треки площадок уже выпали из
// `trackRegistry` (он живёт в памяти). Локальные файлы отсеиваются тем же
// шагом: у них префикса нет, похожих спросить не у кого.

import { allPlayed, playMeta, topPlayed } from '@/db/playStats'
import { trackRegistry, type Track } from '@entities/track'
import { getProviders } from '@features/providers'
import { normalizeArtist } from '@/db/track-meta'
import { DupGuard } from '@shared/lib/trackDedup'
import { useLibStore } from '../model/store'
import { useFavStore } from '../model/favStore'
import { useHistoryStore } from '../model/historyStore'

/**
 * Окно, за которое считаем «самое слушаемое». Вкус двухлетней давности
 * рекомендациям только мешает, поэтому смотрим на последние три месяца.
 */
const WINDOW_DAYS = 90
/** Если за окно данных почти нет (новая установка) — считаем за всё время. */
const WINDOW_MIN_SEEDS = 3
/** Сколько сидов опрашиваем. Каждый — сетевой запрос, поэтому немного. */
const SEED_LIMIT = 5
/** Сколько карточек в полосе. */
export const FOR_YOU_MAX = 20
/** Больше двух треков одного артиста полоса не выдерживает — становится его витриной. */
const PER_ARTIST_MAX = 2

/**
 * Сиды: самое слушаемое за окно, только треки площадок.
 *
 * Библиотека идёт вторым источником — трек могли залайкать вчера и ещё ни разу
 * не отыграть, но как указание на вкус он не хуже заслушанного. Свежие лайки
 * добавляются в хвост, чтобы не вытеснять реальный топ.
 */
export const pickForYouSeeds = (limit = SEED_LIMIT): string[] => {
  const isPlatform = (id: string): boolean => id.startsWith('sc_') || id.startsWith('ym_')

  let top = topPlayed({ sinceDays: WINDOW_DAYS, limit: limit * 4, minPlays: 2 })
    .filter((r) => isPlatform(r.id))
  if (top.length < WINDOW_MIN_SEEDS) {
    top = topPlayed({ limit: limit * 4, minPlays: 1 }).filter((r) => isPlatform(r.id))
  }

  const out: string[] = []
  const seen = new Set<string>()
  const push = (id: string): void => {
    if (!id || seen.has(id) || !isPlatform(id) || out.length >= limit) return
    seen.add(id)
    out.push(id)
  }

  for (const r of top) push(r.id)

  // Добивка из библиотеки: свежие лайки, затем недавно добавленное.
  if (out.length < limit) {
    const lib = useLibStore.getState().tracks.filter((t) => !t.disliked)
    // Лайки — из стора: `t.fav`/`t.favAt` на треках не ведутся.
    const favAt = useFavStore.getState().favs
    const favs = lib
      .filter((t) => favAt.has(t.id))
      .sort((a, b) => (favAt.get(b.id) ?? 0) - (favAt.get(a.id) ?? 0))
    for (const t of favs) push(t.id)
    const fresh = [...lib].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    for (const t of fresh) push(t.id)
  }

  return out
}

/**
 * Собрать полосу: опросить провайдеров по сидам и слить выдачу.
 *
 * Сборка идёт «по кругу» (по одному треку от каждого сида за проход), иначе
 * первый же сид с длинным related забивает всю полосу и подборка выглядит как
 * похожие на один трек.
 */
const assembleForYou = async (): Promise<Track[]> => {
  const seeds = pickForYouSeeds()
  const all = getProviders()
  const provs = all.filter((p) => !!p.getSimilarTracks)
  // Пустая секция молчалива по замыслу, но отличить «нет сидов» от «площадки
  // ещё не зарегистрировались» и от «зарегистрировались, но без метода» иначе
  // нечем — а это три разные починки.
  if (!seeds.length || !provs.length) {
    console.warn('[forYou] нечего собирать:', {
      seeds: seeds.length,
      registered: all.map((p) => p.id),
      withSimilar: provs.map((p) => p.id),
    })
    return []
  }

  // Запросы последовательные: у SoundCloud в Rust общий rate-limit, и веером
  // они всё равно выстроятся в очередь — зато параллельный старт мешает
  // остальной главной прогрузиться.
  const batches: Track[][] = []
  for (const seed of seeds) {
    // Чей это сид, решает сам провайдер: по контракту он отдаёт пустой массив
    // на чужой префикс, не ходя в сеть. Поэтому перебор здесь бесплатный, а
    // соответствие «префикс id → площадка» не приходится дублировать снаружи.
    for (const p of provs) {
      try {
        const batch = await p.getSimilarTracks!(seed)
        if (batch.length) {
          batches.push(batch)
          break
        }
      } catch {
        // Один сид не ответил — не повод хоронить всю полосу.
      }
    }
  }
  if (!batches.length) {
    console.warn('[forYou] площадки не отдали похожих ни по одному сиду', seeds)
    return []
  }

  // Всё, что человек уже знает: библиотека и вообще слышанное. Сверка не только
  // по id — один трек на двух площадках имеет разные id, а на SoundCloud ещё и
  // реаплоады от разных загрузчиков, см. `shared/lib/trackDedup`.
  const lib = useLibStore.getState().tracks
  const knownIds = new Set<string>(lib.map((t) => t.id))
  for (const e of useHistoryStore.getState().entries) knownIds.add(e.id)
  for (const seed of seeds) knownIds.add(seed)

  const dup = knownDups(lib)

  const out: Track[] = []
  const perArtist = new Map<string, number>()
  const maxLen = Math.max(...batches.map((b) => b.length))

  for (let i = 0; i < maxLen && out.length < FOR_YOU_MAX; i++) {
    for (const batch of batches) {
      if (out.length >= FOR_YOU_MAX) break
      const t = batch[i]
      if (!t || knownIds.has(t.id)) continue
      const a = normalizeArtist(t.artist)
      const n = perArtist.get(a) ?? 0
      if (n >= PER_ARTIST_MAX) continue
      // Последним — самая дорогая проверка, чтобы не гонять её на отсеянных.
      if (!dup.accept(t)) continue
      perArtist.set(a, n + 1)
      out.push(t)
    }
  }

  if (!out.length) {
    // Похожие пришли, но все до одного отфильтровались — почти всегда значит,
    // что площадка вернула то, что уже лежит в библиотеке.
    const got = batches.reduce((s, b) => s + b.length, 0)
    console.warn(`[forYou] все ${got} похожих отфильтрованы как уже знакомые`)
  }
  return out
}

/**
 * Отсев перезаливов по всему знакомому: библиотека и всё слышанное. Сверки по
 * id мало — копия того же трека от другого загрузчика приходит под своим id.
 * Слышанное, но не сохранённое, сверяем по снимку из журнала (название, артист,
 * длительность). Каждый раз новый: накопитель запоминает принятое.
 */
export const knownDups = (lib: Track[]): DupGuard => {
  const dup = new DupGuard()
  const inLib = new Set<string>()
  for (const t of lib) {
    dup.add(t)
    inLib.add(t.id)
  }
  for (const r of allPlayed()) {
    if (inLib.has(r.id)) continue
    const m = playMeta(r.id)
    if (m) dup.add({ name: m.name, artist: m.artist, sec: m.sec })
  }
  return dup
}

/** Идущая сборка — её ждёт «Похожие на»: утром обе витрины стартуют разом. */
let pending: Promise<Track[]> | null = null

export const buildForYou = (): Promise<Track[]> => {
  const job = assembleForYou()
  pending = job
  const clear = (): void => {
    if (pending === job) pending = null
  }
  job.then(clear, clear)
  return job
}

/**
 * Треки «Для вас» на сегодня: кэш, а пока его нет — результат идущей сборки.
 * Без ожидания соседняя витрина утром сверялась бы с пустотой.
 */
export const forYouTracks = async (): Promise<Track[]> => {
  const cached = readForYouCache()
  if (cached) return cached
  return pending ? pending.catch(() => []) : []
}

/* ── Суточный кэш ────────────────────────────────────────────────────────
 * Храним не id, а сами треки: площадочные живут только в `trackRegistry`, а он
 * в памяти — после рестарта по одним id плеер бы их не нашёл и полоса стала бы
 * набором неигрибельных карточек. При чтении возвращаем их в реестр.
 */

/**
 * Версия в ключе — не для формата, а для ЛОГИКИ отбора. Подборка живёт сутки,
 * поэтому после правки правил (дедуп, окно, фильтры) у людей до полуночи
 * оставалась бы выдача, собранная по старым — с теми самыми дублями, ради
 * которых правку и делали. Меняешь отбор — поднимай версию.
 *   v2 — дедуп реаплоадов (shared/lib/trackDedup)
 *   v3 — лайки в добивке сидов (раньше фильтр по мёртвому `t.fav` был пуст)
 *   v4 — перезаливы сверяются и со слышанным, не только с библиотекой
 */
const CACHE_KEY = 'bloom_for_you_v4'

interface ForYouCache {
  day: string
  tracks: Track[]
}

/** Локальный день (не UTC): подборка должна меняться по календарю пользователя. */
const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export const readForYouCache = (): Track[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as ForYouCache
    if (!c || c.day !== today() || !Array.isArray(c.tracks) || !c.tracks.length) return null
    trackRegistry.put(c.tracks, { temp: true })
    return c.tracks
  } catch {
    return null
  }
}

export const writeForYouCache = (tracks: Track[]): void => {
  if (!tracks.length) return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ day: today(), tracks } satisfies ForYouCache))
  } catch {
    // localStorage переполнен — переживём, просто пересоберём в следующий заход.
  }
}

/* ── Сброс ───────────────────────────────────────────────────────────────
 * Часть «Очистить статистику»: подборка собрана по сидам из удалённого топа, и
 * жить ей до полуночи незачем. Одного удаления ключа мало — главная держится
 * смонтированной, и секция хранит треки у себя в состоянии. Поэтому ещё сигнал:
 * секция на него забывает подборку и собирает заново.
 */
const resetListeners = new Set<() => void>()

export const onForYouReset = (fn: () => void): (() => void) => {
  resetListeners.add(fn)
  return () => {
    resetListeners.delete(fn)
  }
}

export const clearForYouCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // Хранилище недоступно — секцию всё равно пересоберём по сигналу.
  }
  for (const fn of resetListeners) fn()
}
