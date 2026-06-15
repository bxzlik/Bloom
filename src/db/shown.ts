// Персистентный трекер «показано в волне за последние N дней».
// Используется фильтром, чтобы не возвращать в выдачу треки, которые юзер уже
// видел (даже если не доcлушал — этот случай playHistory не покрывает).

const KEY = "bloom_wave_shown";
const TTL_DAYS = 14;
const MAX_ENTRIES = 1000;

type ShownMap = Record<string, number>; // id → ts

let cache: ShownMap | null = null;
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): ShownMap {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as ShownMap) : {};
  } catch { cache = {}; }
  return cache;
}

function scheduleSave(): void {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty || !cache) return;
    dirty = false;
    // Подчищаем устаревшие
    const cutoff = Date.now() - TTL_DAYS * 24 * 3600 * 1000;
    const trimmed: ShownMap = {};
    const entries = Object.entries(cache).filter(([, ts]) => ts >= cutoff);
    // Если слишком много — оставляем самые свежие
    entries.sort((a, b) => b[1] - a[1]);
    entries.slice(0, MAX_ENTRIES).forEach(([id, ts]) => { trimmed[id] = ts; });
    cache = trimmed;
    try { localStorage.setItem(KEY, JSON.stringify(trimmed)); } catch {}
  }, 1500);
}

export function markShown(id: string): void {
  const m = load();
  m[id] = Date.now();
  scheduleSave();
}

export function wasShown(id: string, withinDays = TTL_DAYS): boolean {
  const m = load();
  const ts = m[id];
  if (!ts) return false;
  return Date.now() - ts < withinDays * 24 * 3600 * 1000;
}

export function clearShown(): void {
  cache = {};
  try { localStorage.removeItem(KEY); } catch {}
}
