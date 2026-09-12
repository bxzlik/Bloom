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
 * отвечает по `useHistoryStore` — цифры будут занижены, но UI не мигает и
 * ничего не падает.
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
 * Свёртка старых записей в карты — строится один раз при первом обращении.
 * Раньше это были линейные проходы по массиву на КАЖДЫЙ вызов, что незаметно
 * для одиночной проверки, но не для сортировки библиотеки «по прослушиваниям»:
 * там `playCount` зовётся на каждое сравнение.
 */
let legacyMaps: { count: Map<string, number>; lastTs: Map<string, number> } | null = null;

function legacyIndex(): { count: Map<string, number>; lastTs: Map<string, number> } {
  if (legacyMaps) return legacyMaps;
  const count = new Map<string, number>();
  const lastTs = new Map<string, number>();
  for (const e of legacyEntries()) {
    count.set(e.id, (count.get(e.id) ?? 0) + (e.count ?? 1));
    if (e.ts > (lastTs.get(e.id) ?? 0)) lastTs.set(e.id, e.ts);
  }
  legacyMaps = { count, lastTs };
  return legacyMaps;
}

/** Сколько записей в старой истории приходится на трек (фолбэк). */
function legacyCount(id: string): number {
  return legacyIndex().count.get(id) ?? 0;
}

/** Когда трек звучал в последний раз по старой истории (0 — не звучал). */
function legacyLastTs(id: string): number {
  return legacyIndex().lastTs.get(id) ?? 0;
}

/**
 * Совместимость со старыми установками. Журнал появился позже истории, поэтому
 * у давнего пользователя часть треков есть в истории, но не в журнале. Правило:
 * есть хоть одно событие в журнале — верим журналу целиком (он точнее и полнее);
 * нет ни одного — берём, что помнит история. Складывать нельзя: период у них
 * пересекается, и общие треки посчитались бы дважды.
 */
function tsOf(id: string): number[] | null {
  const arr = byTrack.get(id);
  return arr && arr.length ? arr : null;
}

/** Сколько всего раз слушали трек. */
export function playCount(id: string): number {
  const arr = tsOf(id);
  return arr ? arr.length : legacyCount(id);
}

/** Когда трек звучал в последний раз (0 — не звучал ни разу). */
export function lastPlayedAt(id: string): number {
  const arr = tsOf(id);
  return arr ? arr[arr.length - 1]! : legacyLastTs(id);
}

/** Звучал ли трек за последние `days` дней. */
export function recentlyPlayed(id: string, days = 7): boolean {
  const last = lastPlayedAt(id);
  return last > 0 && last >= Date.now() - days * 86_400_000;
}

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

/** Сколько раз трек звучал начиная с момента `sinceTs`. */
export function playsSince(id: string, sinceTs: number): number {
  const arr = tsOf(id);
  if (!arr) return legacyLastTs(id) >= sinceTs ? legacyCount(id) : 0;
  return arr.length - lowerBound(arr, sinceTs);
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
  if (!warmed) {
    return legacyEntries().map(e => ({
      id: e.id,
      plays: e.count ?? 1,
      lastTs: e.ts,
      firstTs: e.ts,
    }));
  }
  const rows: TopPlayed[] = [];
  for (const [id, arr] of byTrack) {
    rows.push({ id, plays: arr.length, lastTs: arr[arr.length - 1]!, firstTs: arr[0]! });
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
  if (warmed) {
    for (const [id, arr] of byTrack) {
      const plays = since ? arr.length - lowerBound(arr, since) : arr.length;
      if (plays < minPlays) continue;
      rows.push({ id, plays, lastTs: arr[arr.length - 1]!, firstTs: arr[0]! });
    }
  } else {
    // Фолбэк до прогрева: история знает только суммарный count и последний ts,
    // так что окно приблизительное — по дате последнего прослушивания.
    for (const e of legacyEntries()) {
      if (since && e.ts < since) continue;
      const plays = e.count ?? 1;
      if (plays < minPlays) continue;
      rows.push({ id: e.id, plays, lastTs: e.ts, firstTs: e.ts });
    }
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

  const cut = (id: string): number => Math.max(before, byId[id] ?? 0);

  for (const [id, arr] of byTrack) {
    const from = cut(id);
    const i = from ? lowerBound(arr, from) : 0;
    const count = arr.length - i;
    if (count <= 0) continue;
    rows.push({ id, ts: arr[arr.length - 1]!, count });
  }

  // Хвост из старых записей: журнал появился позже истории, и у давнего
  // пользователя часть треков есть только в ней. Без этого переход на журнал
  // молча обрубил бы историю по дате появления «Итогов».
  for (const e of legacyEntries()) {
    if (byTrack.has(e.id)) continue;
    if (e.ts <= cut(e.id)) continue;
    rows.push({ id: e.id, ts: e.ts, count: e.count ?? 1 });
  }

  rows.sort((a, b) => b.ts - a.ts);
  return rows;
}

/**
 * Забыть накопленное — часть «Очистить статистику» рядом с `clearPlayLog`.
 * `warmed` намеренно НЕ сбрасываем: после очистки пустая карта — это правда, а
 * не «ещё не прочитали», и падать на старую историю тут нельзя.
 *
 * Старую историю стираем тоже. Фолбэк в `tsOf` включается у трека без событий в
 * журнале — а после очистки таких ВСЕ, и без этого `playCount`/`recentlyPlayed`
 * отвечали бы по допотопным записям: сиды волны, её фильтр «недавно слушал» и
 * умная перемешка жили бы на статистике, которую пользователь только что
 * удалил. Список «История» от этого не меняется — после очистки её рубеж и так
 * прячет старые записи. Кэши — модульные, их тоже в ноль, иначе ключ ушёл бы из
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
  legacyMaps = null;
  bump();
}
