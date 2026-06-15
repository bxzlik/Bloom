// Состояние сеанса волны + сохранение/восстановление в localStorage.

import { host } from "./host";
import type { WaveSession, WaveMode, Track } from "./types";

const KEY = "bloom_wave_state";
const CURSORS_KEY = "bloom_wave_station_offsets";

// Глобальные курсоры пагинации SC-станций — переживают конец сеанса.
// Иначе каждая новая волна стартует с offset=0 для тех же сидов → одни и те же треки.
function loadGlobalCursors(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CURSORS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveGlobalCursors(cursors: Record<string, number>): void {
  try { localStorage.setItem(CURSORS_KEY, JSON.stringify(cursors)); } catch {}
}

interface PersistedState {
  session: WaveSession;
  queue: string[];
  qIdx: number;
  savedAt: number;
  // Объекты гостевых SC-треков из очереди — без них после перезахода id-шники в queue ни на что не ссылаются.
  guestTracks?: Track[];
}

let current: WaveSession | null = null;

export function getSession(): WaveSession | null { return current; }

export function startSession(mode: WaveMode, seeds: string[]): WaveSession {
  current = {
    mode,
    seeds,
    startedAt: Date.now(),
    playedIds: [],
    bonusArtists: {},
    sessionDislikedArtists: [],
    scStationCursor: loadGlobalCursors(), // продолжаем с того места, где остановилась прошлая волна
  };
  return current;
}

export function endSession(): void {
  current = null;
  try { localStorage.removeItem(KEY); } catch {}
}

export function persist(queue: string[], qIdx: number): void {
  if (!current) return;
  // Собираем full-объекты для гостевых треков очереди (они живут только в _tempTracksMap, не персистятся в IDB).
  const guestTracks: Track[] = [];
  for (const id of queue) {
    const t = host.trackById(id);
    if (t && t._scTemp) {
      // Лёгкая копия без bloob/url — url протух в любом случае.
      guestTracks.push({ ...t, url: null });
    }
  }
  const data: PersistedState = { session: current, queue, qIdx, savedAt: Date.now(), guestTracks };
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedState;
    if (!data?.session) return null;
    return data;
  } catch { return null; }
}

export function adoptPersisted(state: PersistedState): WaveSession {
  current = state.session;
  return current;
}

export function recordPlayed(id: string): void {
  if (!current) return;
  if (!current.playedIds.includes(id)) current.playedIds.push(id);
  if (current.playedIds.length > 200) current.playedIds.splice(0, current.playedIds.length - 200);
}

export function bumpArtistBonus(artistKey: string, delta: number): void {
  if (!current || !artistKey) return;
  current.bonusArtists[artistKey] = (current.bonusArtists[artistKey] ?? 0) + delta;
}

export function advanceStationCursor(scTrackId: string | number): number {
  if (!current) return 0;
  const k = String(scTrackId);
  const cur = current.scStationCursor[k] ?? 0;
  current.scStationCursor[k] = cur + 20;
  // Сохраняем глобально, чтобы следующая волна не начинала с того же offset.
  saveGlobalCursors(current.scStationCursor);
  return cur;
}

// Сброс курсора станции для конкретного сида — вызывается, когда /stations отдал пусто
// при ненулевом offset (значит, мы упёрлись в хвост — можно начать сначала).
export function resetStationCursor(scTrackId: string | number): void {
  const k = String(scTrackId);
  if (current) {
    if (!current.scStationCursor[k]) return;
    delete current.scStationCursor[k];
    saveGlobalCursors(current.scStationCursor);
  } else {
    const all = loadGlobalCursors();
    if (!all[k]) return;
    delete all[k];
    saveGlobalCursors(all);
  }
}

export function isActive(): boolean { return current !== null; }
