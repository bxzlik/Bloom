// Маленькие хелперы над библиотекой.
// Сам persist делает idbUpdateMeta — мы только меняем поля на объекте.

import { host } from "../wave/host";
import type { Track } from "../wave/types";

export function normalizeArtist(a: string | undefined): string {
  return (a ?? "").trim().toLowerCase();
}

export function markDisliked(t: Track | undefined): void {
  if (!t) return;
  t.disliked = true;
  host.persistMeta(t);
}

export function unmarkDisliked(t: Track | undefined): void {
  if (!t) return;
  t.disliked = false;
  host.persistMeta(t);
}

// Унификация тегов: SC отдаёт tag_list строкой, у нас в библиотеке — массив genres.
export function tagsFromList(s: string | null | undefined): string[] {
  if (!s) return [];
  // tag_list в SC: пробелами, кавычками экранируются составные ("hip hop")
  const out: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const tag = (m[1] ?? m[2] ?? "").trim().toLowerCase();
    if (tag && !/^geo:/.test(tag) && !/^bpm/.test(tag)) out.push(tag);
  }
  return out;
}

export function trackGenres(t: Pick<Track, "genres"> | undefined): string[] {
  if (!t?.genres) return [];
  return t.genres.map(g => g.toLowerCase());
}
