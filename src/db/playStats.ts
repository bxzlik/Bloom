// Общая статистика прослушиваний: «сколько раз» и «когда в последний раз».
//
// Единственный источник правды для всего, что опирается на историю слушания —
// сиды и фильтры волны, умная перемешка, статистика профиля, витрина «Для вас».
// Раньше каждый считал сам по `useHistoryStore`, а тот держит ОДНУ запись на
// трек с лимитом 200 и вытеснением по давности: трек, отыгранный три сотни раз
// полгода назад, выпадал целиком вместе со счётчиком, и «топ по прослушиваниям»
// превращался в «топ среди двух сотен недавних». Здесь читается `db/playLog` —
// сырой поток событий на 60 000 записей (годы плотного слушания) с датами.
//
// Почему синхронное API поверх асинхронной IDB. `recentlyPlayed` вызывается на
// каждого кандидата в фильтре волны, `smartShuffleWeight` — на каждый трек
// библиотеки при перемешке; ходить оттуда в IndexedDB нельзя. Поэтому журнал
// один раз сворачивается в память (`warmPlayStats`), а дальше всё читается из
// неё; новые прослушивания дописываются из `creditPlay` через `notePlay`.

import { loadPlayLog, type PlayMeta } from "./playLog";

/**
 * Старые записи истории (`bloom_play_history`) читаем НАПРЯМУЮ из хранилища, а
 * не через `useHistoryStore`: сам список истории теперь выводится отсюда же, и
 * обращение к его стору замкнуло бы зависимость в кольцо. Заодно честнее — это
 * именно доступ к унаследованным данным, а не к живому стору.
 */
const LEGACY_KEY = "bloom_play_history";

interface LegacyEntry {
  id: string;
  ts: number;
  count?: number;
}

let legacyCache: LegacyEntry[] | null = null;

export function legacyEntries(): LegacyEntry[] {
  if (legacyCache) return legacyCache;
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    legacyCache = Array.isArray(raw)
      ? raw.filter((e): e is LegacyEntry =>
          e && typeof e.id === "string" && typeof e.ts === "number")
      : [];
  } catch {
    legacyCache = [];
  }
  return legacyCache;
}

/**
 * id трека → таймстампы его прослушиваний по возрастанию.
 *
 * Массив, а не просто счётчик: без дат нельзя ответить на «сколько раз за
 * последние 90 дней», а именно окно (а не «за всё время») нужно и сидам волны,
 * и «Для вас» — вкус двухлетней давности рекомендациям только мешает. По памяти
 * это дешевле сырых событий: 60k чисел в ~10k массивах против 60k объектов.
 */
const byTrack = new Map<string, number[]>();

/**
 * Снимки треков из журнала: `{name, artist, cover, sec, src}` на каждый когда-
 * либо игранный трек. Именно они позволяют показать историю за прошлый год —
 * `trackRegistry` живёт в памяти, а `trackCache`/`coverCache` вытесняются на
 * 300/400 записях, и без снимка старая строка просто не отрисовалась бы.
 * В отличие от событий, `meta` при переполнении не подрезается.
 */
const metaById = new Map<string, PlayMeta>();

/** Снимок трека из журнала (для отрисовки строки истории). */
export function playMeta(id: string): PlayMeta | undefined {
  return metaById.get(id);
}

/** Журнал прочитан и свёрнут. До этого все чтения падают на старую историю. */
let warmed = false;
let warming: Promise<void> | null = null;

/**
 * Подписка для React. Модуль не стор, но статистику показывает и UI (панель
 * профиля), а меняется она в двух местах: при прогреве и при каждом зачтённом
 * прослушивании. Версия + подписка дают `useSyncExternalStore` без затаскивания
 * zustand на слой `db`.
 */
const listeners = new Set<() => void>();
let version = 0;

function bump(): void {
  version++;
  for (const fn of listeners) fn();
}

export function subscribePlayStats(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function playStatsVersion(): number {
  return version;
}

/**
 * Свернуть журнал в память. Идемпотентно и безопасно к параллельным вызовам:
 * повторный вызов во время загрузки ждёт ту же промису.
 *
 * Вызывается один раз на старте приложения. Пока не разрешилась, статистика
 * отвечает по старой истории — цифры будут занижены, но UI не мигает и ничего
 * не падает.
 */
export function warmPlayStats(): Promise<void> {
  if (warmed) return Promise.resolve();
  if (warming) return warming;
  warming = loadPlayLog()
    .then(({ events, meta }) => {
      byTrack.clear();
      metaById.clear();
      for (const [id, m] of meta) metaById.set(id, m);
      // События приходят по возрастанию ts (индекс by-ts), поэтому массивы
      // получаются отсортированными сами — досортировывать не надо.
      for (const e of events) {
        const arr = byTrack.get(e.id);
        if (arr) arr.push(e.ts);
        else byTrack.set(e.id, [e.ts]);
      }
      warmed = true;
      bump();
    })
    .catch(() => {
      // Журнал не прочитался (приватный режим, битая база) — остаёмся на
      // фолбэке. Не бросаем: статистика не то, ради чего стоит ронять старт.
      warmed = false;
    })
    .finally(() => {
      warming = null;
    });
  return warming;
}

/** Засчитать прослушивание в память. Зовётся из `creditPlay` рядом с `logPlay`. */
export function notePlay(id: string, ts = Date.now()): void {
  if (!id) return;
  const arr = byTrack.get(id);
  if (arr) arr.push(ts);
  else byTrack.set(id, [ts]);
  bump();
}

/**
 * Старая история, свёрнутая в карту `id → {ts, count}` — строится один раз при
 * первом обращении. Не линейный проход на каждый вызов: при сортировке
 * библиотеки «по прослушиваниям» `playCount` зовётся на каждое сравнение.
 */
let legacyMap: Map<string, { ts: number; count: number }> | null = null;

function legacyIndex(): Map<string, { ts: number; count: number }> {
  if (legacyMap) return legacyMap;
  const map = new Map<string, { ts: number; count: number }>();
  for (const e of legacyEntries()) {
    const was = map.get(e.id);
    map.set(e.id, {
      ts: Math.max(was?.ts ?? 0, e.ts),
      count: (was?.count ?? 0) + (e.count ?? 1),
    });
  }
  legacyMap = map;
  return legacyMap;
}

/**
 * Зазор между записью истории и событием журнала об ОДНОМ прослушивании: с 2.0
 * по 3.0 `creditPlay` писал оба подряд, каждое своим `Date.now()`. Два
 * настоящих прослушивания одного трека за столько не случаются.
 */
const LEGACY_SLACK_MS = 5000;

/**
 * Индекс первого элемента `arr` со значением >= `x` (бинарный поиск).
 * Массив отсортирован по возрастанию, поэтому «сколько прослушиваний после
 * момента T» = `arr.length - lowerBound(arr, T)`.
 */
function lowerBound(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Индекс первого элемента `arr` со значением > `x`. */
function upperBound(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const NO_EVENTS: number[] = [];

/**
 * Прослушивания одного трека: события журнала плюс то, чего в журнале нет, но
 * помнит старая история.
 *
 * Совместимость со старыми установками. Журнал появился в 2.0, история — раньше,
 * и с 2.0 по 3.0 прослушивание писалось в ОБА места. Складывать их в лоб нельзя
 * — общий период посчитался бы дважды. Но пересечение известно точно: `ts`
 * записи истории — момент её последнего прослушивания, значит всё, что в журнале
 * до этого момента, в её `count` уже учтено. От истории берём только
 * недостающее (`extra`) — прослушивания до появления журнала.
 *
 * Прежнее правило «есть хоть одно событие в журнале — верим только журналу»
 * теряло именно их: трек, послушанный сотню раз до 2.0 и раз после, считался
 * послушанным один раз, а треки, звучавшие только до 2.0, после прогрева журнала
 * выпадали из статистики профиля и из топа вовсе.
 *
 * Та же формула работает и до прогрева: событий ещё нет, и `extra` — это весь
 * счётчик истории.
 */
interface TrackPlays {
  ts: number[];
  /** Когда трек последний раз попал в старую историю (0 — не попадал). */
  legacyTs: number;
  /** Прослушивания из старой истории, которых нет в журнале; отнесены к `legacyTs`. */
  extra: number;
}

function playsOf(id: string): TrackPlays | null {
  const ts = byTrack.get(id) ?? NO_EVENTS;
  const legacy = legacyIndex().get(id);
  if (!ts.length && !legacy) return null;
  const extra = legacy
    ? Math.max(0, legacy.count - upperBound(ts, legacy.ts + LEGACY_SLACK_MS))
    : 0;
  return { ts, legacyTs: legacy?.ts ?? 0, extra };
}

const countOf = (p: TrackPlays): number => p.ts.length + p.extra;

const lastOf = (p: TrackPlays): number =>
  Math.max(p.ts.length ? p.ts[p.ts.length - 1]! : 0, p.legacyTs);

const firstOf = (p: TrackPlays): number => {
  const fromLog = p.ts.length ? p.ts[0]! : 0;
  if (!p.extra || !p.legacyTs) return fromLog;
  return fromLog ? Math.min(fromLog, p.legacyTs) : p.legacyTs;
};

/** Все id, о которых есть хоть что-то: журнал и старая история. */
function knownIds(): Set<string> {
  return new Set([...byTrack.keys(), ...legacyIndex().keys()]);
}

/** Сколько всего раз слушали трек. */
export function playCount(id: string): number {
  const p = playsOf(id);
  return p ? countOf(p) : 0;
}

/** Когда трек звучал в последний раз (0 — не звучал ни разу). */
export function lastPlayedAt(id: string): number {
  const p = playsOf(id);
  return p ? lastOf(p) : 0;
}

/** Звучал ли трек за последние `days` дней. */
export function recentlyPlayed(id: string, days = 7): boolean {
  const last = lastPlayedAt(id);
  return last > 0 && last >= Date.now() - days * 86_400_000;
}

/** Сколько раз трек звучал начиная с момента `sinceTs`. */
export function playsSince(id: string, sinceTs: number): number {
  const p = playsOf(id);
  if (!p) return 0;
  return p.ts.length - lowerBound(p.ts, sinceTs) + (p.legacyTs >= sinceTs ? p.extra : 0);
}

export interface TopPlayed {
  id: string;
  plays: number;
  lastTs: number;
  /** Первое прослушивание — по нему считается разброс дней в статистике. */
  firstTs: number;
}

/**
 * Все треки, которые вообще когда-либо звучали, без сортировки и отсечек.
 * Нужен статистике профиля: ей считать суммы и топ артистов по всему объёму,
 * а не по верхушке.
 */
export function allPlayed(): TopPlayed[] {
  const rows: TopPlayed[] = [];
  for (const id of knownIds()) {
    const p = playsOf(id);
    if (!p) continue;
    const plays = countOf(p);
    if (plays <= 0) continue;
    rows.push({ id, plays, lastTs: lastOf(p), firstTs: firstOf(p) });
  }
  return rows;
}

/**
 * Самое слушаемое — по убыванию числа прослушиваний, при равенстве свежее выше.
 *
 * `sinceDays` сужает окно: «топ за три месяца» отражает текущий вкус, а «за всё
 * время» намертво держится за то, что человек заслушал когда-то. `minPlays`
 * отсекает случайные единичные заходы.
 */
export function topPlayed(
  opts: { sinceDays?: number; limit?: number; minPlays?: number } = {},
): TopPlayed[] {
  const { sinceDays, limit = 20, minPlays = 1 } = opts;
  const since = sinceDays ? Date.now() - sinceDays * 86_400_000 : 0;

  const rows: TopPlayed[] = [];
  for (const id of knownIds()) {
    const p = playsOf(id);
    if (!p) continue;
    const plays = since
      ? p.ts.length - lowerBound(p.ts, since) + (p.legacyTs >= since ? p.extra : 0)
      : countOf(p);
    if (plays < minPlays) continue;
    rows.push({ id, plays, lastTs: lastOf(p), firstTs: firstOf(p) });
  }

  rows.sort((a, b) => b.plays - a.plays || b.lastTs - a.lastTs);
  return rows.slice(0, limit);
}

/** Ряд списка «История»: как в старом сторе, чтобы потребители не менялись. */
export interface HistoryRow {
  id: string;
  /** Последнее прослушивание из ВИДИМОЙ части (скрытые отсечены). */
  ts: number;
  /** Сколько раз — тоже только по видимой части. */
  count: number;
}

/**
 * Ряды для списка «История», новые сверху.
 *
 * Скрытие задаётся отметками времени, а не списком id: «спрятать всё по момент
 * T». Так удаление ведёт себя ожидаемо — трек, убранный вчера и снова
 * прослушанный сегодня, возвращается в список сам, потому что новое событие
 * свежее отметки. Список id такого не умеет: он прятал бы трек навсегда.
 *
 * Статистику скрытие НЕ трогает: журнал остаётся целым, «Итоги» и цифры
 * профиля считаются по нему. История — это список, а не учёт.
 */
export function historyRows(
  hide: { before?: number; byId?: Record<string, number> } = {},
): HistoryRow[] {
  const before = hide.before ?? 0;
  const byId = hide.byId ?? {};
  const rows: HistoryRow[] = [];

  for (const id of knownIds()) {
    const p = playsOf(id);
    if (!p) continue;
    const from = Math.max(before, byId[id] ?? 0);
    // Видимые события журнала — с момента отметки; прослушивания из старой
    // истории — если сама запись свежее отметки.
    const count = from
      ? p.ts.length - lowerBound(p.ts, from) + (p.legacyTs > from ? p.extra : 0)
      : countOf(p);
    if (count <= 0) continue;
    rows.push({ id, ts: lastOf(p), count });
  }

  rows.sort((a, b) => b.ts - a.ts);
  return rows;
}

/**
 * Перенести прослушивания трека на новый id — «Сменить площадку»
 * (`replaceLibTrack`). Трек тот же, меняется только площадка: без переноса
 * счётчик новой версии начинался бы с нуля, «Итоги» показывали бы два трека, а
 * строка «Истории» так и играла бы старую площадку, от которой ушли.
 *
 * Здесь — память и старая история; сами события в IndexedDB переносит
 * `renamePlayLogTrack`.
 */
export function renamePlayStatsTrack(oldId: string, newId: string): void {
  if (!oldId || !newId || oldId === newId) return;
  let changed = false;

  const moved = byTrack.get(oldId);
  if (moved) {
    const into = byTrack.get(newId);
    byTrack.set(newId, into ? [...into, ...moved].sort((a, b) => a - b) : moved);
    byTrack.delete(oldId);
    changed = true;
  }

  const meta = metaById.get(oldId);
  if (meta) {
    if (!metaById.has(newId)) metaById.set(newId, { ...meta, id: newId });
    metaById.delete(oldId);
    changed = true;
  }

  const legacy = legacyEntries();
  if (legacy.some((e) => e.id === oldId)) {
    legacyCache = legacy.map((e) => (e.id === oldId ? { ...e, id: newId } : e));
    legacyMap = null;
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyCache));
    } catch {
      // Хранилище недоступно — в памяти перенос уже есть, до перезапуска хватит.
    }
    changed = true;
  }

  if (changed) bump();
}

/**
 * Забыть накопленное — часть «Очистить статистику» рядом с `clearPlayLog`.
 * `warmed` намеренно НЕ сбрасываем: после очистки пустая карта — это правда, а
 * не «ещё не прочитали», и падать на старую историю тут нельзя.
 *
 * Старую историю стираем тоже. Она дополняет журнал (`playsOf`) — а после
 * очистки дополнять нечего, и без этого `playCount`/`recentlyPlayed` отвечали
 * бы по допотопным записям: сиды волны, её фильтр «недавно слушал» и умная
 * перемешка жили бы на статистике, которую пользователь только что удалил.
 * Список «История» от этого не меняется — после очистки её рубеж и так прячет
 * старые записи. Кэши — модульные, их тоже в ноль, иначе ключ ушёл бы из
 * хранилища, а цифры остались в памяти до перезапуска.
 */
export function resetPlayStats(): void {
  byTrack.clear();
  metaById.clear();
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Хранилище недоступно — хотя бы в памяти забудем.
  }
  legacyCache = [];
  legacyMap = null;
  bump();
}
