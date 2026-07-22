import type { Track } from '@entities/track'
import { trackRegistry, coverCache } from '@entities/track'
import { invoke } from '@shared/tauri'
import { useLibStore, useFavStore, useHistoryStore, useActivityStore, saveTrackToLibrary, replaceLibTrack, usePlaylistStore, useNewPlModalStore } from '@features/library'
import { toast, notify } from '@shared/ui'
import { t as i18nT } from '@shared/i18n'
import { requestLyrics, useLyricsStore } from '@features/lyrics'
import waveApi from '@/wave'
import { smartShuffleWeight } from '@/db/history'
import { getProvider } from '@features/providers'
import { usePlayerStore } from '../model/store'
import { useQueueStore, type PlaySource } from '../model/queueStore'
import { saveVolumePrefs } from '../model/volumePrefs'
import { audioEngine } from '../lib/audioEngine'
import { resolvePlayableUrl } from '../lib/sourceResolvers'
import { setPendingResumeSeek } from '../lib/resume'

/**
 * Найти Track по id для воспроизведения. Источник правды для локальных/загруженных
 * треков — `useLibStore`; треки площадок (SoundCloud/Yandex) живут в `trackRegistry`,
 * куда их кладёт соответствующая фича. `_trackById`:
 * `tracksMap.get(id) || _tempTracksMap.get(id)`.
 */
const findTrack = (id: string): Track | undefined =>
  useLibStore.getState().tracks.find((t) => t.id === id) ?? trackRegistry.get(id)

/**
 * Парсит "m:ss" → секунды. У локальных треков dur приходит уже как строка.
 * Возвращает 0 если не парсится (тогда возьмём из loadedmetadata).
 */
const parseDur = (dur: string | undefined): number => {
  if (!dur) return 0
  const parts = dur.split(':').map((s) => parseInt(s, 10))
  if (parts.some((n) => Number.isNaN(n))) return 0
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
  return 0
}

/**
 * Пушим состояние в Rust → Rust раздаёт в mirror windows + Discord/tray/SMTC.
 * Вызывается на каждое значимое событие (track change / play / pause / fav / position).
 */
const pushNowPlaying = (opts?: { positionOverride?: number }): void => {
  const p = usePlayerStore.getState()
  // shuffle/repeat — источник правды queueStore. Без них mp_state в Rust остаётся
  // дефолтным, и miniplayer/tray откатывают свою оптимистичную подсветку обратно.
  const q = useQueueStore.getState()
  // Площадка текущего трека — для бейджа на обложке мини-плеера/трея.
  const cur = q.curId ? findTrack(q.curId) : undefined
  const source = cur?._ym ? 'yandex' : cur?._ytm ? 'ytmusic' : cur?._sp ? 'spotify' : cur?._sc ? 'soundcloud' : null
  void invoke('now_playing', {
    title: p.title,
    artist: p.artist,
    playing: p.playing,
    artwork: p.artwork ?? undefined,
    position: opts?.positionOverride ?? p.position,
    duration: p.duration,
    trackUrl: p.trackUrl ?? undefined,
    artistUrl: p.artistUrl ?? undefined,
    fav: p.fav,
    canAddToLib: p.canAddToLib,
    shuffle: q.shuffle,
    smartShuffle: q.smartShuffle,
    repeat: q.repeat,
    source: source ?? undefined,
  }).catch(() => {})
}

/** Throttled-вариант для частых обновлений position (timeupdate ~4 Hz). */
let _npLastPushAt = 0
const pushNowPlayingThrottled = (): void => {
  const now = Date.now()
  if (now - _npLastPushAt < 1000) return
  _npLastPushAt = now
  pushNowPlaying()
}

/**
 * Монотонный токен загрузки: каждый `loadPlay` инкрементит счётчик. Резолв URL
 * у площадок асинхронный (сеть) — если пользователь успел переключить трек, пока
 * предыдущий резолвился, устаревший резолв не должен «перебить» актуальный.
 * Аналог ручного restore-on-error, но проще.
 */
let _loadToken = 0

/**
 * Счётчик подряд пропущенных (недоступных) треков. Защита от бесконечного
 * цикла, когда вся очередь — DRM/недоступные треки: без неё авто-скип крутился
 * бы по кругу вечно. Сбрасывается при первом успешном резолве стрима.
 */
let _skipCount = 0

/**
 * Авто-скип недоступного трека на следующий в очереди. DRM-защищённые SC-треки
 * (`getStreamUrl` бросает «DRM», до получения URL) и треки без потока пропускаем
 * автоматически, иначе очередь зависает на них. `_onError`
 * + защита от зацикливания на полностью недоступной очереди.
 */
const skipUnplayable = (failedId: string, err: unknown): void => {
  const msg = err instanceof Error ? err.message : ''
  const isDrm = /DRM/i.test(msg)
  toast(isDrm ? i18nT('toast.drmSkip') : i18nT('toast.unavailableSkip'))
  notify({
    kind: 'error',
    titleKey: 'notif.trackUnavailable.title',
    body: i18nT('notif.trackUnavailable.body'),
  })

  const { queue, qIdx } = useQueueStore.getState()
  // Скип имеет смысл, только если упавший трек — текущий элемент очереди и есть
  // куда переходить. Одиночный трек / трек вне очереди — пропускать некуда.
  if (queue.length <= 1 || queue[qIdx] !== failedId) return
  // Вся очередь недоступна → останавливаемся, не крутим бесконечный цикл.
  if (++_skipCount >= queue.length) {
    _skipCount = 0
    toast(i18nT('toast.noPlayable'))
    return
  }
  const next = (qIdx + 1) % queue.length
  useQueueStore.getState().setQIdx(next)
  void loadPlay(queue[next]!)
}

/**
 * Флаг «прослушивание текущего трека уже засчитано». Выставляется в `creditPlay`,
 * сбрасывается при переключении (в `commitDisplay`).
 * `_playCountCredited`.
 */
let _playCredited = false

/**
 * Засчитать прослушивание трека: история + дневная активность + старт волны
 * (refill/prefetch). Вызывается из bridge при достижении ~90% длительности либо
 * на `ended` — НЕ на старте, чтобы быстро пропущенные/DRM треки не засчитывались
 * как прослушанные. Срабатывает один раз за воспроизведение.
 * `_creditPlay`.
 */
export const creditPlay = (id: string): void => {
  if (_playCredited) return
  _playCredited = true
  useHistoryStore.getState().add(id) // _histAdd
  useActivityStore.getState().add() // _activityAdd
  // Обложку кладём в переживающий рестарт кеш: история хранит только id, а
  // trackRegistry живёт в памяти — иначе коллаж «История» на главной после
  // перезапуска не из чего собрать.
  coverCache.put(id, findTrack(id)?.cover)
  coverCache.save()
  // Волна: уведомить о старте трека (записать played, дозагрузить пачку, prefetch).
  // В onTrackStart жил тоже здесь, в _creditPlay.
  waveApi.onTrackStart(id)
}

/**
 * Загрузить трек по id и начать играть. Не меняет queue / qIdx — это делает
 * caller (playFromSource/nextTr/prevTr).
 *
 * Резолв стрима у площадок асинхронный, поэтому сам «показ» (смена curId,
 * заголовка/обложки, истории, лайвы волны) откладываем до УСПЕШНОГО резолва —
 * иначе плеер переключался бы на ещё грузящийся трек, который может оказаться
 * DRM/недоступным. Пока грузится — крутится только спиннер, «текущим» остаётся
 * предыдущий трек (и продолжает играть). Локальные/уже-с-URL треки резолвятся
 * синхронно → переключаем сразу, без задержки. split на
 * `_showCoverLoading` (сразу) ↔ `_commitPlay`/`_onError` (после резолва).
 */
export const loadPlay = async (id: string): Promise<void> => {
  const t = findTrack(id)
  if (!t) {
    console.warn('[player] loadPlay: track not found', id)
    return
  }
  const myToken = ++_loadToken

  // Мгновенные источники (локальный файл / готовый url) резолвятся синхронно —
  // их показываем сразу. Сетевые (SC/Yandex) — только после успешного резолва.
  const instant = !!(t.url || t._localPath)

  // Переключить ПОКАЗ на трек: плеер-бар, подсветка очереди, история, волна.
  // Вызывается сразу (instant) либо после успешного резолва.
  const commitDisplay = (): void => {
    // Волна: фидбэк по ПРЕДЫДУЩЕМУ треку (skip/finish) на момент РЕАЛЬНОГО
    // переключения — пока audioEngine ещё держит его currentTime/duration.
    // (До коммита curId не меняем, поэтому при цепочке DRM-скипов фидбэк по
    // настоящему игравшему треку не задвоится.) Вне активной сессии — игнор.
    const prevId = useQueueStore.getState().curId
    if (prevId && prevId !== id) {
      waveApi.feedback({
        action: 'finish',
        trackId: prevId,
        playedSec: audioEngine.currentTime,
        durSec: audioEngine.duration,
      })
    }

    const ps = usePlayerStore.getState()
    const fav = useFavStore.getState().favs.has(id)
    usePlayerStore.setState({
      title: t.name || '',
      artist: t.artist || '',
      artwork: t.cover ?? null,
      position: 0,
      duration: parseDur(t.dur),
      fav,
      // «В библиотеку» (в «+» miniplayer/tray) показываем, когда трека ещё НЕТ в
      // библиотеке (SC-треки, не сохранённые локально). Раньше было `!t._sc` —
      // инвертировано: предлагало добавить уже-локальные и прятало для SC.
      canAddToLib: !useLibStore.getState().tracks.some((x) => x.id === id),
      playing: ps.playing, // play() ниже выставит true
      // Ссылки для Discord-кнопок «На трек»/«На артиста» (SC permalink'и; у локальных нет).
      trackUrl: t.scPermalink || t.url || null,
      artistUrl: t.artistPermalink || null,
    })

    useQueueStore.getState().setCurId(id)

    // Запрос текста песни — хука updUI.
    requestLyrics(t)
    // Волна: на каждом переключении персистим состояние (queue/qIdx) и тихо
    // завершаем сессию, если ушли на не-волновой источник. Сам «старт» волны
    // (refill/prefetch/отметка «прослушано») происходит позже — в `creditPlay`,
    // когда трек доигран на 90%.
    waveApi.persistState()

    // Новый трек стал текущим — сбрасываем флаг «прослушивание засчитано»,
    // чтобы creditPlay сработал для него заново.
    _playCredited = false
  }

  // Спиннер на обложке строки/плеера показываем сразу — обратная связь, что трек
  // грузится. Снимается в bridge на loadedmetadata/error.
  useQueueStore.getState().setLoadingId(id)
  // Трек площадки закрепляем, чтобы clearTemp не выкинул его во время резолва.
  trackRegistry.promote(id)

  if (instant) commitDisplay()

  let src: Awaited<ReturnType<typeof resolvePlayableUrl>> = null
  let resolveErr: unknown = null
  try {
    src = await resolvePlayableUrl(t)
  } catch (e) {
    resolveErr = e
    console.warn('[player] stream resolve failed', id, e)
  }

  // Пока резолвился стрим, пользователь мог переключить трек — не перебиваем.
  if (myToken !== _loadToken) return

  if (!src) {
    console.warn('[player] no playable url for track', id)
    // Снимаем спиннер — стрим не получен (иначе зависнет навсегда).
    if (useQueueStore.getState().loadingId === id) useQueueStore.getState().setLoadingId(null)
    // Недоступен/DRM → авто-скип на следующий трек очереди.
    // Показ на этот трек не переключали — «текущим» остаётся предыдущий.
    skipUnplayable(id, resolveErr)
    return
  }

  // Стрим получен — последовательность скипов прервана, сбрасываем счётчик.
  _skipCount = 0
  // Сетевой трек резолвнулся успешно — теперь переключаем показ на него.
  if (!instant) commitDisplay()
  // Клик по уже играющему треку: src совпадает с текущим → audioEngine.play не
  // перезагружает источник и событие loadedmetadata/error не придёт. Спиннер
  // снимается только в этих обработчиках (bridge), поэтому снимаем его вручную,
  // иначе на обложке висит бесконечная «загрузка».
  const alreadyLoaded = src.url === audioEngine.currentSrc
  void audioEngine.play(src.url, { hls: src.hls })
  if (alreadyLoaded && useQueueStore.getState().loadingId === id) {
    useQueueStore.getState().setLoadingId(null)
  }
  pushNowPlaying({ positionOverride: 0 })
}

/**
 * Запустить плеер с заданным набором треков, начиная с конкретного id.
 * Если start не указан — играем с первого. `source` — для отображения «откуда».
 *
 * Это основной entry-point из библиотеки/поиска: «Играть все», клик-на-трек.
 */
export const playFromSource = (
  trackIds: string[],
  source: PlaySource,
  startId?: string,
): void => {
  if (!trackIds.length) return
  let idx = 0
  if (startId) {
    const i = trackIds.indexOf(startId)
    if (i >= 0) idx = i
  }
  useQueueStore.getState().setQueue(trackIds, idx, source)
  trackIds.forEach((x) => trackRegistry.promote(x)) // вся очередь должна пережить clearTemp
  void loadPlay(trackIds[idx]!)
}

/**
 * Перемешать и запустить (как кнопка «Перемешать» в библиотеке).
 * Включает shuffle, ставит случайный стартовый трек.
 */
export const playShuffledFromSource = (
  trackIds: string[],
  source: PlaySource,
): void => {
  if (!trackIds.length) return
  const shuffled = [...trackIds]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  useQueueStore.setState({ shuffle: true, smartShuffle: false, _origQueue: trackIds })
  useQueueStore.getState().setQueue(shuffled, 0, source)
  trackIds.forEach((x) => trackRegistry.promote(x))
  void loadPlay(shuffled[0]!)
}

export const togglePlay = (): void => {
  if (!useQueueStore.getState().curId) return
  void audioEngine.toggle()
}

/**
 * Лёгкая перемотка для drag прогресс-бара: ставит только `currentTime` + локальную
 * позицию в store, БЕЗ пуша в Rust. Drag шлёт
 * pointermove десятки раз/сек — `pushNowPlaying` (invoke) на каждый тик флудил IPC
 * и вызывал «дёрганье»/рывки ползунка. Финальный пуш делает `seek()` на отпускании.
 */
export const seekLive = (sec: number): void => {
  audioEngine.seekTo(sec)
  usePlayerStore.getState().setPosition(audioEngine.currentTime)
}

export const seek = (sec: number): void => {
  audioEngine.seekTo(sec)
  usePlayerStore.getState().setPosition(audioEngine.currentTime)
  pushNowPlaying()
}

/**
 * Зеркало громкости в Rust (синк с tray-popup/miniplayer) — троттлится.
 * Слайдер шлёт десятки `oninput`/сек при перетаскивании; invoke на каждый тик
 * флудит IPC и вызывает лаг ползунка. Звук/UI ставим мгновенно (setVol),
 * а в Rust шлём не чаще раза в ~120мс + гарантированный trailing-вызов.
 */
let _volMirrorTimer: ReturnType<typeof setTimeout> | null = null
let _volMirrorPending: number | null = null
const _mirrorVolumeThrottled = (v: number): void => {
  _volMirrorPending = v
  if (_volMirrorTimer) return
  const flush = () => {
    _volMirrorTimer = null
    if (_volMirrorPending == null) return
    const val = _volMirrorPending
    _volMirrorPending = null
    void invoke('miniplayer_cmd', { cmd: 'volume', value: val }).catch(() => {})
    _volMirrorTimer = setTimeout(flush, 120)
  }
  flush()
}

export const setVol = (v0to100: number): void => {
  audioEngine.setVolume(v0to100)
  usePlayerStore.getState().setVolume(v0to100)
  saveVolumePrefs({ volume: v0to100, prevVolume: usePlayerStore.getState()._prevVolume })
  _mirrorVolumeThrottled(v0to100)
}

export const toggleMuteMain = (): void => {
  const next = usePlayerStore.getState().toggleMute()
  audioEngine.setVolume(next)
  saveVolumePrefs({ volume: next, prevVolume: usePlayerStore.getState()._prevVolume })
  _mirrorVolumeThrottled(next)
}

export const nextTr = (): void => {
  const { queue, qIdx, repeat } = useQueueStore.getState()
  if (!queue.length) return
  // Явный «далее» всегда переключает на следующий трек, даже при repeat-one:
  // повтор того же трека — поведение для авто-перехода на `ended` (см.
  // useMainPlayerBridge), а не для кнопки. Иначе «далее» залипал на текущем.
  let next = qIdx + 1
  if (next >= queue.length) {
    // wrap при любом включённом repeat (all/one); off — останавливаемся в конце.
    if (repeat === 0) return
    next = 0
  }
  useQueueStore.getState().setQIdx(next)
  void loadPlay(queue[next]!)
}

export const prevTr = (): void => {
  const { queue, qIdx } = useQueueStore.getState()
  if (!queue.length) return
  // Если играем больше 3 секунд — перематываем в начало вместо переключения.
  if (audioEngine.currentTime > 3) {
    audioEngine.seekTo(0)
    return
  }
  const prev = (qIdx - 1 + queue.length) % queue.length
  useQueueStore.getState().setQIdx(prev)
  void loadPlay(queue[prev]!)
}

export const toggleShuffleMain = (): void => {
  useQueueStore.getState().cycleShuffle(smartShuffleWeight)
  const q = useQueueStore.getState()
  usePlayerStore.setState({ shuffle: q.shuffle, smartShuffle: q.smartShuffle })
  pushNowPlaying()
}

export const cycleRepeatMain = (): void => {
  useQueueStore.getState().cycleRepeat()
  const r = useQueueStore.getState().repeat
  usePlayerStore.setState({ repeat: r })
  pushNowPlaying()
}

/**
 * Прыжок к треку в текущей очереди (клик в `#playerQueueBlock`).
 * Обновляет qIdx + loadPlay. Если id вне queue — игнор.
 */
export const playFromCurrentQueue = (id: string): void => {
  const { queue } = useQueueStore.getState()
  const idx = queue.indexOf(id)
  if (idx < 0) return
  useQueueStore.getState().setQIdx(idx)
  void loadPlay(id)
}

// ── Переключение площадки текущего трека ───────────────────────────────────

/** id провайдера трека ('soundcloud' | 'yandex' | 'ytmusic' | 'local') для UI бейджа-кнопки. */
export const trackProviderId = (t: Track | null | undefined): string =>
  t?._ym ? 'yandex' : t?._ytm ? 'ytmusic' : t?._sp ? 'spotify' : t?._sc ? 'soundcloud' : 'local'

/**
 * Нормализация строки для сравнения названий/артистов между площадками:
 * lowercase, без скобочных уточнений (feat./remaster/…), только буквы/цифры.
 */
const normMatch = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .trim()

/**
 * Лучшее совпадение трека в чужой выдаче по пересечению токенов «название+артист».
 * Возвращает кандидата с наибольшим перекрытием (или первого, если выдача есть, но
 * совпадений нет — это всё равно ближайший по релевантности результат поиска).
 */
const pickPlatformMatch = (cands: Track[], cur: Track): Track | null => {
  if (!cands.length) return null
  const curTokens = new Set(
    `${normMatch(cur.name)} ${normMatch(cur.artist)}`.split(' ').filter(Boolean),
  )
  let best = cands[0]!
  let bestScore = -1
  for (const c of cands) {
    const tokens = `${normMatch(c.name)} ${normMatch(c.artist)}`.split(' ').filter(Boolean)
    let hit = 0
    for (const tk of tokens) if (curTokens.has(tk)) hit++
    const score = hit / Math.max(1, curTokens.size)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

/**
 * Переключить текущий трек на версию с другой площадки (`providerId`). Ищем по
 * «название + артист» в целевом провайдере, берём лучшее совпадение и заменяем им
 * текущий элемент очереди, сохраняя позицию воспроизведения. Зовётся из бейджа-
 * кнопки площадки в транспорте плеера (выбор площадки в дропдауне).
 */
export const switchPlatform = async (providerId: string): Promise<void> => {
  const curId = useQueueStore.getState().curId
  if (!curId) return
  const cur = findTrack(curId)
  if (!cur) return
  if (trackProviderId(cur) === providerId) return // уже на этой площадке

  const provider = getProvider(providerId)
  if (!provider) {
    toast(i18nT('toast.srcUnavailable'))
    return
  }

  // Позиция для восстановления после загрузки стрима новой площадки.
  const posBefore = audioEngine.currentTime

  let tracks: Track[] = []
  try {
    const res = await provider.search(`${cur.name} ${cur.artist}`.trim())
    tracks = res.tracks ?? []
  } catch {
    toast(i18nT('toast.srcSwitchFail'))
    return
  }

  // Пользователь успел переключить трек, пока шёл поиск — не перебиваем.
  if (useQueueStore.getState().curId !== curId) return

  const match = pickPlatformMatch(tracks, cur)
  if (!match) {
    toast(i18nT('toast.trackNotOnSrc', { label: provider.label }))
    notify({
      kind: 'error',
      titleKey: 'notif.trackUnavailable.title',
      body: i18nT('toast.trackNotOnSrc', { label: provider.label }),
    })
    return
  }

  // Закрепляем (не temp) — трек идёт в очередь и должен пережить clearTemp.
  trackRegistry.put(match)
  trackRegistry.promote(match.id)

  // Заменяем текущий элемент очереди новым id, сохраняя позицию в очереди.
  const { queue, qIdx } = useQueueStore.getState()
  if (qIdx >= 0 && queue[qIdx] === curId) {
    const nq = queue.slice()
    nq[qIdx] = match.id
    useQueueStore.setState({ queue: nq })
  }

  if (posBefore > 2) setPendingResumeSeek(posBefore)
  await loadPlay(match.id)
  toast(i18nT('toast.srcNow', { label: provider.label }))
}

/**
 * Переключить трек библиотеки на версию с другой площадки — ПЕРСИСТЕНТНАЯ замена
 * записи в библиотеке (в отличие от `switchPlatform`, который свапает только
 * играющий элемент очереди). Ищем по «название + артист» в целевом провайдере,
 * берём лучшее совпадение и ремапим все ссылки на трек (`replaceLibTrack`:
 * плейлисты, лайки, порядок, IDB). Зовётся из контекстного меню трека библиотеки.
 */
export const switchTrackPlatform = async (
  track: Track,
  providerId: string,
): Promise<void> => {
  if (trackProviderId(track) === providerId) return // уже на этой площадке

  const provider = getProvider(providerId)
  if (!provider) {
    toast(i18nT('toast.srcUnavailable'))
    return
  }

  let tracks: Track[] = []
  try {
    const res = await provider.search(`${track.name} ${track.artist}`.trim())
    tracks = res.tracks ?? []
  } catch {
    toast(i18nT('toast.srcSwitchFail'))
    return
  }

  const match = pickPlatformMatch(tracks, track)
  if (!match) {
    toast(i18nT('toast.trackNotOnSrc', { label: provider.label }))
    notify({
      kind: 'error',
      titleKey: 'notif.trackUnavailable.title',
      body: i18nT('toast.trackNotOnSrc', { label: provider.label }),
    })
    return
  }

  // Снимаем temp-флаги и сохраняем позицию сортировки «по дате» — переносим
  // addedAt старого трека. Blob/stream URL не персистим.
  const next: Track = {
    ...match,
    _scTemp: false,
    _ymTemp: false,
    addedAt: track.addedAt ?? match.addedAt ?? Date.now(),
    url: null,
  }

  replaceLibTrack(track.id, next)

  // Если трек сейчас в очереди/играет — ремапим id, чтобы очередь не ссылалась
  // на исчезнувший трек. Позицию воспроизведения не трогаем (это не «слушать
  // сейчас», а замена записи): текущий стрим доиграет, следующий возьмётся уже
  // с новой площадки.
  const { queue, curId } = useQueueStore.getState()
  if (queue.includes(track.id)) {
    useQueueStore.setState({
      queue: queue.map((id) => (id === track.id ? next.id : id)),
      curId: curId === track.id ? next.id : curId,
    })
  }

  toast(i18nT('toast.srcNow', { label: provider.label }))
}

/**
 * Reorder current queue (drag-drop в #playerQueueBlock). Сохраняет curId →
 * пересчитывает qIdx по новой позиции. Если shuffle активен — также правит
 * `_origQueue`-снимок чтобы при выключении shuffle восстановился актуальный
 * пользовательский порядок (но без перетряхивания текущего шафла).
 */
export const reorderQueue = (newIds: string[]): void => {
  const { curId, shuffle, _origQueue } = useQueueStore.getState()
  const newIdx = curId ? Math.max(0, newIds.indexOf(curId)) : 0
  useQueueStore.setState({
    queue: newIds,
    qIdx: newIdx,
    // При shuffle: рассинхронизируем сохранённый, т.к. пользователь
    // явно поменял порядок. Восстановление отключения shuffle вернёт linear.
    _origQueue: shuffle && _origQueue ? newIds : _origQueue,
  })
}

export const removeFromQueue = (id: string): void => {
  const { queue, qIdx, curId } = useQueueStore.getState()
  const idx = queue.indexOf(id)
  if (idx < 0) return
  if (queue.length <= 1) {
    // Последний трек — очищаем очередь полностью, плеер сбрасываем.
    useQueueStore.setState({ queue: [], qIdx: -1, curId: null })
    audioEngine.stop()
    usePlayerStore.setState({
      title: '',
      artist: '',
      artwork: null,
      playing: false,
      position: 0,
      duration: 0,
    })
    useLyricsStore.getState().clear()
    return
  }
  const newQueue = queue.slice()
  newQueue.splice(idx, 1)
  if (id === curId) {
    // Удалили текущий — играем следующий (тот, что был после, или первый).
    const newIdx = Math.min(idx, newQueue.length - 1)
    useQueueStore.setState({ queue: newQueue, qIdx: newIdx })
    void loadPlay(newQueue[newIdx]!)
  } else {
    useQueueStore.setState({
      queue: newQueue,
      qIdx: idx < qIdx ? qIdx - 1 : qIdx,
    })
  }
}

export const toggleCurFav = (): void => {
  const id = useQueueStore.getState().curId
  if (!id) return
  // Трек площадки (SC) не в библиотеке → сперва персистим, иначе в «Любимое» он
  // не попадёт (fav-вид фильтрует библиотечные треки). ensurePersisted.
  const inLib = useLibStore.getState().tracks.some((t) => t.id === id)
  if (!inLib) {
    const t = findTrack(id)
    if (t) saveTrackToLibrary(t)
  }
  useFavStore.getState().toggleFav(id)
  const isFav = useFavStore.getState().favs.has(id)
  usePlayerStore.setState({ fav: isFav })
  pushNowPlaying()
}

/**
 * Воспроизвести трек. Если он уже в текущей очереди — переходим к нему
 * (сохраняем source/queue). Иначе — loadPlay (сбросит source).
 * `playTr(id, ...)` минимальный вариант (без 'queue' / 'fav'
 * аргументов — source меняется в LibTracklist через playFromSource).
 */
export const playTrack = (id: string): void => {
  const { queue } = useQueueStore.getState()
  if (queue.includes(id)) {
    playFromCurrentQueue(id)
  } else {
    playSingleTrack(id)
  }
}

/**
 * Запустить одиночный трек как очередь из одного элемента. В отличие от голого
 * `loadPlay`, наполняет очередь (трек виден в `#playerQueueBlock`) и ставит
 * source `single` → в пилюле очереди пишется название трека с его обложкой.
 * Используется для запуска трека вне коллекции (контекст-меню, поиск, топы).
 */
export const playSingleTrack = (id: string): void => {
  const t = findTrack(id)
  const source: PlaySource = t
    ? { kind: 'single', name: t.name || '', cover: t.cover ?? null }
    : null
  playFromSource([id], source, id)
}

/** Добавить в конец очереди. */
export const addToQueue = (id: string): void => {
  const { queue } = useQueueStore.getState()
  if (queue.includes(id)) return
  trackRegistry.promote(id)
  useQueueStore.setState({ queue: [...queue, id] })
}

/**
 * Вставить трек сразу после текущего.
 * Если уже в очереди — переносим. qIdx корректируем если он сдвинется.
 */
export const playNextInQueue = (id: string): void => {
  const { queue, qIdx, curId } = useQueueStore.getState()
  trackRegistry.promote(id)
  const next = queue.filter((x) => x !== id)
  const insertAt = next.length ? qIdx + 1 : 0
  next.splice(insertAt, 0, id)
  let newQIdx = qIdx
  if (qIdx >= insertAt && curId && next[qIdx] !== curId) newQIdx = qIdx + 1
  useQueueStore.setState({ queue: next, qIdx: newQIdx })
}

// ── Действия «+» из miniplayer/tray (события bloom-mp-add-to-lib/add-to-pl/new-pl) ──
// Работают над ТЕКУЩИМ воспроизводимым треком.

/** SC-трек ещё не в библиотеке → персистим, иначе плейлист/фейв на него не сошлётся. */
const ensurePersisted = (id: string): void => {
  const inLib = useLibStore.getState().tracks.some((t) => t.id === id)
  if (!inLib) {
    const t = findTrack(id)
    if (t) saveTrackToLibrary(t)
  }
}

/** «В библиотеку» — сохранить текущий трек в локальную библиотеку. */
export const mpAddCurrentToLib = (): void => {
  const id = useQueueStore.getState().curId
  if (!id) return
  const t = findTrack(id)
  if (!t) return
  saveTrackToLibrary(t)
  // Трек теперь в библиотеке → прячем «В библиотеку» в мини/трее сразу (пушим).
  usePlayerStore.setState({ canAddToLib: false })
  pushNowPlaying()
  toast(i18nT('toast.addedToLib'))
}

/** Добавить текущий трек в плейлист по id. */
export const mpAddCurrentToPl = (plId: string): void => {
  const id = useQueueStore.getState().curId
  if (!id) return
  ensurePersisted(id)
  usePlaylistStore.getState().addTrackToPl(plId, id)
  const pl = usePlaylistStore.getState().playlists.find((p) => p.id === plId)
  toast(pl ? i18nT('toast.addedToPlNamed', { name: pl.name }) : i18nT('toast.addedToPl'))
}

/** «Новый плейлист» из «+» — открыть модалку, после создания добавить текущий трек. */
export const mpOpenNewPlForCurrent = (): void => {
  const id = useQueueStore.getState().curId
  if (id) ensurePersisted(id)
  useNewPlModalStore.getState().openModal(id)
}

// Внутренний хелпер — экспортируется только для bridge'а.
export const _pushNowPlaying = pushNowPlaying
export const _pushNowPlayingThrottled = pushNowPlayingThrottled
