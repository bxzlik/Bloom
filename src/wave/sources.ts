// Обёртки над SoundCloud API v2: stations/track:{id} и tracks/{id}/related.
// Реализуют последовательный rate-limit, in-memory кэш ответов на сеанс,
// и единичный retry с бэкоффом при 429/сетевых сбоях.

import { host } from "./host";
import type { ScRawTrack } from "./types";

const STATION_TTL_MS = 5 * 60 * 1000;
const RELATED_TTL_MS = 10 * 60 * 1000;
const MIN_REQUEST_GAP_MS = 150;
const RETRY_DELAY_MS = 2000;

interface ScCollectionResponse {
  collection?: Array<{ track?: ScRawTrack } & Partial<ScRawTrack>>;
  next_href?: string | null;
}

interface CacheEntry<T> { at: number; data: T; }

const stationCache = new Map<string, CacheEntry<ScRawTrack[]>>();
const relatedCache = new Map<string, CacheEntry<ScRawTrack[]>>();

let lastRequestAt = 0;
let queueP: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Все исходящие SC-запросы идут через эту очередь, чтобы не словить 429.
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const gap = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (gap > 0) await sleep(gap);
    lastRequestAt = Date.now();
    return fn();
  };
  const p = queueP.then(run, run);
  queueP = p.catch(() => {});
  return p;
}

function is429(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err ?? "");
  return /429|too\s*many/i.test(s);
}

async function scGet<T>(url: string): Promise<T> {
  return enqueue(async () => {
    try {
      return await host.sc.apiFetch<T>(url);
    } catch (e) {
      if (!is429(e)) throw e;
      await sleep(RETRY_DELAY_MS);
      return host.sc.apiFetch<T>(url);
    }
  });
}

// SC отдаёт треки в двух форматах: либо прямо ScRawTrack, либо { track: ScRawTrack } внутри station-collection.
function normalizeCollection(resp: ScCollectionResponse | ScRawTrack[]): ScRawTrack[] {
  const items = Array.isArray(resp) ? resp : (resp.collection ?? []);
  const out: ScRawTrack[] = [];
  for (const it of items) {
    const t = (it as { track?: ScRawTrack }).track ?? (it as ScRawTrack);
    if (t && typeof t.id === "number" && t.title) out.push(t);
  }
  return out;
}

export async function scStation(scTrackId: string | number, offset = 0): Promise<ScRawTrack[]> {
  const key = `${scTrackId}@${offset}`;
  const hit = stationCache.get(key);
  if (hit && Date.now() - hit.at < STATION_TTL_MS) return hit.data;
  const url = `https://api-v2.soundcloud.com/stations/soundcloud:track-stations:${scTrackId}/tracks?limit=20&offset=${offset}`;
  try {
    const resp = await scGet<ScCollectionResponse | ScRawTrack[]>(url);
    const data = normalizeCollection(resp);
    // Кэшируем только непустой успех. Пустоту/ошибки не запоминаем — иначе сетевой сбой
    // или временный CORS-фейл травит кэш на 5 минут и волна тихо ничего не возвращает.
    if (data.length) stationCache.set(key, { at: Date.now(), data });
    return data;
  } catch { return []; }
}

export async function scRelated(scTrackId: string | number): Promise<ScRawTrack[]> {
  const key = String(scTrackId);
  const hit = relatedCache.get(key);
  if (hit && Date.now() - hit.at < RELATED_TTL_MS) return hit.data;
  const url = `https://api-v2.soundcloud.com/tracks/${scTrackId}/related?limit=20`;
  try {
    const resp = await scGet<ScCollectionResponse | ScRawTrack[]>(url);
    const data = normalizeCollection(resp);
    if (data.length) relatedCache.set(key, { at: Date.now(), data });
    return data;
  } catch { return []; }
}

export function resetWaveSourceCache(): void {
  stationCache.clear();
  relatedCache.clear();
}
