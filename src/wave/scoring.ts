// Скоринг и фильтрация кандидатов волны.

import { host } from "./host";
import { recentlyPlayed } from "../db/history";
import { normalizeArtist } from "../db/track-meta";
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
  return {
    id,
    sourceRank: rank,
    origin,
    raw,
    artistKey: normalizeArtist(raw.user?.username),
  };
}

export function candidateFromLib(t: Track, rank: number): Candidate {
  return {
    id: t.id,
    sourceRank: rank,
    origin: "library",
    libTrack: t,
    artistKey: normalizeArtist(t.artist),
  };
}

export interface FilterCtx {
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

  // Бонуса за совпадение жанров с сидами больше нет: жанр на SoundCloud —
  // свободный текст загрузчика вместе с тегами, и до +12 очков раздавалось по
  // случайным совпадениям, перебивая порядок станции/related — сигнал надёжнее.

  // Бонус залайканному. Лайк — из стора: `t.fav` на треках не ведётся, и по нему
  // бонус не срабатывал ни разу.
  if (host.favs.has(c.id)) s += 8;

  // Сеансовый бонус (накопился по лайкам/дослушиваниям в этой волне).
  const sb = ctx.bonusArtists[c.artistKey];
  if (sb) s += Math.min(sb, 12);

  // Лёгкий буст «новизне» в режиме personal: гостевые > библиотечные.
  if (c.origin !== "library") s += 1;

  // Слабая случайность, чтобы не было идеально предсказуемого порядка.
  s += Math.random() * 2;

  return s;
}

// Жёсткое разнообразие: максимум 2 трека одного артиста на пачку и никогда двух
// подряд. Лишние уходят в хвост (могут попасть в следующую пачку).
//
// Кап «≤30% одного жанра» здесь был и снят: считался от всего пула (~100
// кандидатов при пачке в 20), поэтому в «Моей волне» не срабатывал никогда, а в
// «Волне по треку» (пул ~40) резал по шумному SC-жанру — у слушателя одного
// стиля вытеснял подходящее случайным.
const MAX_PER_ARTIST = 2;

export function antiClumpByArtist(ranked: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  const tail: Candidate[] = [];
  const artistCount = new Map<string, number>();
  let lastArtist = "";

  for (const c of ranked) {
    const ac = c.artistKey ? (artistCount.get(c.artistKey) ?? 0) : 0;
    if (c.artistKey && ac >= MAX_PER_ARTIST) { tail.push(c); continue; }
    if (c.artistKey && c.artistKey === lastArtist) { tail.push(c); continue; }

    out.push(c);
    if (c.artistKey) artistCount.set(c.artistKey, ac + 1);
    lastArtist = c.artistKey;
  }
  // Хвост подмешиваем в конец — пусть будут резервом для refill.
  return out.concat(tail);
}
