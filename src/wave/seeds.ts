// Подбор сидов: для «Волны по треку» и «Моей волны».

import { host } from "./host";
import { playCountAll, recentlyPlayed } from "../db/history";
import type { Track } from "./types";

// SC track id (число/строка) у трека из библиотеки или гостя.
export function scIdOf(t: Track | undefined): string | null {
  if (!t) return null;
  const v = t.scId ?? t.scTrackId;
  return v != null ? String(v) : null;
}

// «Волна по треку»: сидом служит сам трек (1 шт.).
export function pickTrackSeeds(seedTrackId: string): string[] {
  const t = host.trackById(seedTrackId);
  if (!t) return [];
  return [seedTrackId];
}

// «Похожие на очередь»: адаптивно выбираем сиды из очереди.
//   ≤8 треков  → все
//   9–15       → 8, равномерно по позициям
//   16+        → 10, равномерно по позициям
// Кэп на 10: каждый сид = 2 SC-запроса (station + related) × rate-limit 150мс. 10 сидов ≈ 3с старта,
// больше — заметно тормозит, а покрытие при этом почти не растёт (related начинают пересекаться).
// Дизлайкнутые и треки без scId пропускаются ДО расчёта позиций — иначе шаг сместится.
export function pickQueueSeeds(queueIds: string[]): string[] {
  if (!queueIds.length) return [];
  // 1. Отбираем валидных кандидатов с сохранением порядка очереди.
  const valid: string[] = [];
  const seen = new Set<string>();
  for (const id of queueIds) {
    if (seen.has(id)) continue;
    const t = host.trackById(id);
    if (!t || t.disliked) continue;
    if (!scIdOf(t)) continue;
    valid.push(id);
    seen.add(id);
  }
  if (!valid.length) return [];

  // 2. Адаптивный таргет.
  const N = valid.length;
  let target: number;
  if (N <= 8) target = N;
  else if (N <= 15) target = 8;
  else target = 10;
  if (target >= N) return valid;

  // 3. Равномерные позиции: 0, N/target, 2N/target, …, (target-1)N/target.
  // Math.round даёт ровнее распределение, чем floor (например для N=20,target=10: 0,2,4,…,18).
  const out: string[] = [];
  for (let i = 0; i < target; i++) {
    const idx = Math.min(N - 1, Math.round((i * N) / target));
    out.push(valid[idx]);
  }
  return out;
}

const ROTATION_KEY = "bloom_wave_seed_rotation";

function getRotation(): number {
  try { return parseInt(localStorage.getItem(ROTATION_KEY) ?? "0", 10) || 0; } catch { return 0; }
}
function bumpRotation(): void {
  try { localStorage.setItem(ROTATION_KEY, String(getRotation() + 1)); } catch {}
}

// «Моя волна»: 3–5 сидов из библиотеки. Карусель: каждая новая волна сдвигает выбор,
// чтобы не упираться вечно в одни и те же топ-2 + 2 свежих лайка.
export function pickPersonalSeeds(): string[] {
  const lib = host.tracks.filter(t => !t._scTemp && !t.disliked);
  if (!lib.length) return [];

  const rot = getRotation();
  const seeds = new Set<string>();

  // 1) Топ по агрегату прослушиваний — берём 2 трека со сдвигом rot.
  const byPlays = [...lib]
    .map(t => ({ t, plays: (t.playCount ?? 0) + playCountAll(t.id) }))
    .filter(x => x.plays > 0)
    .sort((a, b) => b.plays - a.plays);
  if (byPlays.length) {
    const a = byPlays[(rot * 2) % byPlays.length];
    const b = byPlays[(rot * 2 + 1) % byPlays.length];
    if (a) seeds.add(a.t.id);
    if (b && b.t.id !== a?.t.id) seeds.add(b.t.id);
  }

  // 2) Лайки — тоже с ротацией. Сортировка по дате лайка.
  const favs = lib
    .filter(t => t.fav)
    .sort((a, b) => (b.favAt ?? 0) - (a.favAt ?? 0));
  if (favs.length) {
    const f1 = favs[(rot * 2) % favs.length];
    const f2 = favs[(rot * 2 + 1) % favs.length];
    if (f1) seeds.add(f1.id);
    if (f2 && f2.id !== f1?.id) seeds.add(f2.id);
  }

  // 3) Случайный из топ-жанров (на каждом запуске — тоже разный).
  const genreScore = new Map<string, number>();
  for (const t of lib) {
    const plays = (t.playCount ?? 0) + playCountAll(t.id);
    if (plays <= 0) continue;
    for (const g of (t.genres ?? [])) {
      if (!g) continue;
      genreScore.set(g.toLowerCase(), (genreScore.get(g.toLowerCase()) ?? 0) + plays);
    }
  }
  const topGenres = [...genreScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  if (topGenres.length) {
    const g = topGenres[(rot + Math.floor(Math.random() * 2)) % topGenres.length];
    const candidates = lib.filter(t =>
      (t.genres ?? []).some(x => x.toLowerCase() === g) &&
      !seeds.has(t.id) &&
      !recentlyPlayed(t.id, 2),
    );
    if (candidates.length) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      seeds.add(pick.id);
    }
  }

  if (!seeds.size) {
    const fallback = [...lib].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 3);
    for (const t of fallback) seeds.add(t.id);
  }

  bumpRotation();
  return Array.from(seeds).slice(0, 5);
}

// Для подмешивания «знакомых» (вся библиотека, см. ответ юзера).
export function pickFamiliarPool(excludeIds: Set<string>, limit = 20): Track[] {
  const lib = host.tracks.filter(t =>
    !t._scTemp &&
    !t.disliked &&
    !excludeIds.has(t.id) &&
    !recentlyPlayed(t.id, 3),
  );
  // Перемешиваем и режем.
  for (let i = lib.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lib[i], lib[j]] = [lib[j], lib[i]];
  }
  return lib.slice(0, limit);
}
