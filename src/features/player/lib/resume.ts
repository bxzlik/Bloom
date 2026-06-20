import { useLibStore, useFavStore, usePlaylistStore } from '@features/library'
import { trackRegistry, type Track } from '@entities/track'
import { t as i18nT } from '@shared/i18n'
import { useQueueStore, type PlaySource } from '../model/queueStore'
import { audioEngine } from './audioEngine'

/** Резолв трека: библиотека → реестр площадок. */
const findTrack = (id: string): Track | undefined =>
  useLibStore.getState().tracks.find((t) => t.id === id) ?? trackRegistry.get(id)

/**
 * Сохранение/восстановление позиции воспроизведения («Продолжить»).
 * `saveResumePos`/`resumeOrPlay`, ключ localStorage `bloom_resume`.
 *
 * ВАЖНО: формат `source` — СТАРЫЙ (`{type,label,plId,folderPath}`), а не bloom
 * `PlaySource`, потому что этот же ключ читает/пишет движок «Волны»
 * (`src/wave/index.ts` tryRestore). Маппинг PlaySource ↔ старый формат — здесь.
 */
const KEY = 'bloom_resume'

interface LegacySource {
  type: string
  label?: string
  plId?: string | null
  folderPath?: string | null
}

export interface ResumeData {
  id: string
  pos: number
  source?: LegacySource
  queue?: string[]
  qIdx?: number
  savedAt?: number
  state?: string
  /** Снимок трека — чтобы карточка «Продолжить» отрисовалась и трек заиграл
   *  после рестарта, когда трек площадки (SC) уже не лежит в реестре в памяти. */
  track?: Track
}

const toLegacySource = (s: PlaySource): LegacySource => {
  if (!s) return { type: 'all' }
  switch (s.kind) {
    case 'lib-all': return { type: 'all' }
    case 'lib-fav': return { type: 'fav' }
    case 'lib-history': return { type: 'history' }
    case 'playlist': return { type: 'pl', plId: s.id, label: s.name }
    case 'folder': return { type: 'folder', folderPath: s.path, label: s.name }
    case 'sc': return { type: 'sc', label: s.label }
    case 'wave': return { type: 'wave', label: s.label }
  }
}

const fromLegacySource = (s: LegacySource | undefined): PlaySource => {
  if (!s) return { kind: 'lib-all' }
  switch (s.type) {
    case 'fav': return { kind: 'lib-fav' }
    case 'history': return { kind: 'lib-history' }
    case 'pl': {
      if (!s.plId) return { kind: 'lib-all' }
      // Обложку плейлиста (для иконки пилюли очереди) резолвим из стора по plId —
      // в-формате резюма она не хранится. Иначе после рестарта пилюля
      // теряла бы картинку и падала на дефолтную ноту.
      const cover = usePlaylistStore.getState().playlists.find((p) => p.id === s.plId)?.cover ?? null
      return { kind: 'playlist', id: s.plId, name: s.label ?? '', cover }
    }
    case 'folder': return s.folderPath ? { kind: 'folder', path: s.folderPath, name: s.label ?? '' } : { kind: 'lib-all' }
    case 'sc': return { kind: 'sc', label: s.label ?? 'SoundCloud' }
    case 'wave': return { kind: 'wave', label: s.label ?? i18nT('wave.title') }
    default: return { kind: 'lib-all' }
  }
}

/** Человекочитаемая метка источника из старого формата (для карточки «Продолжить»). */
export const legacySourceLabel = (s: LegacySource | undefined): string => {
  if (!s) return i18nT('player.queueTitle.all')
  switch (s.type) {
    case 'all': return i18nT('player.queueTitle.all')
    case 'fav': return i18nT('player.queueTitle.fav')
    case 'history': return i18nT('player.queueTitle.history')
    default: return s.label || i18nT('player.queueTitle.all')
  }
}

export const loadResume = (): ResumeData | null => {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || '{}')
    return r && r.id ? (r as ResumeData) : null
  } catch {
    return null
  }
}

/** Сохранить текущее состояние плеера. Вызывается из бриджа (throttled + на pause/play). */
export const saveResume = (state?: string): void => {
  const { curId, queue, qIdx, source } = useQueueStore.getState()
  if (!curId || !audioEngine.duration) return
  try {
    const t = findTrack(curId)
    const data: ResumeData = {
      id: curId,
      pos: audioEngine.currentTime,
      source: toLegacySource(source),
      queue,
      qIdx,
      savedAt: Date.now(),
      state: state || (audioEngine.paused ? 'paused' : 'playing'),
      // url протух — обнуляем; остальное (cover/name/scMedia) нужно для рестарта.
      track: t ? { ...t, url: null } : undefined,
    }
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

// Позиция, на которую надо перемотать после загрузки метаданных следующего трека.
// Консьюмится в useMainPlayerBridge (onLoadedMeta).
let _pendingSeek: number | null = null
export const setPendingResumeSeek = (pos: number): void => {
  _pendingSeek = pos > 2 ? pos : null
}
export const consumePendingResumeSeek = (): number | null => {
  const p = _pendingSeek
  _pendingSeek = null
  return p
}

/** Реконструировать очередь по источнику, если в резюме её нет (старые данные). */
const reconstructQueue = (r: ResumeData): string[] => {
  if (r.queue && r.queue.length) return r.queue
  const src = r.source
  if (src?.type === 'pl' && src.plId) {
    const pl = usePlaylistStore.getState().playlists.find((p) => p.id === src.plId)
    if (pl?.trs.length) return [...pl.trs]
  } else if (src?.type === 'fav') {
    const favs = useLibStore.getState().tracks.filter((t) => useFavStore.getState().favs.has(t.id)).map((t) => t.id)
    if (favs.length) return favs
  }
  return useLibStore.getState().tracks.map((t) => t.id)
}

/**
 * Восстановить и запустить сохранённую сессию (клик по «Продолжить», когда нет
 * живого трека). Возвращает id трека или null. loadPlay вызывает caller.
 */
export const restoreResumeQueue = (r: ResumeData): string | null => {
  if (!r.id) return null
  // Пере-регистрируем снимок трека — иначе после рестарта SC-трек не зарезолвится
  // в loadPlay (реестр площадок живёт только в памяти).
  if (r.track && !findTrack(r.id)) trackRegistry.put(r.track)
  const queue = reconstructQueue(r)
  let qIdx = typeof r.qIdx === 'number' ? r.qIdx : queue.indexOf(r.id)
  if (qIdx < 0 || queue[qIdx] !== r.id) qIdx = queue.indexOf(r.id)
  if (qIdx < 0) {
    queue.unshift(r.id)
    qIdx = 0
  }
  useQueueStore.getState().setQueue(queue, qIdx, fromLegacySource(r.source))
  setPendingResumeSeek(r.pos || 0)
  return r.id
}
