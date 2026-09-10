// Дослушивания и скипы для обучения волны.
//
// Само «сколько раз и когда слушали» отсюда уехало в `db/playStats`: считалось
// это по списку истории, а тот держал одну запись на трек с лимитом 200 и
// вытеснением по давности — и врал всем, кто на него опирался. Реэкспорты ниже
// оставлены, чтобы не разносить правку по всем вызовам, но источник у них
// теперь общий — журнал прослушиваний.

import { host } from "../wave/host";
import { playCount, recentlyPlayed as recentlyPlayedStat, lastPlayedAt } from "./playStats";
import type { Track } from "../wave/types";

const SKIP_PLAYED_SEC = 20;
const SKIP_RATIO = 0.3;
const FINISH_RATIO = 0.85;

export type CompletionVerdict = "skip" | "finish" | "neutral";

// Звучал ли трек за последние N дней.
export const recentlyPlayed = recentlyPlayedStat;

// Сколько всего раз слушали трек.
export const playCountAll = playCount;

// Вес трека для «умной» перемешки: недавно и часто слушанные — тяжелее,
// поэтому статистически всплывают в НАЧАЛЕ очереди (но не детерминированно —
// порядок каждый раз новый). Контраст между «горячим» и «холодным» намеренно
// большой (~140x): холодных треков в библиотеке обычно кратно больше недавних,
// и при слабом смещении они забивают начало. Расклад по симуляции:
// при 400 треках/40 недавних — ~9 из 10 первых треков недавние.
//   base:    0.5     — трек без истории
//   recency: до +40  — экспон. затухание, «горячая» неделя, к ~месяцу гаснет
//   freq:    до +30  — число прослушиваний (потолок 10)
// Используется как weightFn в queueStore.cycleShuffle.
export function smartShuffleWeight(id: string): number {
  const count = playCount(id);
  const lastTs = lastPlayedAt(id);
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

// `stampLastHistoryRatio` удалён вместе с переездом истории на журнал: он писал
// `completionRatio` в запись localStorage, которую никто никогда не читал, а
// после переезда писал бы уже в унаследованные данные. Доля дослушивания и так
// вычисляется на месте (`classifyCompletion`) и хранения не требует.

// Накопить скип в самом треке (если он есть в библиотеке).
export function bumpSkip(t: Track | undefined): void {
  if (!t) return;
  t.skipCount = (t.skipCount ?? 0) + 1;
  t.lastSkipAt = Date.now();
  host.persistMeta(t);
}
