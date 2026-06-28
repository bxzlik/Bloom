/**
 * Единый WebAudio-граф над `audioEngine.element`.
 *
 * Цепочка: source → normGain → eq[0..5] → fx → xfadeGain → analyser → destination
 *   - normGain  — нормализация громкости (множитель на трек)
 *   - eq[]      — 6-полосный эквалайзер (BiquadFilter; в покое gain=0)
 *   - fx        — звуковые эффекты 8D/10D + реверб/эхо (в покое = чистый dry)
 *   - xfadeGain — кроссфейд (рампы при переходе; в покое = 1)
 *   - analyser  — визуализатор
 *
 * `createMediaElementSource` можно звать на элемент лишь ОДИН раз, поэтому граф —
 * синглтон, строится лениво (первый, кому понадобился: виз / нормализация /
 * кроссфейд). Громкостью рулит `element.volume` (gain-узлы в покое
 * не трогают звук), так что построение графа само по себе звук не меняет — нужен
 * лишь `resume()` контекста (вызывать в user-gesture, т.е. на play).
 *
 * ВНИМАНИЕ: пока граф НЕ построен, звук идёт напрямую из элемента — тогда работает
 * `element.setSinkId` для выбора устройства. После построения вывод идёт в
 * `AudioContext.destination`, поэтому устройство применяем и к `ctx.setSinkId`.
 */
import { audioEngine } from './audioEngine'

let ac: AudioContext | null = null
let source: MediaElementAudioSourceNode | null = null
let normGain: GainNode | null = null
let xfadeGain: GainNode | null = null
let analyser: AnalyserNode | null = null
let eqNodes: BiquadFilterNode[] = []

/**
 * FX-секция: параллельные ветки dry / пространственный паннер / реверб / эхо,
 * сводимые в `output`. Управление — `audioEffects.applyFx` (узлы есть всегда,
 * выключенные ветки просто держат gain=0, поэтому реконнектов не требуется).
 */
export interface FxGraph {
  input: GainNode
  output: GainNode
  dryGain: GainNode
  // Пространственный (8D/10D)
  panner: PannerNode
  spatialFilter: BiquadFilterNode
  spatialGain: GainNode
  oscX: OscillatorNode
  oscZ: OscillatorNode
  oscY: OscillatorNode
  radX: GainNode
  radZ: GainNode
  radY: GainNode
  filterMod: GainNode
  // Реверб + эхо («РЭ»)
  convolver: ConvolverNode
  reverbGain: GainNode
  delay: DelayNode
  feedback: GainNode
  echoGain: GainNode
}

let fx: FxGraph | null = null

/** Генерация затухающего импульса (шумовой хвост) для конволвера-реверба. */
const makeImpulseResponse = (ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer => {
  const rate = ctx.sampleRate
  const len = Math.max(1, Math.floor(rate * seconds))
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}

/** Построить FX-секцию (все ветки в покое, dry=1). */
const buildFx = (ctx: AudioContext): FxGraph => {
  const input = ctx.createGain()
  const output = ctx.createGain()

  const dryGain = ctx.createGain()
  dryGain.gain.value = 1

  // ── Пространственный паннер (HRTF, орбита вокруг слушателя) ──
  const panner = ctx.createPanner()
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'inverse'
  panner.refDistance = 1
  panner.rolloffFactor = 0 // без затухания по расстоянию — стабильная громкость
  // Слушатель в центре, источник орбитой по кругу через позиционные осцилляторы.
  panner.positionX.value = 0
  panner.positionY.value = 0
  panner.positionZ.value = 0

  // Lowpass для 10D: вертикальная LFO свипает срез (ярче «вверху», глуше «внизу»).
  // В покое и для 8D — открыт (20 кГц), звук не красит.
  const spatialFilter = ctx.createBiquadFilter()
  spatialFilter.type = 'lowpass'
  spatialFilter.frequency.value = 20000
  spatialFilter.Q.value = 0.7

  const spatialGain = ctx.createGain()
  spatialGain.gain.value = 0

  // Квадратурные волны: X=cos, Z=sin → движение по окружности в плоскости XZ.
  const cosWave = ctx.createPeriodicWave(
    Float32Array.from([0, 1]),
    Float32Array.from([0, 0]),
    { disableNormalization: true },
  )
  const sinWave = ctx.createPeriodicWave(
    Float32Array.from([0, 0]),
    Float32Array.from([0, 1]),
    { disableNormalization: true },
  )
  const oscX = ctx.createOscillator()
  oscX.setPeriodicWave(cosWave)
  const oscZ = ctx.createOscillator()
  oscZ.setPeriodicWave(sinWave)
  const oscY = ctx.createOscillator()
  oscY.type = 'sine'
  const radX = ctx.createGain()
  const radZ = ctx.createGain()
  const radY = ctx.createGain()
  radX.gain.value = 0
  radZ.gain.value = 0
  radY.gain.value = 0
  // Вертикальная LFO модулирует и высоту источника, и срез фильтра (для 10D).
  const filterMod = ctx.createGain()
  filterMod.gain.value = 0
  oscX.connect(radX).connect(panner.positionX)
  oscZ.connect(radZ).connect(panner.positionZ)
  oscY.connect(radY).connect(panner.positionY)
  oscY.connect(filterMod).connect(spatialFilter.frequency)
  oscX.frequency.value = 0.12
  oscZ.frequency.value = 0.12
  oscY.frequency.value = 0.07
  const t0 = ctx.currentTime
  oscX.start(t0)
  oscZ.start(t0)
  oscY.start(t0)

  // ── Реверб + эхо («РЭ») ──
  const convolver = ctx.createConvolver()
  convolver.buffer = makeImpulseResponse(ctx, 2.6, 2.4)
  const reverbGain = ctx.createGain()
  reverbGain.gain.value = 0

  const delay = ctx.createDelay(1.0)
  delay.delayTime.value = 0.3
  const feedback = ctx.createGain()
  feedback.gain.value = 0
  const echoGain = ctx.createGain()
  echoGain.gain.value = 0

  // Разводка веток: input → каждая ветка → output.
  input.connect(dryGain).connect(output)
  input.connect(panner)
  panner.connect(spatialFilter).connect(spatialGain).connect(output)
  input.connect(convolver).connect(reverbGain).connect(output)
  input.connect(delay)
  delay.connect(feedback).connect(delay) // петля обратной связи эха
  delay.connect(echoGain).connect(output)

  return {
    input,
    output,
    dryGain,
    panner,
    spatialFilter,
    spatialGain,
    oscX,
    oscZ,
    oscY,
    radX,
    radZ,
    radY,
    filterMod,
    convolver,
    reverbGain,
    delay,
    feedback,
    echoGain,
  }
}

/** Центральные частоты полос эквалайзера. */
export const EQ_FREQS = [60, 150, 400, 1000, 2400, 15000] as const

export const ensureAudioGraph = (): boolean => {
  if (ac) return true
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ac = new Ctx()
    source = ac.createMediaElementSource(audioEngine.element)
    normGain = ac.createGain()
    normGain.gain.value = 1
    xfadeGain = ac.createGain()
    xfadeGain.gain.value = 1
    analyser = ac.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.82
    eqNodes = EQ_FREQS.map((f, i) => {
      const b = ac!.createBiquadFilter()
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking'
      b.frequency.value = f
      b.Q.value = 1
      b.gain.value = 0
      return b
    })
    // source → normGain → eq[0..n] → fx → xfadeGain → analyser → destination
    source.connect(normGain)
    let prev: AudioNode = normGain
    for (const n of eqNodes) {
      prev.connect(n)
      prev = n
    }
    fx = buildFx(ac)
    prev.connect(fx.input)
    fx.output.connect(xfadeGain)
    xfadeGain.connect(analyser)
    analyser.connect(ac.destination)
    return true
  } catch (e) {
    console.warn('audioGraph init error', e)
    ac = null
    fx = null
    return false
  }
}

/** Возобновить контекст (звать в user-gesture / на play, иначе граф = тишина). */
export const resumeAudioGraph = (): void => {
  if (ac && ac.state === 'suspended') void ac.resume()
}

export const getAnalyserNode = (): AnalyserNode | null => analyser
export const getAudioContext = (): AudioContext | null => ac
export const getNormGainNode = (): GainNode | null => normGain
export const getXfadeGainNode = (): GainNode | null => xfadeGain
export const getEqNodes = (): BiquadFilterNode[] => eqNodes
export const getFxGraph = (): FxGraph | null => fx
export const isAudioGraphReady = (): boolean => ac != null
