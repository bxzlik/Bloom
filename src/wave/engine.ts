// Ядро движка волны: сборка пула, фильтры, скоринг, очередь, расширение «на лету».

import { t as i18nT } from "@shared/i18n";
import { host } from "./host";
import { scStation, scRelated } from "./sources";
import {
  candidateFromSc, candidateFromLib, passesFilters, scoreCandidate, antiClumpByArtist,
} from "./scoring";
import * as session from "./session";
import { pickFamiliarPool, scIdOf } from "./seeds";
import type { Candidate, ScRawTrack, Track, WaveMode } from "./types";
import { tagsFromList } from "../db/track-meta";
import { markShown } from "../db/shown";

const BATCH = 20;
const REFILL_THRESHOLD = 5;
const FAMILIAR_RATIO = 0.2; // 20% знакомых из библиотеки в «Моей волне»
const DROP_RECENT_DAYS = 7;

// Маркер источника очереди для интеграции с UI.
export const WAVE_SOURCE_TYPE = "wave";

// Глубина пре-резолва стрим-URL: сколько грядущих треков очереди начать качать сразу.
// 3 — баланс: на «Next» уже всё готово, но не упираемся в SC API при старте.
const PREFETCH_AHEAD = 3;

// Пре-резолв стрим-URL'ов для следующих PREFETCH_AHEAD треков после qIdx.
// Вызывается после старта волны и после каждой смены трека — чтобы «Next» был мгновенным.
export function prefetchUpcoming(): void {
  const out: Track[] = [];
  for (let i = 1; i <= PREFETCH_AHEAD; i++) {
    const id = host.queue[host.qIdx + i];
    if (!id) break;
    const t = host.trackById(id);
    if (t) out.push(t);
  }
  host.prefetchStreams(out);
}

// Человеко-читаемый лейбл для curSource.label.
export function waveLabel(mode: WaveMode): string {
  switch (mode) {
    case "personal": return i18nT("wave.title");
    case "queue":    return i18nT("wave.label.queue");
    case "track":    return i18nT("wave.label.track");
    case "artist":   return i18nT("wave.label.artist");
  }
}

// Преобразовать ScRawTrack в виртуальный Track — точно такой же по форме,
// как тот, что создаёт SC-поиск в _scPlayPanelQueue. Иначе UI считает гостя
// «не таким как из поиска» и часть действий ломается.
function scRawToTrack(raw: ScRawTrack): Track {
  const dur = host.fmtDur(raw.duration ?? 0);
  const pm = (raw as unknown as { publisher_metadata?: { explicit?: boolean; publisher?: string; album_title?: string; artist?: string }; label_name?: string }).publisher_metadata;
  const labelName = (raw as unknown as { label_name?: string }).label_name;
  const cover = raw.artwork_url ? raw.artwork_url.replace("-large", "-t500x500") : null;
  const avatar = raw.user?.avatar_url ? raw.user.avatar_url.replace("-large", "-t300x300") : null;
  return {
    id: "sc_" + raw.id,
    name: raw.title,
    artist: raw.user?.username ?? "Unknown",
    album: pm?.album_title ?? "",
    publisher: labelName || pm?.publisher || "",
    dur,
    cover,
    url: null,
    fav: false,
    playCount: 0,
    addedAt: Date.now(),
    description: raw.description ?? "",
    explicit: !!pm?.explicit,
    creditedArtist: pm?.artist ?? "",
    artistAvatar: avatar,
    artistPermalink: raw.user?.permalink_url ?? null,
    artistVerified: !!raw.user?.verified,
    genres: [raw.genre, ...tagsFromList(raw.tag_list)].filter(Boolean) as string[],
    year: ((raw.release_date ?? raw.display_date) ?? "").slice(0, 4),
    _sc: true,
    _scIsHls: false,
    _scTemp: true,
    scTrackId: raw.id,
    scId: raw.id,
    scPermalink: raw.permalink_url,
    scMedia: raw.media ?? null,
  };
}

// Собрать «жанровый отпечаток» сидов — для скоринга.
function seedGenres(seedIds: string[]): Set<string> {
  const set = new Set<string>();
  for (const id of seedIds) {
    const t = host.trackById(id);
    if (!t?.genres) continue;
    for (const g of t.genres) if (g) set.add(g.toLowerCase());
  }
  return set;
}

interface FetchResult {
  candidates: Candidate[];
  // scId сидов, которые реально вернули треки от /stations — только для них имеет смысл
  // двигать курсор. Если ответ пустой / упал — оставляем offset как был, иначе курсор «уплывает»
  // и следующая попытка тянет из заведомо пустого диапазона.
  stationProducers: Set<string>;
}

// Параллельно (но через rate-limit) тянем кандидатов от каждого сида.
async function fetchCandidatesFromSeeds(
  seedIds: string[],
  offsets: Record<string, number>,
): Promise<FetchResult> {
  const all: Candidate[] = [];
  const seen = new Set<string>();
  const stationProducers = new Set<string>();
  for (const sid of seedIds) {
    const t = host.trackById(sid);
    const scId = scIdOf(t);
    if (!scId) continue;
    const offset = offsets[scId] ?? 0;
    // Источник 1: station
    let station = await scStation(scId, offset);
    // Курсор «уплыл» — станция исчерпана. Сбрасываем и пробуем с offset=0,
    // чтобы пользователь не застревал в волне навсегда после долгих сессий.
    if (!station.length && offset > 0) {
      session.resetStationCursor(scId);
      station = await scStation(scId, 0);
    }
    if (station.length) stationProducers.add(scId);
    station.forEach((raw, i) => {
      const c = candidateFromSc(raw, "station", i);
      if (c && !seen.has(c.id)) { seen.add(c.id); all.push(c); }
    });
    // Источник 2: related — дергаем всегда. /related не пагинируется, но для трекового режима
    // это главный источник вкусовых рекомендаций; пропускать его на ненулевом offset — терять
    // половину выдачи.
    const rel = await scRelated(scId);
    rel.forEach((raw, i) => {
      const c = candidateFromSc(raw, "related", i);
      if (c && !seen.has(c.id)) { seen.add(c.id); all.push(c); }
    });
  }
  return { candidates: all, stationProducers };
}

interface BuildBatchOpts {
  mode: WaveMode;
  seeds: string[];
  takeCount: number;
}

async function buildBatch(opts: BuildBatchOpts): Promise<Candidate[]> {
  const s = session.getSession();
  if (!s) return [];

  // Запросить кандидатов и сдвинуть курсор станции только для тех сидов, что реально что-то отдали.
  const offsets: Record<string, number> = {};
  for (const id of opts.seeds) {
    const scId = scIdOf(host.trackById(id));
    if (scId) offsets[scId] = s.scStationCursor[scId] ?? 0;
  }
  const { candidates: fresh, stationProducers } = await fetchCandidatesFromSeeds(opts.seeds, offsets);
  for (const scId of stationProducers) {
    session.advanceStationCursor(scId);
  }

  // Подмешиваем библиотеку только для personal.
  let withLib: Candidate[] = fresh;
  if (opts.mode === "personal") {
    const exclude = new Set<string>([...s.playedIds, ...host.queue]);
    const familiarN = Math.max(1, Math.round(opts.takeCount * FAMILIAR_RATIO));
    const fam = pickFamiliarPool(exclude, familiarN * 2);
    withLib = fresh.concat(fam.map((t, i) => candidateFromLib(t, i)));
  }

  const ctx = {
    seedGenres: seedGenres(opts.seeds),
    session: s,
    dropRecentDays: DROP_RECENT_DAYS,
    curId: host.curId,
    bonusArtists: s.bonusArtists,
  };

  let filtered = withLib.filter(c => passesFilters(c, ctx));
  // Fallback: если строгие фильтры вырезали всё — пробуем ослабленный проход (без wasShown/recentlyPlayed).
  // Иначе при «закопчённом» bloom_wave_shown пользователь получает глухой toast навсегда.
  if (!filtered.length) {
    const relaxedCtx = { ...ctx, relaxed: true };
    filtered = withLib.filter(c => passesFilters(c, relaxedCtx));
  }
  filtered.sort((a, b) => scoreCandidate(b, ctx) - scoreCandidate(a, ctx));

  // Шахматка для personal: чередуем гостей и библиотеку, чтобы знакомые шли через одного.
  let ordered = filtered;
  if (opts.mode === "personal") {
    const guests = filtered.filter(c => c.origin !== "library");
    const libs = filtered.filter(c => c.origin === "library");
    ordered = [];
    let gi = 0, li = 0, step = 0;
    while (gi < guests.length || li < libs.length) {
      // 4 гостя : 1 библиотечный (≈80/20)
      const wantLib = step % 5 === 4;
      if (wantLib && li < libs.length) { ordered.push(libs[li++]); }
      else if (gi < guests.length) { ordered.push(guests[gi++]); }
      else if (li < libs.length) { ordered.push(libs[li++]); }
      step++;
    }
  }

  const clean = antiClumpByArtist(ordered);
  return clean.slice(0, opts.takeCount);
}

// Найти трек в библиотеке по scId (на случай, если id-форматы разошлись).
function findLibByScId(scId: string | number): Track | undefined {
  const key = String(scId);
  return host.tracks.find(t =>
    !t._scTemp && (String(t.scId ?? "") === key || String(t.scTrackId ?? "") === key),
  );
}

// Положить кандидата в `tracks` (как гостевого), вернуть готовый Track.
function adoptCandidate(c: Candidate): Track | null {
  if (c.origin === "library") return c.libTrack ?? null;
  if (!c.raw) return null;
  // Сначала — прямое совпадение по id (sc_<scId>).
  let existing = host.trackById(c.id);
  // Если не нашли — ищем в библиотеке по scId. Это закрывает рассинхрон форматов.
  if (!existing) existing = findLibByScId(c.raw.id);
  if (existing) return existing;
  const t = scRawToTrack(c.raw);
  host.pushTempTrack(t);
  return t;
}

// Положить N кандидатов в очередь после curId.
export function enqueueBatch(batch: Candidate[]): number {
  let added = 0;
  for (const c of batch) {
    const t = adoptCandidate(c);
    if (!t) continue;
    if (host.queue.includes(t.id)) continue;
    host.queue.push(t.id);
    // Отмечаем как «показано в волне», чтобы не возвращалось в выдачу 14 дней.
    if (c.origin !== "library") markShown(t.id);
    added++;
  }
  if (added) {
    host.renderQueue();
    session.persist(host.queue, host.qIdx);
  }
  return added;
}

// Гард от параллельных стартов: двойной клик по «Моей волне»/«Волне по треку»
// иначе порождает две сессии, обе пишут в queue. Возвращаем true для уже идущего старта.
let startInFlight = false;

// Стартовый запуск волны.
export async function startWave(mode: WaveMode, seeds: string[]): Promise<boolean> {
  if (!seeds.length) return false;
  if (startInFlight) return false;
  startInFlight = true;
  try {
    // Чистим очередь ДО buildBatch — иначе старая очередь (например, SC-плейлист) фильтрует
    // свежих кандидатов через host.queue.includes(c.id) в passesFilters.
    host.queue = [];
    host.qIdx = 0;
    session.startSession(mode, seeds);
    let batch: Candidate[] = [];
    try {
      batch = await buildBatch({ mode, seeds, takeCount: BATCH });
    } catch (e) {
      // SC мог упасть с сетевой ошибкой — не роняем UI.
      console.warn("[wave] buildBatch failed:", e);
    }
    if (!batch.length) { session.endSession(); return false; }

    enqueueBatch(batch);

    if (!host.queue.length) { session.endSession(); return false; }
    host.curSource = { type: WAVE_SOURCE_TYPE, label: waveLabel(mode) };
    // Выключаем shuffle — волна сама выбирает порядок.
    host.shuffle = false;
    host.loadPlay(host.queue[0]);
    session.persist(host.queue, host.qIdx);
    // Пре-резолв URL'ов следующих треков — чтобы «Next» сразу же был мгновенным.
    prefetchUpcoming();
    return true;
  } finally {
    startInFlight = false;
  }
}

// Догрузить очередь, если впереди осталось мало треков.
let refillInFlight = false;
export async function maybeRefill(): Promise<void> {
  const s = session.getSession();
  if (!s) return;
  if (refillInFlight) return;
  const remaining = host.queue.length - 1 - host.qIdx;
  if (remaining > REFILL_THRESHOLD) return;

  refillInFlight = true;
  try {
    // Сиды для дозагрузки: 2–3 последних, которые юзер не скипнул.
    const recent = s.playedIds.slice(-6);
    const goodTail = recent.filter(id => {
      const t = host.trackById(id);
      return t && !t.disliked;
    });
    const seeds = goodTail.length ? goodTail.slice(-3) : s.seeds;

    let batch: Candidate[] = [];
    try {
      batch = await buildBatch({ mode: s.mode, seeds, takeCount: BATCH });
    } catch (e) {
      console.warn("[wave] refill buildBatch failed:", e);
    }
    // Сессия могла закончиться, пока мы ждали SC — не пишем в чужую очередь.
    if (!session.isActive()) return;
    if (batch.length) enqueueBatch(batch);
  } finally {
    refillInFlight = false;
  }
}

