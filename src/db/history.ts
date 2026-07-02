// Хелперы над playHistory (localStorage 'bloom_play_history').
// Здесь — только чтение + запись completionRatio в последнюю запись
// и подсчёт скипов.

import { host } from "../wave/host";
import type { Track } from "../wave/types";

const SKIP_PLAYED_SEC = 20;
const SKIP_RATIO = 0.3;
const FINISH_RATIO = 0.85;

export type CompletionVerdict = "skip" | "finish" | "neutral";

// Заглядываем в записи playHistory за последние N дней.
export function recentlyPlayed(id: string, days = 7): boolean {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return host.playHistory.some(e => e.id === id && e.ts >= cutoff);
}

export function playCountAll(id: string): number {
  return host.playHistory.filter(e => e.id === id).reduce((s, e) => s + (e.count ?? 1), 0);
}

// Вес трека для «умной» перемешки: недавно и часто слушанные — тяжелее,
// поэтому статистически всплывают в НАЧАЛЕ очереди (но не детерминированно —
// порядок каждый раз новый). Контраст между «горячим» и «холодным» намеренно
// большой (~140x): холодных треков в библиотеке обычно кратно больше недавних,
// и при слабом смещении они забивают начало. Расклад по симуляции:
// при 400 треках/40 недавних — ~9 из 10 первых треков недавние.
//   base:    0.5     — трек без истории
//   recency: до +40  — экспон. затухание, «горячая» неделя, к ~месяцу гаснет
//   freq:    до +30  — count из истории (потолок 10)
// Используется как weightFn в queueStore.cycleShuffle.
export function smartShuffleWeight(id: string): number {
  let count = 0;
  let lastTs = 0;
  for (const e of host.playHistory) {
    if (e.id !== id) continue;
    count += e.count ?? 1;
    if (e.ts > lastTs) lastTs = e.ts;
  }
  let recencyBonus = 0;
  if (lastTs) {
    const days = (Date.now() - lastTs) / 86_400_000;
    recencyBonus = 40 * Math.exp(-days / 6);
  }
  return 0.5 + recencyBonus + Math.min(count, 10) * 3;
}

export function classifyCompletion(playedSec: number, durSec: number): CompletionVerdict {
  if (!durSec || durSec <= 0) return "neutral";
  const ratio = playedSec / durSec;
  if (playedSec < SKIP_PLAYED_SEC && ratio < SKIP_RATIO) return "skip";
  if (ratio >= FINISH_RATIO) return "finish";
  return "neutral";
}

// Вызывается из _creditPlay / при смене трека.
// Пишет completionRatio в свежайшую запись playHistory, если она про этот трек.
export function stampLastHistoryRatio(id: string, ratio: number): void {
  const ph = host.playHistory;
  if (!ph.length) return;
  const top = ph[0];
  if (top.id !== id) return;
  top.completionRatio = Math.max(0, Math.min(1, ratio));
  try {
    localStorage.setItem("bloom_play_history", JSON.stringify(ph.slice(0, 1000)));
  } catch {}
}

// Накопить скип в самом треке (если он есть в библиотеке).
export function bumpSkip(t: Track | undefined): void {
  if (!t) return;
  t.skipCount = (t.skipCount ?? 0) + 1;
  t.lastSkipAt = Date.now();
  host.persistMeta(t);
}
