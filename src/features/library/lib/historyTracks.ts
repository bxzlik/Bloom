// Оживление треков для списка «История».
//
// Строка истории — это id и дата. Сам трек ищется по цепочке: библиотека →
// `trackRegistry` (память) → снимок из журнала (`db/playStats.playMeta`).
//
// Последнее звено и есть то, ради чего история переехала на журнал. Раньше
// треки площадок восстанавливались из `trackCache` (300 записей) и `coverCache`
// (400) — и всё, что старше, из истории просто пропадало, сколько бы записей ни
// разрешал лимит самого списка. Снимок в журнале хранится на каждый когда-либо
// игранный трек и при переполнении не подрезается.
//
// Важно, что синтезированный трек ИГРАБЕЛЬНЫЙ, а не только показываемый:
// площадочный id уже лежит внутри нашего (`sc_123`, `ym_456`), а резолверам
// стрима больше ничего и не нужно — `scResolveStream` по `scId` сам дотянет
// media, если её нет. Поэтому восстанавливаем и флаги источника.

import { trackRegistry, type Track } from '@entities/track'
import { playMeta } from '@/db/playStats'
import { durToSec } from '@shared/lib/trackDedup'
import { useLibStore } from '../model/store'

/** Секунды → «m:ss» (0/неизвестно → прочерк, как у остальных треков). */
const fmtDur = (sec: number): string => {
  if (!sec || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Собрать трек из снимка журнала. Возвращает null, если снимка нет. */
export const trackFromPlayMeta = (id: string): Track | null => {
  const m = playMeta(id)
  if (!m) return null

  const base: Track = {
    id,
    name: m.name || id,
    artist: m.artist || '',
    dur: fmtDur(m.sec),
    cover: m.cover,
    // Снимок восстановлен из журнала, а не из библиотеки: трек гостевой.
    _scTemp: true,
  }

  // Флаги источника — по префиксу id, он же несёт и площадочный id. Без них
  // резолверы стрима отказываются от трека, и строка была бы неиграбельной.
  if (id.startsWith('sc_')) {
    const scId = Number(id.slice(3))
    return { ...base, _sc: true, scId, scTrackId: scId }
  }
  if (id.startsWith('ym_')) {
    return { ...base, _ym: true, _ymTemp: true, ymTrackId: id.slice(3) }
  }
  // `ytm_<videoId>`, но под тем же префиксом живут артисты/альбомы/плейлисты —
  // их в журнале прослушиваний быть не может, и всё же отсекаем явно.
  if (id.startsWith('ytm_') && !/^ytm_(artist|album|pl)_/.test(id)) {
    return { ...base, _ytm: true, _ytmTemp: true, ytmVideoId: id.slice(4) }
  }
  return base
}

/**
 * Трек строки истории: библиотека → реестр → снимок журнала.
 * null — трека не осталось нигде (строку показывать нечем).
 */
export const resolveHistoryTrack = (id: string, libById?: Map<string, Track>): Track | null => {
  const fromLib = libById
    ? libById.get(id)
    : useLibStore.getState().tracks.find((t) => t.id === id)
  if (fromLib) return fromLib
  return trackRegistry.get(id) ?? trackFromPlayMeta(id)
}

/**
 * Сводка истории для подписи раздела: сколько треков и сколько наслушано.
 *
 * Время тут — именно ПРОСЛУШАННОЕ (длительность × число прослушиваний), а не
 * суммарная длина списка, как у «Всех треков». Для истории это единственное
 * осмысленное прочтение: трек, отыгранный десять раз, и правда занял в десять
 * раз больше времени.
 *
 * Длительность берём из снимка журнала — он есть и у треков, которых давно нет
 * ни в библиотеке, ни в памяти; библиотека идёт вторым источником для записей
 * старше журнала.
 */
export const historyTotals = (
  entries: { id: string; count: number }[],
  libById?: Map<string, Track>,
): { tracks: number; sec: number } => {
  let tracks = 0
  let sec = 0
  for (const e of entries) {
    const meta = playMeta(e.id)
    const dur = meta ? meta.sec : durToSec(resolveHistoryTrack(e.id, libById)?.dur)
    tracks++
    sec += dur * (e.count || 1)
  }
  return { tracks, sec }
}
