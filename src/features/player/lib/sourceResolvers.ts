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
 * Строит URL для локального файла из folder_watcher через custom URI scheme
 * `bloom-file://` (Rust `file_protocol::SCHEME`, поддержка Range).
 * `encodeURIComponent` процентит всё включая `/` и `:` —
 * раскодируем обратно, чтобы `C:\dir\f.mp3` стал `C:/dir/f.mp3` в URL.
 */
const buildLocalUrl = (localPath: string): string => {
  const enc = encodeURIComponent(localPath)
    .replace(/%5C/gi, '/')
    .replace(/%3A/gi, ':')
  return `http://bloom-file.localhost/${enc}`
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
  if (t._localPath) return { url: buildLocalUrl(t._localPath) }
  for (const r of _resolvers) {
    const u = await r(t)
    if (u) return typeof u === 'string' ? { url: u } : u
  }
  return null
}
