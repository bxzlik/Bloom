// «Лица волны» — обложки для кольца «Моей волны» на главной (вид `ring`).
//
// Это НЕ библиотека: показываем то, что реально играло бы в волне ВЫБРАННОЙ
// площадки, поэтому переключатель SC/Яндекс меняет и содержимое кольца:
//   • sc → related-треки нескольких личных сидов (тот же источник, из которого
//     движок собирает батч);
//   • ym → батч rotor'а `user:onyourwave` (та же станция, что и «Моя волна»).
//
// Превью НЕ трогает состояние настоящей волны: ни сессии, ни курсоров станций
// (`advanceStationCursor`), ни пометок «показано» (`markShown`) — только
// кэшируемые GET'ы. Поэтому здесь не используется engine.buildBatch: он требует
// активной сессии и двигает курсоры.

import { host } from "./host";
import { pickDisplaySeeds, scIdOf } from "./seeds";
import { scRelated } from "./sources";
import { scRawToTrack } from "./engine";
import { toTrack as ymToTrack } from "@features/yandex/model/mappers";
import { ymWaveTracks, ymIsAuthed } from "@features/yandex/api/ymClient";
import type { ScRawTrack } from "./types";

/** Плитка кольца: id для запуска волны + обложка и название для подписи. */
export interface WaveFace {
  id: string;
  cover: string;
  name: string;
}

const TTL = 20 * 60 * 1000;
/** Сколько личных сидов раскрываем через related. Каждый = отдельный запрос к SC. */
const SC_SEEDS = 3;

// Кэш держим В ПАМЯТИ, а не в localStorage: id гостевых треков живут в реестре
// только до перезапуска, и сохранённые «лица» после рестарта указывали бы в
// никуда (клик по плитке → «Не нашёл трек для волны»).
const cache = new Map<string, { at: number; faces: WaveFace[] }>();
const inflight = new Map<string, Promise<WaveFace[]>>();

/**
 * Обложки для кольца выбранной площадки. Пустой массив = не удалось получить
 * (нет сети / не залогинен / у сидов нет scId) — вызывающий сам решает, что
 * показать вместо них.
 */
export function fetchWaveFaces(source: "sc" | "ym", limit = 8): Promise<WaveFace[]> {
  const hit = cache.get(source);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.faces);
  const cur = inflight.get(source);
  if (cur) return cur;

  const p = (source === "ym" ? ymFaces(limit) : scFaces(limit))
    .catch((e) => {
      console.warn("[wave] faces failed:", e);
      return [] as WaveFace[];
    })
    .then((faces) => {
      // Пустой результат не кэшируем: почти всегда это транзиентный сбой сети,
      // иначе кольцо застряло бы пустым на весь TTL.
      if (faces.length) cache.set(source, { at: Date.now(), faces });
      inflight.delete(source);
      return faces;
    });
  inflight.set(source, p);
  return p;
}

/** Сбросить кэш (например, после смены аккаунта Яндекса). */
export function resetWaveFaces(): void {
  cache.clear();
}

// ── SoundCloud ──────────────────────────────────────────────────────────────

function adoptSc(raw: ScRawTrack): { id: string; cover: string; name: string } | null {
  const id = `sc_${raw.id}`;
  const existing = host.trackById(id);
  const t = existing ?? scRawToTrack(raw);
  if (!existing) host.pushTempTrack(t);
  if (!t.cover) return null;
  return { id: t.id, cover: t.cover, name: t.name };
}

async function scFaces(limit: number): Promise<WaveFace[]> {
  const seeds: string[] = [];
  for (const id of pickDisplaySeeds(24)) {
    const scId = scIdOf(host.trackById(id));
    if (scId && !seeds.includes(scId)) seeds.push(scId);
    if (seeds.length === SC_SEEDS) break;
  }
  if (!seeds.length) return [];

  const batches = await Promise.all(seeds.map((s) => scRelated(s).catch(() => [] as ScRawTrack[])));

  // Чередуем сиды по кругу: иначе всё кольцо соберётся из related одного трека.
  const out: WaveFace[] = [];
  const seen = new Set<string>();
  const deepest = Math.max(0, ...batches.map((b) => b.length));
  for (let i = 0; i < deepest && out.length < limit; i++) {
    for (const b of batches) {
      const raw = b[i];
      if (!raw) continue;
      const face = adoptSc(raw);
      if (!face || seen.has(face.id)) continue;
      seen.add(face.id);
      out.push(face);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// ── Яндекс ──────────────────────────────────────────────────────────────────

async function ymFaces(limit: number): Promise<WaveFace[]> {
  if (!(await ymIsAuthed().catch(() => false))) return [];
  const batch = await ymWaveTracks("user:onyourwave");
  const out: WaveFace[] = [];
  const seen = new Set<string>();
  for (const raw of batch?.tracks ?? []) {
    const t = ymToTrack(raw);
    host.pushTempTrack(t);
    if (!t.cover || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({ id: t.id, cover: t.cover, name: t.name });
    if (out.length >= limit) break;
  }
  return out;
}
