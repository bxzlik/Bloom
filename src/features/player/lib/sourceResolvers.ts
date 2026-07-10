import { localFileUrl } from '@shared/lib/localFile'
import type { Track } from '@entities/track'

/**
 * Слой резолва играбельного URL по источнику трека.
 *
 * Это «розетка», в которую вставляются площадки. Плеер не знает, как получить
 * стрим SoundCloud или Yandex — он лишь вызывает `resolvePlayableUrl(t)`. Каждая
 * площадка регистрирует свой резолвер один раз при инициализации:
 *
 *   registerSourceResolver((t) => t._sc ? resolveScStream(t) : null)
 *   registerSourceResolver((t) => t.id.startsWith('ym_') ? invoke('yandex_stream_sign', …) : null)
 *
 * Резолверы опрашиваются по порядку регистрации; первый непустой результат
 * выигрывает. Резолвер, которому трек «не его», возвращает null.
 *
 * Логика каждого источника изолирована в своей фиче, а не вшита в `loadPlay`.
 */
/**
 * Играбельный источник. `hls:true` — поток m3u8 (нужен hls.js в audioEngine);
 * иначе прямой URL (progressive mp3 / blob / локальный файл).
 */
export interface PlayableSource {
  url: string
  hls?: boolean
}

export type SourceResolver = (
  t: Track,
) => Promise<string | PlayableSource | null> | string | PlayableSource | null

const _resolvers: SourceResolver[] = []

/** Площадка регистрирует свой резолвер стрима. Идемпотентность — на совести вызывающего (звать один раз при init). */
export const registerSourceResolver = (r: SourceResolver): void => {
  _resolvers.push(r)
}

/**
 * Единая точка получения играбельного URL для любого трека.
 *
 * Встроенные источники (синхронно):
 * - `t.url`        — уже готовый URL (blob от handleFiles, либо закешированный
 *                    стрим, который площадка положила на трек).
 * - `t._localPath` — локальный файл через `bloom-file://`.
 *
 * Остальное — через зарегистрированные резолверы площадок (async, по сети).
 * Возвращает null, если URL не удалось получить (caller покажет/пропустит).
 */
export const resolvePlayableUrl = async (t: Track): Promise<PlayableSource | null> => {
  if (t.url) return { url: t.url }
  if (t._localPath) return { url: localFileUrl(t._localPath) }
  for (const r of _resolvers) {
    const u = await r(t)
    if (u) return typeof u === 'string' ? { url: u } : u
  }
  return null
}
