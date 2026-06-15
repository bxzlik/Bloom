/**
 * Единый WebAudio-граф над `audioEngine.element`.
 *
 * Цепочка: source → normGain → eq[0..5] → xfadeGain → analyser → destination
 *   - normGain  — нормализация громкости (множитель на трек)
 *   - eq[]      — 6-полосный эквалайзер (BiquadFilter; в покое gain=0)
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
    // source → normGain → eq[0..n] → xfadeGain → analyser → destination
    source.connect(normGain)
    let prev: AudioNode = normGain
    for (const n of eqNodes) {
      prev.connect(n)
      prev = n
    }
    prev.connect(xfadeGain)
    xfadeGain.connect(analyser)
    analyser.connect(ac.destination)
    return true
  } catch (e) {
    console.warn('audioGraph init error', e)
    ac = null
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
export const isAudioGraphReady = (): boolean => ac != null
