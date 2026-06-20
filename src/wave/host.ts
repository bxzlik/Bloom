// Мост движка «Волны» к сторам bloom. В старом это был доступ к window-глобалам;
// здесь — адаптер к Zustand-сторам (queue/lib/history), trackRegistry, play API,
// SoundCloud-клиенту, глобальному toast и стору дизлайков. Весь движок (engine/seeds/
// scoring/feedback/session + db/*) ходит через этот единственный объект.

import type { Track } from "./types";
import { useDislikesStore } from "@features/wave/model/dislikesStore";
import { useQueueStore, type PlaySource } from "@features/player/model/queueStore";
import { usePlayerStore } from "@features/player/model/store";
import { useLibStore } from "@features/library/model/store";
import { useHistoryStore } from "@features/library/model/historyStore";
import { trackRegistry } from "@entities/track";
import { loadPlay } from "@features/player/api/play";
import { apiFetch as scApiFetch } from "@features/soundcloud/api/scClient";
import { toast as globalToast } from "@shared/ui";
import { t as i18nT } from "@shared/i18n";

interface HistoryEntry {
  id: string;
  ts: number;
  count?: number;
  completionRatio?: number;
  source?: unknown;
}

interface CurSource {
  type: string;
  label?: string;
}

const findTrack = (id: string): Track | undefined =>
  useLibStore.getState().tracks.find((t) => t.id === id) ?? trackRegistry.get(id);

export const host = {
  get tracks(): Track[] {
    return useLibStore.getState().tracks;
  },
  get playHistory(): HistoryEntry[] {
    return useHistoryStore.getState().entries as HistoryEntry[];
  },

  get queue(): string[] {
    return useQueueStore.getState().queue;
  },
  set queue(v: string[]) {
    useQueueStore.setState({ queue: v });
  },
  get qIdx(): number {
    return useQueueStore.getState().qIdx;
  },
  set qIdx(v: number) {
    useQueueStore.setState({ qIdx: v });
  },
  get curId(): string | null {
    return useQueueStore.getState().curId;
  },

  get curSource(): CurSource {
    const s = useQueueStore.getState().source;
    if (!s) return { type: "none" };
    if (s.kind === "wave") return { type: "wave", label: s.label };
    return { type: s.kind };
  },
  set curSource(v: CurSource) {
    if (v.type === "wave") {
      useQueueStore.setState({ source: { kind: "wave", label: v.label ?? i18nT("wave.title") } });
    }
    // Не-волновой источник через волну не ставим — это делают playFromSource/др.
  },

  get shuffle(): boolean {
    return useQueueStore.getState().shuffle;
  },
  set shuffle(v: boolean) {
    useQueueStore.setState({ shuffle: v });
    usePlayerStore.setState({ shuffle: v });
  },

  trackById(id: string): Track | undefined {
    return findTrack(id);
  },

  loadPlay(id: string): void {
    void loadPlay(id);
  },

  // React-сторы реактивны — рендер «руками» не нужен. Но движок мутирует
  // host.queue по месту (queue.push в enqueueBatch), поэтому renderQueue()
  // используем как «флаш»: клонируем массив, чтобы Zustand уведомил подписчиков.
  renderAll(): void {
    this.renderQueue();
  },
  renderQueue(): void {
    useQueueStore.setState({ queue: [...useQueueStore.getState().queue] });
  },
  updateBgl(): void {
    /* фон обновляется отдельно — no-op */
  },
  toast(msg: string, _kind?: string): void {
    try {
      globalToast(msg);
    } catch {
      /* ignore */
    }
  },

  pushTempTrack(t: Track): void {
    // Треки волны живут в очереди → регистрируем как постоянные (не temp),
    // чтобы clearTemp при навигации их не выкинул.
    trackRegistry.put(t);
  },
  clearTempTracks(): void {
    trackRegistry.clearTemp();
  },

  // Пре-резолв стрим-URL'ов — перф-ниша (мгновенный Next). В bloom стримы
  // резолвятся лениво в loadPlay через resolvePlayableUrl; отдельный prefetch
  // пока не подключён (no-op).
  prefetchStreams(_tracks: Track[]): void {
    /* no-op (TODO: warm SC stream cache) */
  },

  persistMeta(t: Track): void {
    // Обновляем мету только для библиотечных треков (skipCount/disliked).
    // Гостевые SC-треки мутируются по ссылке в trackRegistry — отдельный persist не нужен.
    const inLib = useLibStore.getState().tracks.some((x) => x.id === t.id);
    if (inLib) useLibStore.getState().addTracks([t]);
  },
  persistProfile(): void {
    /* профиль bloom persist'ится отдельно — no-op */
  },

  fmtDur(ms: number): string {
    const s = Math.floor((ms || 0) / 1000);
    const m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  },

  sc: {
    apiFetch<T = unknown>(url: string): Promise<T> {
      return scApiFetch(url) as Promise<T>;
    },
    // Используются только в prefetch (no-op) — best-effort заглушки под тип Host.
    resolveTrack(_permalink: string): Promise<{ media: unknown }> {
      return Promise.resolve({ media: null });
    },
    getStreamUrl(_media: unknown): Promise<{ url: string; isHls: boolean }> {
      return Promise.reject(new Error("getStreamUrl not wired"));
    },
  },

  // Постоянный стор дизлайков для гостевых SC-треков (не лежат в библиотеке).
  scDislikes: {
    has(id: string): boolean {
      return useDislikesStore.getState().has(id);
    },
    add(t: Track): void {
      useDislikesStore.getState().add(t);
    },
    remove(id: string): void {
      useDislikesStore.getState().remove(id);
    },
  },
};

// Маркер типа источника очереди (дублирует PlaySource['wave']) — для внешних проверок.
export type { PlaySource };
export type Host = typeof host;
