// Скоринг и фильтрация кандидатов волны.

import { host } from "./host";
import { recentlyPlayed } from "../db/history";
import { normalizeArtist, trackGenres } from "../db/track-meta";
import { wasShown } from "../db/shown";
import type { Candidate, ScRawTrack, Track, WaveSession } from "./types";

function findLibByScId(scId: string | number): Track | undefined {
  const key = String(scId);
  return host.tracks.find(t =>
    !t._scTemp && (String(t.scId ?? "") === key || String(t.scTrackId ?? "") === key),
  );
}

const ALLOWED_POLICIES = new Set(["ALLOW", "MONETIZE", undefined, ""]);

// Превращает сырой SC-трек в Candidate. null если трек непригоден (BLOCK / без media).
export function candidateFromSc(
  raw: ScRawTrack,
  origin: "station" | "related",
  rank: number,
): Candidate | null {
  if (raw.policy && !ALLOWED_POLICIES.has(raw.policy)) return null;
  const id = "sc_" + raw.id;
  const genres = [raw.genre, ...tagsOf(raw.tag_list)].filter(Boolean).map(g => (g as string).toLowerCase());
  return {
    id,
    sourceRank: rank,
    origin,
    raw,
    artistKey: normalizeArtist(raw.user?.username),
    genres,
  };
}

export function candidateFromLib(t: Track, rank: number): Candidate {
  return {
    id: t.id,
    sourceRank: rank,
    origin: "library",
    libTrack: t,
    artistKey: normalizeArtist(t.artist),
    genres: trackGenres(t),
  };
}

function tagsOf(s: string): string[] {
  if (!s) return [];
  const out: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push((m[1] ?? m[2] ?? "").trim());
  return out.filter(Boolean);
}

export interface FilterCtx {
  seedGenres: Set<string>;
  session: WaveSession;
  dropRecentDays: number;
  curId: string | null;
  // Ослабленный режим: используется как fallback, если строгий проход дал 0 кандидатов.
  // Отключает фильтры wasShown/recentlyPlayed, чтобы пользователь получил хоть что-то
  // вместо глухого «SC не вернул треков».
  relaxed?: boolean;
}

export function passesFilters(c: Candidate, ctx: FilterCtx): boolean {
  if (c.id === ctx.curId) return false;
  if (ctx.session.playedIds.includes(c.id)) return false;

  // Уже сидит в очереди — не дубль.
  if (host.queue.includes(c.id)) return false;

  // Дизлайк — только сам трек, артист не трогается.
  // Для треков из библиотеки — флаг t.disliked. Для гостей — отдельный персистентный стор.
  const lib = host.trackById(c.id);
  if (lib?.disliked) return false;
  if (host.scDislikes.has(c.id)) return false;

  // Свежие кандидаты от SC, которые УЖЕ есть в библиотеке, не пропускаем.
  // Библиотечные треки попадают в очередь только через явное подмешивание (origin === "library").
  // Иначе они «утекают» в волну дважды: один раз как «свежий» SC-кандидат, и ещё через FAMILIAR_RATIO.
  if (c.origin !== "library") {
    const libMatchById = lib && !lib._scTemp;
    const libMatchByScId = c.raw && findLibByScId(c.raw.id);
    if (libMatchById || libMatchByScId) return false;
  }

  // Недавно слушали (за N дней) — не подмешиваем заново.
  if (!ctx.relaxed && recentlyPlayed(c.id, ctx.dropRecentDays)) return false;

  // Уже мелькало в волне за последние 14 дней (даже если не доcлушал) — не повторяемся.
  // Для библиотечных подмешиваний этот фильтр не применяем — там всё равно ротация.
  if (!ctx.relaxed && c.origin !== "library" && wasShown(c.id, 14)) return false;

  return true;
}

export interface ScoreCtx extends FilterCtx {
  bonusArtists: Record<string, number>;
}

// Линейный скоринг. Чем выше — тем приоритетнее.
export function scoreCandidate(c: Candidate, ctx: ScoreCtx): number {
  // База: чем меньше sourceRank, тем больше очков (20 → 0 для топа, 0 → −20 для хвоста).
  let s = 20 - c.sourceRank;

  // Совпадение жанров с сидом.
  let genreMatch = 0;
  for (const g of c.genres) if (ctx.seedGenres.has(g)) { genreMatch++; }
  s += Math.min(genreMatch, 3) * 4;

  // Бонус знакомого артиста: лайк в библиотеке или артист в подписках.
  const libT = host.trackById(c.id);
  if (libT?.fav) s += 8;

  // Сеансовый бонус (накопился по лайкам/дослушиваниям в этой волне).
  const sb = ctx.bonusArtists[c.artistKey];
  if (sb) s += Math.min(sb, 12);

  // Лёгкий буст «новизне» в режиме personal: гостевые > библиотечные.
  if (c.origin !== "library") s += 1;

  // Слабая случайность, чтобы не было идеально предсказуемого порядка.
  s += Math.random() * 2;

  return s;
}

// Жёсткое разнообразие: максимум 2 трека одного артиста на пачку
// и максимум ~30% одного жанра. Лишние уходят в хвост (могут попасть в следующую пачку).
const MAX_PER_ARTIST = 2;
const MAX_GENRE_RATIO = 0.3;

export function antiClumpByArtist(ranked: Candidate[]): Candidate[] {
  const total = ranked.length;
  const maxPerGenre = Math.max(2, Math.ceil(total * MAX_GENRE_RATIO));

  const out: Candidate[] = [];
  const tail: Candidate[] = [];
  const artistCount = new Map<string, number>();
  const genreCount = new Map<string, number>();
  let lastArtist = "";

  for (const c of ranked) {
    const ac = c.artistKey ? (artistCount.get(c.artistKey) ?? 0) : 0;
    if (c.artistKey && ac >= MAX_PER_ARTIST) { tail.push(c); continue; }
    if (c.artistKey && c.artistKey === lastArtist) { tail.push(c); continue; }

    // Доминирующий жанр кандидата (первый из списка).
    const primaryGenre = c.genres[0] ?? "";
    if (primaryGenre) {
      const gc = genreCount.get(primaryGenre) ?? 0;
      if (gc >= maxPerGenre) { tail.push(c); continue; }
      genreCount.set(primaryGenre, gc + 1);
    }

    out.push(c);
    if (c.artistKey) artistCount.set(c.artistKey, ac + 1);
    lastArtist = c.artistKey;
  }
  // Хвост подмешиваем в конец — пусть будут резервом для refill.
  return out.concat(tail);
}
