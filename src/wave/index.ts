// Публичное API модуля «Волна». Экспонируется в window для onclick-обработчиков.

import { host } from "./host";
import { t as i18nT } from "@shared/i18n";
import * as session from "./session";
import { startWave, maybeRefill, WAVE_SOURCE_TYPE, waveLabel, prefetchUpcoming } from "./engine";
import { pickPersonalSeeds, pickTrackSeeds, pickQueueSeeds } from "./seeds";
import { dispatch, onPlayStart } from "./feedback";
import { resetWaveSourceCache } from "./sources";
import * as ymWave from "./yandex";
import type { FeedbackEvent } from "./types";

// Источник «Моей волны»: 'sc' (движок Bloom по SoundCloud) или 'ym' (rotor Яндекса).
// Тумблер на карточке волны (см. WaveCard) пишет сюда; стартер ниже роутит по значению.
const WAVE_SOURCE_KEY = "bloom_wave_source";

export function getWaveSource(): "sc" | "ym" {
  try { return localStorage.getItem(WAVE_SOURCE_KEY) === "ym" ? "ym" : "sc"; } catch { return "sc"; }
}
export function setWaveSource(s: "sc" | "ym"): void {
  try { localStorage.setItem(WAVE_SOURCE_KEY, s === "ym" ? "ym" : "sc"); } catch { /* ignore */ }
}

async function waveStartPersonal(): Promise<boolean> {
  // «Моя волна» от Яндекса (rotor) — отдельный драйвер; SC-движок не задействуем.
  if (getWaveSource() === "ym") {
    // Выходим из возможной активной SC-сессии, чтобы её persist/refill не мешали.
    if (session.isActive()) session.endSession();
    return ymWave.start();
  }
  resetWaveSourceCache();
  const seeds = pickPersonalSeeds();
  if (!seeds.length) {
    host.toast(i18nT("wave.toast.notEnough"), "warn");
    return false;
  }
  const ok = await startWave("personal", seeds);
  if (!ok) host.toast("SoundCloud не вернул похожих треков", "error");
  return ok;
}

async function waveStartByTrack(trackId: string): Promise<boolean> {
  resetWaveSourceCache();
  const seeds = pickTrackSeeds(trackId);
  if (!seeds.length) { host.toast(i18nT("wave.toast.noSeed"), "error"); return false; }
  const t = host.trackById(trackId);
  if (!t?.scId && !t?.scTrackId) {
    host.toast(i18nT("wave.toast.scOnly"), "warn");
    return false;
  }
  const ok = await startWave("track", seeds);
  if (!ok) host.toast("SoundCloud не вернул похожих треков", "error");
  return ok;
}

// «Похожие на очередь»: запустить волну с сидами из текущей очереди (или переданного списка id).
async function waveStartByQueue(trackIds?: string[]): Promise<boolean> {
  resetWaveSourceCache();
  const src = trackIds && trackIds.length ? trackIds : host.queue;
  if (!src.length) { host.toast(i18nT("wave.toast.queueEmpty"), "warn"); return false; }
  const seeds = pickQueueSeeds(src);
  if (!seeds.length) {
    host.toast(i18nT("wave.toast.noScInQueue"), "warn");
    return false;
  }
  const ok = await startWave("queue", seeds);
  if (!ok) host.toast("SoundCloud не вернул похожих треков", "error");
  return ok;
}

function waveStop(): void {
  if (ymWave.isRunning()) { ymWave.end(); host.toast(i18nT("wave.toast.stopped")); return; }
  if (!session.isActive()) return;
  session.endSession();
  host.toast(i18nT("wave.toast.stopped"));
}

// Тихое завершение сессии — без toast'а. Используется, когда пользователь не явно «остановил волну»,
// а ушёл слушать что-то другое (плейлист, SC-поиск, любимое). Извне зовётся как Wave.endSession().
function waveEndSession(): void {
  if (ymWave.isRunning()) { ymWave.end(); return; }
  if (!session.isActive()) return;
  session.endSession();
}

function waveFeedback(ev: FeedbackEvent): void {
  // Дизлайк/undislike работают всегда — это глобальная пометка трека, переживающая сессию.
  if (ev.action === "dislike" || ev.action === "undislike") { dispatch(ev); return; }
  // Во время Яндекс-волны finish/skip уходят в rotor-фидбек (обучение станции),
  // а не в SC-скоринг.
  if (ymWave.isActive()) {
    if (ev.action === "finish" || ev.action === "skip") {
      ymWave.onFinish(ev.trackId, ev.playedSec ?? 0, ev.durSec ?? 0);
    }
    return;
  }
  // Остальные сигналы (skip/finish/addedToLibrary) имеют смысл только во время сеанса.
  if (!session.isActive()) return;
  dispatch(ev);
}

function waveOnTrackStart(trackId: string): void {
  // Яндекс-волна: фидбек старта + догрузка rotor-батча (отдельный драйвер).
  if (ymWave.isRunning()) {
    if (host.curSource?.type !== WAVE_SOURCE_TYPE) { ymWave.end(); return; }
    ymWave.onTrackStart(trackId);
    return;
  }
  if (!session.isActive()) return;
  // Если источник сменился на не-волновой (плейлист, любимое, SC-поиск) — пользователь ушёл
  // из волны. Тихо завершаем сессию, иначе:
  //  - в session.playedIds попадают не-волновые треки → антиповторы потом блокируют то,
  //    что юзер на самом деле в волне ещё не слышал;
  //  - maybeRefill бьёт в SC API за треками, которые пользователю уже не нужны;
  //  - bloom_wave_state перезатирается чужими queue/qIdx.
  if (host.curSource?.type !== WAVE_SOURCE_TYPE) {
    session.endSession();
    return;
  }
  onPlayStart(trackId);
  // Обновляем сохранённое состояние с актуальным qIdx — иначе после перезахода
  // волна продолжается с первого трека, а не текущего.
  session.persist(host.queue, host.qIdx);
  // Проверяем, не пора ли дозагрузить пачку.
  maybeRefill();
  // Пре-резолв URL следующих треков — чтобы переход на «Next» был без ожидания SC.
  prefetchUpcoming();
}

function waveIsActive(): boolean { return session.isActive() || ymWave.isActive(); }

// Принудительно сохранить текущее состояние волны (queue + qIdx + гости).
// Вызывается из loadPlay при смене трека.
function wavePersistState(): void {
  // Яндекс-волна не персистится между перезапусками (rotor каждый раз свежий) —
  // здесь только проверяем, не ушёл ли юзер из волны, чтобы завершить rotor-сессию.
  if (ymWave.isRunning()) { ymWave.endIfLeftWave(); return; }
  if (!session.isActive()) return;
  // Та же защита, что в onTrackStart: loadPlay при переходе на чужой источник не должен
  // переписывать bloom_wave_state queue'ом плейлиста. Источник проверяется первым,
  // чтобы persist даже не вызвался.
  if (host.curSource?.type !== WAVE_SOURCE_TYPE) {
    session.endSession();
    return;
  }
  session.persist(host.queue, host.qIdx);
}

function waveTryRestore(): boolean {
  const state = session.loadPersisted();
  if (!state) return false;
  session.adoptPersisted(state);
  // Сначала восстанавливаем гостевые треки в _tempTracksMap, иначе queue-id'ы ни на что не сошлются.
  for (const t of state.guestTracks ?? []) host.pushTempTrack(t);
  host.queue = state.queue;
  host.qIdx = state.qIdx;
  const label = waveLabel(state.session.mode);
  host.curSource = { type: WAVE_SOURCE_TYPE, label };
  host.renderQueue();
  // Принудительно прописываем bloom_resume → чтобы карточка «Продолжить» показала трек волны,
  // даже если до закрытия приложения saveResumePos не успел отработать.
  // НО: если после волны пользователь слушал что-то ещё (плейлист/любимые/etc.), bloom_resume уже
  // содержит более свежий резюм с другим треком — не затираем его, иначе карточка покажет «Моя волна»
  // вместо реально последнего источника. Перезаписываем только когда существующий резюм отсутствует,
  // ссылается на тот же трек волны, или старше, чем сохранённое состояние волны.
  const currentId = state.queue[state.qIdx];
  if (currentId) {
    try {
      const existing = JSON.parse(localStorage.getItem("bloom_resume") || "{}");
      const waveSavedAt = state.savedAt || 0;
      const existingSavedAt = existing.savedAt || 0;
      // Если bloom_resume свежее, чем сохранённое состояние волны, и его источник не волновой —
      // значит, пользователь после волны слушал что-то ещё (тот же трек мог играть из плейлиста).
      // Доверяем последнему saveResumePos и не подменяем источник на волну.
      const existingSourceType = existing.source && existing.source.type;
      const existingIsNewerNonWave =
        existing.id &&
        existingSavedAt >= waveSavedAt &&
        existingSourceType &&
        existingSourceType !== WAVE_SOURCE_TYPE;
      if (!existingIsNewerNonWave) {
        const data = {
          id: currentId,
          pos: existing.id === currentId ? (existing.pos || 0) : 0,
          source: { type: WAVE_SOURCE_TYPE, label },
          queue: state.queue,
          qIdx: state.qIdx,
          savedAt: waveSavedAt || Date.now(),
          state: "paused",
        };
        localStorage.setItem("bloom_resume", JSON.stringify(data));
      }
    } catch {}
  }
  // Перерисовать карточку «Продолжить» — она могла отрендериться ДО tryRestore.
  try {
    const w = window as unknown as { _updateHomeContinueCard?: () => void };
    w._updateHomeContinueCard?.();
  } catch {}
  return true;
}

interface WaveApi {
  startPersonal: typeof waveStartPersonal;
  startByTrack: typeof waveStartByTrack;
  startByQueue: typeof waveStartByQueue;
  stop: typeof waveStop;
  endSession: typeof waveEndSession;
  feedback: typeof waveFeedback;
  onTrackStart: typeof waveOnTrackStart;
  isActive: typeof waveIsActive;
  tryRestore: typeof waveTryRestore;
  persistState: typeof wavePersistState;
  SOURCE_TYPE: typeof WAVE_SOURCE_TYPE;
}

const api: WaveApi = {
  startPersonal: waveStartPersonal,
  startByTrack: waveStartByTrack,
  startByQueue: waveStartByQueue,
  stop: waveStop,
  endSession: waveEndSession,
  feedback: waveFeedback,
  onTrackStart: waveOnTrackStart,
  isActive: waveIsActive,
  tryRestore: waveTryRestore,
  persistState: wavePersistState,
  SOURCE_TYPE: WAVE_SOURCE_TYPE,
};

(window as unknown as { Wave: WaveApi }).Wave = api;

// Модуль `type=module` загружается defer-ом — к моменту его исполнения inline-скрипт уже отработал,
// globals (queue, tracks, _trackById, renderQueue) определены. Восстанавливаем сеанс сразу,
// чтобы не зависеть от setTimeout-гонки в loadAndInit.
try {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { try { waveTryRestore(); } catch {} }, { once: true });
  } else {
    waveTryRestore();
  }
} catch {}

export default api;
