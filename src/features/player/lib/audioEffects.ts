/**
 * Аудио-эффекты: нормализация громкости, кроссфейд,
 * устройство вывода. Работают поверх общего `audioGraph`.
 *
 * - Нормализация: офлайн-анализ RMS текущего трека → множитель на normGain
 *   (кап +12 dB), кеш по id трека.
 * - Кроссфейд: за `xfadeDur` до конца плавно гасим xfadeGain и зовём nextTr,
 *   на новом треке плавно поднимаем.
 * - Устройство: setSinkId на элементе и на AudioContext (если граф построен).
 *
 * `useAudioEffects` (в App) вешает слушатели audioEngine + подписку на audioStore.
 */
import { useEffect } from 'react'
import { useAudioStore, type NormStatus } from '@features/settings'
import { audioEngine } from './audioEngine'
import {
  ensureAudioGraph,
  resumeAudioGraph,
  isAudioGraphReady,
  getAudioContext,
  getNormGainNode,
  getXfadeGainNode,
  getEqNodes,
  getFxGraph,
} from './audioGraph'
import { nextTr } from '../api/play'
import { useQueueStore } from '../model/queueStore'
import { useEqStore } from '../model/eqStore'
import { useFxStore } from '../model/fxStore'

// ── Нормализация ──
const normCache: Record<string, number> = {}
let analyzing = false

const setStatus = (s: NormStatus) => useAudioStore.getState().setNormStatus(s)

export const applyNorm = (): void => {
  const g = getNormGainNode()
  if (!g) return
  const { normEnabled } = useAudioStore.getState()
  if (!normEnabled) {
    g.gain.value = 1
    return
  }
  const curId = useQueueStore.getState().curId
  g.gain.value = curId && normCache[curId] != null ? normCache[curId]! : 1
}

const analyzeNorm = (): void => {
  const st = useAudioStore.getState()
  if (!st.normEnabled) return
  const curId = useQueueStore.getState().curId
  if (!curId) return
  if (normCache[curId] != null) {
    applyNorm()
    setStatus('ready')
    return
  }
  const url = audioEngine.src
  if (!url || analyzing) return
  analyzing = true
  setStatus('analyzing')
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const Off: typeof OfflineAudioContext =
        window.OfflineAudioContext ||
        (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
          .webkitOfflineAudioContext
      const off = new Off(2, 44100 * 30, 44100)
      return off.decodeAudioData(buf)
    })
    .then((decoded) => {
      let sumSq = 0
      let count = 0
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const data = decoded.getChannelData(c)
        for (let i = 0; i < data.length; i++) {
          sumSq += data[i]! * data[i]!
          count++
        }
      }
      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -60
      const diffDb = useAudioStore.getState().normTargetDb - rmsDb
      const gainLinear = Math.pow(10, Math.min(diffDb, 12) / 20) // кап +12 dB
      normCache[curId] = gainLinear
      analyzing = false
      if (useQueueStore.getState().curId === curId) applyNorm()
      setStatus('ready')
    })
    .catch(() => {
      analyzing = false
      // HLS/недоступный поток — анализ не выходит; оставляем gain=1.
      setStatus('unavailable')
    })
}

/** Сбросить кеш нормализации (при смене целевого уровня). */
export const resetNormCache = (): void => {
  for (const k of Object.keys(normCache)) delete normCache[k]
}

// ── Эквалайзер ──
export const applyEq = (): void => {
  const nodes = getEqNodes()
  if (!nodes.length) return
  const { enabled, gains } = useEqStore.getState()
  nodes.forEach((n, i) => {
    // Выключен — байпас (полосы в 0), но сохранённая кривая `gains` не теряется.
    n.gain.value = enabled ? (gains[i] ?? 0) : 0
  })
}

// ── Звуковые эффекты (8D/10D + реверб/эхо) ──
/** Радиус орбиты паннера (в «метрах» WebAudio); горизонталь и вертикаль. */
const ORBIT_RADIUS = 1.5
const VERTICAL_RADIUS = 1.2
/** 10D: центр и размах свипа среза lowpass (Гц) — «верх-низ» как смена яркости. */
const FILTER_CENTER_HZ = 6000
const FILTER_SWEEP_HZ = 4000

export const applyFx = (): void => {
  const fx = getFxGraph()
  const ctx = getAudioContext()
  if (!fx || !ctx) return
  const st = useFxStore.getState()
  // Мастер-выключатель эквалайзера гасит и эффекты (настройки при этом сохраняются).
  const masterOn = useEqStore.getState().enabled
  const now = ctx.currentTime
  // Плавная подводка, чтобы не было щелчков при вкл/выкл.
  const ramp = (p: AudioParam, v: number) => {
    p.cancelScheduledValues(now)
    p.setTargetAtTime(v, now, 0.05)
  }

  // Пространственный: 8D — орбита по кругу, 10D — + вертикальная LFO.
  const spatialOn = masterOn && st.spatial !== 'off'
  const is10d = masterOn && st.spatial === '10d'
  ramp(fx.dryGain.gain, spatialOn ? 0 : 1)
  ramp(fx.spatialGain.gain, spatialOn ? 1 : 0)
  ramp(fx.radX.gain, spatialOn ? ORBIT_RADIUS : 0)
  ramp(fx.radZ.gain, spatialOn ? ORBIT_RADIUS : 0)
  ramp(fx.radY.gain, is10d ? VERTICAL_RADIUS : 0)
  // Интенсивность → скорость орбиты (0.05..0.30 Гц), вертикаль чуть медленнее.
  const orbitHz = 0.05 + st.spatialIntensity * 0.25
  ramp(fx.oscX.frequency, orbitHz)
  ramp(fx.oscZ.frequency, orbitHz)
  ramp(fx.oscY.frequency, orbitHz * 0.6)
  // 10D: вертикальная LFO свипает срез lowpass (HRTF-высота почти не слышна, а
  // смена яркости — отчётливо). 8D/выкл: фильтр открыт, тембр не трогаем.
  ramp(fx.spatialFilter.frequency, is10d ? FILTER_CENTER_HZ : 20000)
  ramp(fx.filterMod.gain, is10d ? FILTER_SWEEP_HZ : 0)

  // «РЭ»: реверберация (wet) + эхо (дилей с обратной связью).
  const r = masterOn && st.reverb ? st.reverbIntensity : 0
  ramp(fx.reverbGain.gain, r * 0.9)
  ramp(fx.echoGain.gain, r * 0.55)
  ramp(fx.feedback.gain, r * 0.45) // < 1 — без самовозбуждения
}

// ── Устройство вывода ──
export const applyAudioDevice = (deviceId: string): void => {
  const el = audioEngine.element as HTMLAudioElement & {
    setSinkId?: (id: string) => Promise<void>
  }
  if (typeof el.setSinkId === 'function') {
    void el.setSinkId(deviceId || '').catch((e) => console.warn('[audioDevice] element.setSinkId failed', e))
  }
  // После построения графа звук идёт через ctx.destination — устройство задаёт ТОЛЬКО ctx.setSinkId.
  const ctx = getAudioContext() as
    | (AudioContext & { setSinkId?: (id: string) => Promise<void> })
    | null
  if (ctx && typeof ctx.setSinkId === 'function') {
    void ctx.setSinkId(deviceId || '').catch((e) => console.warn('[audioDevice] ctx.setSinkId failed', e))
  }
}

// ── Кроссфейд ──
let xfadingOut = false
let pendingFadeIn = false

const doXfade = (): void => {
  if (!ensureAudioGraph()) {
    xfadingOut = false
    return
  }
  resumeAudioGraph()
  const ctx = getAudioContext()
  const xg = getXfadeGainNode()
  if (!ctx || !xg) {
    xfadingOut = false
    return
  }
  const dur = useAudioStore.getState().xfadeDur
  const now = ctx.currentTime
  xg.gain.cancelScheduledValues(now)
  xg.gain.setValueAtTime(xg.gain.value, now)
  xg.gain.linearRampToValueAtTime(0.0001, now + dur * 0.85)
  pendingFadeIn = true
  window.setTimeout(() => nextTr(), dur * 0.8 * 1000)
}

const onTrackStart = (): void => {
  const xg = getXfadeGainNode()
  const ctx = getAudioContext()
  if (xg && ctx) {
    if (pendingFadeIn && useAudioStore.getState().xfadeEnabled) {
      const dur = useAudioStore.getState().xfadeDur
      const now = ctx.currentTime
      xg.gain.cancelScheduledValues(now)
      xg.gain.setValueAtTime(0.0001, now)
      xg.gain.linearRampToValueAtTime(1, now + dur * 0.85)
    } else {
      xg.gain.cancelScheduledValues(ctx.currentTime)
      xg.gain.value = 1
    }
  }
  pendingFadeIn = false
  xfadingOut = false
}

/** Слушатели audioEngine + подписка на audioStore. Вызывается в App один раз. */
export const useAudioEffects = (): void => {
  useEffect(() => {
    // Восстановить сохранённое устройство (работает на элементе и без графа).
    const dev = useAudioStore.getState().deviceId
    if (dev) applyAudioDevice(dev)

    const offUpd = audioEngine.onUpdate(() => {
      const st = useAudioStore.getState()
      // Лениво строим граф на воспроизведении, если включён эффект (виз строит сам).
      const eqState = useEqStore.getState()
      const eqActive = eqState.active
      const fxActive = eqState.enabled && useFxStore.getState().active
      if (!audioEngine.paused && (st.normEnabled || st.xfadeEnabled || eqActive || fxActive) && !isAudioGraphReady()) {
        if (ensureAudioGraph()) {
          if (dev) applyAudioDevice(dev)
          applyNorm()
          applyEq()
          applyFx()
          if (st.normEnabled) analyzeNorm()
        }
      }
      if (isAudioGraphReady()) resumeAudioGraph()
      // Триггер кроссфейда у конца трека.
      if (!st.xfadeEnabled || xfadingOut) return
      const d = audioEngine.duration
      const cur = audioEngine.currentTime
      if (!d || d < st.xfadeDur * 2) return
      const remaining = d - cur
      if (remaining <= st.xfadeDur && remaining > 0) {
        xfadingOut = true
        doXfade()
      }
    })

    const offMeta = audioEngine.onLoadedMeta(() => {
      onTrackStart()
      if (useAudioStore.getState().normEnabled) analyzeNorm()
    })

    // Реакция на изменения настроек аудио.
    // ВАЖНО: подписчики zustand зовутся СИНХРОННО внутри set(), по порядку. Этот
    // движок подписан раньше (App), чем смонтированный AudioSection. Если делать
    // тут side-effects (тем более вложенный setNormStatus) синхронно, можно сбить
    // итерацию подписчиков → React-подписка компонента не перерисует чекбокс
    // (стейт при этом уже записан → «визуально не выключается, но при перезаходе
    // выкл»). Поэтому всю работу откладываем в микротаску + ловим ошибки.
    const offStore = useAudioStore.subscribe((s, p) => {
      queueMicrotask(() => {
        try {
          if (s.deviceId !== p.deviceId) applyAudioDevice(s.deviceId)
          if (s.normEnabled !== p.normEnabled) {
            if (s.normEnabled && !audioEngine.paused) ensureAudioGraph()
            applyNorm()
            if (s.normEnabled) analyzeNorm()
            else setStatus('off')
          }
          if (s.normTargetDb !== p.normTargetDb) {
            resetNormCache()
            if (s.normEnabled) analyzeNorm()
          }
          if (s.xfadeEnabled !== p.xfadeEnabled && s.xfadeEnabled && !audioEngine.paused) {
            ensureAudioGraph()
          }
        } catch (e) {
          console.warn('[audioEffects] apply failed', e)
        }
      })
    })

    // Изменения эквалайзера → применить к узлам (см. ту же гочу про microtask).
    const offEq = useEqStore.subscribe((s, p) => {
      const enabledChanged = s.enabled !== p.enabled
      if (s.gains === p.gains && !enabledChanged) return
      queueMicrotask(() => {
        try {
          // Мастер-вкл при активном эффекте/кривой — может потребоваться граф.
          if ((s.active || (s.enabled && useFxStore.getState().active)) && !audioEngine.paused) {
            ensureAudioGraph()
          }
          applyEq()
          // enabled — мастер для всей панели, эффекты тоже надо переприменить.
          if (enabledChanged) applyFx()
        } catch (e) {
          console.warn('[audioEffects] eq apply failed', e)
        }
      })
    })

    // Изменения звуковых эффектов → применить к FX-узлам.
    const offFx = useFxStore.subscribe((s, p) => {
      if (
        s.spatial === p.spatial &&
        s.spatialIntensity === p.spatialIntensity &&
        s.reverb === p.reverb &&
        s.reverbIntensity === p.reverbIntensity
      )
        return
      queueMicrotask(() => {
        try {
          // Граф нужен только если эффект активен И мастер-выключатель включён.
          if (s.active && useEqStore.getState().enabled && !audioEngine.paused) {
            if (ensureAudioGraph()) resumeAudioGraph()
          }
          applyFx()
        } catch (e) {
          console.warn('[audioEffects] fx apply failed', e)
        }
      })
    })

    return () => {
      offUpd()
      offMeta()
      offStore()
      offEq()
      offFx()
    }
  }, [])
}
