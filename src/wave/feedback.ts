// Обработка фидбека: лайк / дослушал / скип / дизлайк.

import { t as i18nT } from "@shared/i18n";
import { host } from "./host";
import { classifyCompletion, stampLastHistoryRatio, bumpSkip } from "../db/history";
import { markDisliked, unmarkDisliked, normalizeArtist } from "../db/track-meta";
import * as session from "./session";
import { maybeRefill } from "./engine";
import type { FeedbackAction, FeedbackEvent } from "./types";

// Вызывается из _creditPlay сразу как трек засчитался.
export function onPlayStart(trackId: string): void {
  session.recordPlayed(trackId);
}

// Вызывается на смене трека: фиксируем дослушал/скип.
export function onPlayEnd(ev: { trackId: string; playedSec: number; durSec: number }): void {
  if (!session.isActive()) return;
  const verdict = classifyCompletion(ev.playedSec, ev.durSec);
  const ratio = ev.durSec > 0 ? ev.playedSec / ev.durSec : 0;
  stampLastHistoryRatio(ev.trackId, ratio);

  const t = host.trackById(ev.trackId);
  const artistKey = normalizeArtist(t?.artist);

  if (verdict === "skip") {
    bumpSkip(t);
    session.bumpArtistBonus(artistKey, -2);
  } else if (verdict === "finish") {
    // Дослушал — основной позитивный сигнал, по которому волна учится. Усилено с +1 до +3,
    // потому что теперь это главный источник положительного фидбека (вместо «лайка»).
    session.bumpArtistBonus(artistKey, 3);
  }
}

// Явный сигнал «хочу больше такого»: пользователь сохранил трек в библиотеку.
// Самое сильное положительное действие — сильнее, чем просто дослушал.
export function onAddedToLibrary(trackId: string): void {
  const t = host.trackById(trackId);
  if (!t) return;
  session.bumpArtistBonus(normalizeArtist(t.artist), 5);
}

// Дизлайк трека. Для библиотечных — флаг t.disliked в IDB. Для гостей — отдельный персистентный стор.
export function onDislike(trackId: string): void {
  const t = host.trackById(trackId);
  if (!t) return;
  markDisliked(t); // t.disliked = true (и idbUpdateMeta для библиотечных; для гостей это in-memory)
  // Если трек гостевой — кладём в персистентный sc_dislikes стор, чтобы дизлайк пережил перезаход.
  if (t._sc || t._scTemp) host.scDislikes.add(t);
  host.renderQueue(); // перерисовать с зачёркиванием
  // Если это и есть текущий — переключаемся на следующий (трек в очереди остаётся зачёркнутым).
  if (trackId === host.curId) {
    const next = host.queue[host.qIdx + 1];
    if (next) host.loadPlay(next);
    else { host.toast?.(i18nT("wave.toast.refilling")); maybeRefill(); }
  }
}

// Снять дизлайк с трека. Работает и без активной волны.
export function onUndislike(trackId: string): void {
  const t = host.trackById(trackId);
  if (t) unmarkDisliked(t);
  // Снять с гостевого стора тоже — на случай если трек уже не в памяти, но в персистенте есть.
  host.scDislikes.remove(trackId);
  host.renderQueue();
}

export function dispatch(ev: FeedbackEvent): void {
  const map: Record<FeedbackAction, () => void> = {
    // like/unlike — no-op: см. types.ts. Сердечко больше не сигнал волне.
    like: () => {},
    unlike: () => {},
    skip: () => onPlayEnd({ trackId: ev.trackId, playedSec: ev.playedSec ?? 0, durSec: ev.durSec ?? 1 }),
    finish: () => onPlayEnd({ trackId: ev.trackId, playedSec: ev.playedSec ?? 0, durSec: ev.durSec ?? 1 }),
    dislike: () => onDislike(ev.trackId),
    undislike: () => onUndislike(ev.trackId),
    addedToLibrary: () => onAddedToLibrary(ev.trackId),
  };
  map[ev.action]?.();
}
