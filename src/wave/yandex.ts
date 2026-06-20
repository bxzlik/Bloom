// «Моя волна» от Яндекса (rotor). Отдельный драйвер очереди: использует те же
// механизмы плеера, что SC-волна (host.queue / loadPlay / curSource='wave'), но
// источник треков — нативный rotor Яндекса (ym_wave_tracks / ym_wave_feedback).
// по духу yandex-ui.js (_ymWave*). Особенности:
//   • без SC-фолбэка: нет Плюса/трек недоступен → loadPlay просто скипнет его;
//   • без персиста между перезапусками;
//   • роутинг «SC vs Яндекс» решает источник из localStorage `bloom_wave_source`.

import { host } from "./host";
import { t as i18nT } from "@shared/i18n";
import type { Track } from "./types";
import { toTrack } from "@features/yandex/model/mappers";
import { ymWaveTracks, ymWaveFeedback, ymIsAuthed, type YmRawTrack } from "@features/yandex/api/ymClient";
import { ymResolveStream } from "@features/yandex/model/provider";

const REFILL_THRESHOLD = 4;  // догружаем батч, когда впереди осталось ≤ N треков
const PREFETCH_AHEAD = 3;    // прогрев стримов следующих треков (мгновенный Next)
const SKIP_RATIO = 0.3;      // < этой доли длительности → «skip», иначе «trackFinished»

interface RotorState {
  batchId: string;
  lastId: string;     // id последнего трека из rotor — курсор для следующего батча
  gen: number;        // поколение сессии (защита от гонок refill/start)
  refilling: boolean;
}

let state: RotorState | null = null;

function isWaveSource(): boolean {
  return host.curSource?.type === "wave";
}

/** Сессия rotor существует (вне зависимости от текущего источника). */
export function isRunning(): boolean {
  return !!state;
}

/** Сессия активна И плеер всё ещё в волне (юзер не ушёл на плейлист/любимое). */
export function isActive(): boolean {
  return !!state && isWaveSource();
}

function fb(event: string, trackId = "", played = 0): void {
  void ymWaveFeedback(event, trackId, state?.batchId ?? "", played);
}

// raw → Track, закрепляем в реестре (pushTempTrack кладёт как постоянный, чтобы
// clearTemp не выкинул) и возвращаем сквозной id для очереди.
function adopt(raw: YmRawTrack): string | null {
  const t: Track = toTrack(raw);
  host.pushTempTrack(t);
  return t.id;
}

// Прогрев стримов следующих PREFETCH_AHEAD треков — чтобы «Next» был без ожидания.
function prefetch(): void {
  for (let i = 1; i <= PREFETCH_AHEAD; i++) {
    const id = host.queue[host.qIdx + i];
    if (!id) break;
    const t = host.trackById(id);
    if (t) void ymResolveStream(t);
  }
}

/** Старт «Моей волны» Яндекса. Возвращает true, если волна реально пошла. */
export async function start(): Promise<boolean> {
  if (!(await ymIsAuthed().catch(() => false))) {
    host.toast(i18nT("wave.toast.ymNoAuth"), "warn");
    return false;
  }

  let batch;
  try {
    batch = await ymWaveTracks();
  } catch (e) {
    host.toast(i18nT("wave.toast.ymError", { msg: (e as Error)?.message ?? String(e) }), "error");
    return false;
  }
  const raws = batch?.tracks ?? [];
  if (!raws.length) {
    host.toast(i18nT("wave.toast.ymEmpty"), "warn");
    return false;
  }

  // Чистим очередь ДО построения (как SC-волна) — иначе старая очередь мешает.
  host.queue = [];
  host.qIdx = 0;

  const ids: string[] = [];
  for (const raw of raws) {
    const id = adopt(raw);
    if (id) ids.push(id);
  }
  if (!ids.length) return false;

  state = {
    batchId: batch.batchId || "",
    lastId: String(raws[raws.length - 1]!.id),
    gen: (state?.gen ?? 0) + 1,
    refilling: false,
  };

  host.queue = ids;
  host.qIdx = 0;
  host.curSource = { type: "wave", label: i18nT("wave.title") };
  host.shuffle = false; // волна сама задаёт порядок

  fb("radioStarted");
  host.loadPlay(ids[0]!);
  fb("trackStarted", String(raws[0]!.id));
  prefetch();
  return true;
}

/** Засчитан старт трека (из creditPlay на 90%/ended): фидбек + догрузка батча. */
export function onTrackStart(id: string): void {
  if (!isActive()) return;
  const t = host.trackById(id);
  if (t?.ymTrackId) fb("trackStarted", t.ymTrackId);
  void maybeRefill();
  prefetch();
}

/** Уход с трека (finish/skip по фактически проигранному) — обучает станцию. */
export function onFinish(trackId: string, playedSec: number, durSec: number): void {
  if (!isActive()) return;
  const t = host.trackById(trackId);
  if (!t?.ymTrackId) return;
  const ratio = durSec > 0 ? playedSec / durSec : 0;
  const event = ratio < SKIP_RATIO ? "skip" : "trackFinished";
  fb(event, t.ymTrackId, playedSec);
}

/** Юзер ушёл из волны (сменился источник) — тихо завершаем rotor-сессию. */
export function endIfLeftWave(): void {
  if (state && !isWaveSource()) end();
}

/** Завершить rotor-сессию. */
export function end(): void {
  state = null;
}

let refillInFlight = false;
async function maybeRefill(): Promise<void> {
  if (!state || state.refilling || refillInFlight) return;
  const remaining = host.queue.length - 1 - host.qIdx;
  if (remaining > REFILL_THRESHOLD) return;

  refillInFlight = true;
  state.refilling = true;
  const gen = state.gen;
  try {
    const batch = await ymWaveTracks(state.lastId || "");
    // Сессия могла смениться/закончиться, пока ждали Rust — не пишем в чужую очередь.
    if (!state || state.gen !== gen || !isWaveSource()) return;
    if (batch?.batchId) state.batchId = batch.batchId;
    const raws = batch?.tracks ?? [];
    if (!raws.length) return;
    const ids: string[] = [];
    for (const raw of raws) {
      const id = adopt(raw);
      if (id && !host.queue.includes(id)) ids.push(id);
    }
    if (ids.length) host.queue = [...host.queue, ...ids];
    state.lastId = String(raws[raws.length - 1]!.id);
  } catch {
    /* best-effort: следующая смена трека попробует снова */
  } finally {
    refillInFlight = false;
    if (state) state.refilling = false;
  }
}
