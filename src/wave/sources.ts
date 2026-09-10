// Источники кандидатов для волны: stations/track:{id} и tracks/{id}/related.
//
// Сама сеть живёт в Rust (`src-tauri/src/soundcloud.rs`, команды `sc_wave_*`):
// сборка URL, последовательный rate-limit, кэш ответов на сеанс и повтор при
// 429 — там же, где client_id и прокси-фолбэк. Здесь остались только вызовы
// через `host` и гарантия «никогда не бросает»: движок (engine.ts) ждёт от
// этих функций список, а пустой ответ трактует как «сид ничего не дал».

import { host } from "./host";
import type { ScRawTrack } from "./types";

export function scStation(
  scTrackId: string | number,
  offset = 0,
): Promise<ScRawTrack[]> {
  return host.sc.waveStation(scTrackId, offset).catch(() => []);
}

export function scRelated(scTrackId: string | number): Promise<ScRawTrack[]> {
  return host.sc.waveRelated(scTrackId).catch(() => []);
}

export function resetWaveSourceCache(): Promise<void> {
  return host.sc.waveResetCache().catch(() => {});
}
