/**
 * Низкоуровневый звуковой движок главного окна.
 *
 * Один HTMLAudioElement на весь app. Хранится в этом модуле (singleton).
 * Не предполагает работы в mirror окнах (tray-popup/miniplayer) — у них только
 * usePlayerBridge со зеркальным стейтом.
 *
 * Что НЕ делает (отложено):
 * - AudioContext + GainNode (нужны для визуализатора и crossfade — фаза 19).
 * - MediaSession API (фаза polish).
 * - pitch.
 *
 * SoundCloud HLS — через hls.js: при `play(url, {hls:true})` поднимаем Hls,
 * `attachMedia` на тот же `<audio>`, чтобы громкость/скорость/события работали
 * как с обычным src. `_scPlayFromUrl`.
 */
import Hls from 'hls.js'

type Listener = () => void

class AudioEngine {
  private audio = new Audio()
  /** Активный Hls-инстанс (только для HLS-потоков SC); null для обычных src. */
  private hls: Hls | null = null
  /** Текущий загруженный источник (url) — чтобы не перезагружать при toggle. */
  private curSrc = ''
  /** Колбэки на onended (когда трек доиграл до конца). */
  private endedListeners = new Set<Listener>()
  /** Колбэки на смену времени/состояния (вызывается чаще). */
  private updateListeners = new Set<Listener>()
  /** Колбэки на loadedmetadata (пришла длительность). */
  private metaListeners = new Set<Listener>()
  /** Колбэки на error при загрузке/воспроизведении. */
  private errorListeners = new Set<Listener>()

  constructor() {
    this.audio.preload = 'auto'
    this.audio.addEventListener('timeupdate', this.onTimeUpdate)
    this.audio.addEventListener('play', this.onTimeUpdate)
    this.audio.addEventListener('pause', this.onTimeUpdate)
    this.audio.addEventListener('ended', this.onEnded)
    this.audio.addEventListener('loadedmetadata', this.onMeta)
    this.audio.addEventListener('error', this.onError)
  }

  private onTimeUpdate = () => {
    for (const cb of this.updateListeners) cb()
  }
  private onEnded = () => {
    for (const cb of this.endedListeners) cb()
  }
  private onMeta = () => {
    for (const cb of this.metaListeners) cb()
  }
  private onError = () => {
    for (const cb of this.errorListeners) cb()
  }

  // ── Listeners (return unsubscribe) ──
  onEndedSubscribe(cb: Listener): () => void {
    this.endedListeners.add(cb)
    return () => this.endedListeners.delete(cb)
  }
  onUpdate(cb: Listener): () => void {
    this.updateListeners.add(cb)
    return () => this.updateListeners.delete(cb)
  }
  onLoadedMeta(cb: Listener): () => void {
    this.metaListeners.add(cb)
    return () => this.metaListeners.delete(cb)
  }
  onErrorSubscribe(cb: Listener): () => void {
    this.errorListeners.add(cb)
    return () => this.errorListeners.delete(cb)
  }

  // ── Команды ──
  /** Снести активный Hls (при смене трека / stop). */
  private teardownHls(): void {
    if (this.hls) {
      this.hls.destroy()
      this.hls = null
    }
  }

  /** Загрузить источник в `<audio>` (progressive/blob/local) или через hls.js. */
  private setSource(src: string, hls: boolean): void {
    this.teardownHls()
    this.curSrc = src
    if (hls && Hls.isSupported()) {
      // HLS-сегменты с CDN требуют CORS — anonymous включает корректный режим.
      this.audio.crossOrigin = 'anonymous'
      this.hls = new Hls({ enableWorker: false })
      this.hls.loadSource(src)
      this.hls.attachMedia(this.audio)
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void this.audio.play().catch(() => {})
      })
      this.hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) this.teardownHls()
      })
    } else {
      // crossOrigin='anonymous' для удалённых http(s)-потоков (SC progressive),
      // чтобы createMediaElementSource визуализатора НЕ «портил» поток (tainted →
      // analyser отдаёт тишину → звук пропадает). SC CDN отдаёт CORS-заголовки.
      // Для blob/data (local, same-origin) crossOrigin не нужен.
      //. Эффект — только на новые загрузки.
      this.audio.crossOrigin = /^https?:/i.test(src) ? 'anonymous' : null
      this.audio.src = src
    }
  }

  load(src: string): void {
    this.setSource(src, false)
  }

  /** Загрузить и попытаться запустить. Если автоплей запрещён — обрабатываем. */
  async play(src?: string, opts?: { hls?: boolean }): Promise<void> {
    if (src !== undefined && src !== this.curSrc) this.setSource(src, !!opts?.hls)
    try {
      await this.audio.play()
    } catch {
      // autoplay restriction или ошибка — состояние paused, listeners сами увидят.
    }
  }
  pause(): void {
    this.audio.pause()
  }
  async toggle(): Promise<void> {
    if (this.audio.paused) await this.play()
    else this.pause()
  }
  stop(): void {
    this.teardownHls()
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.curSrc = ''
    this.audio.load()
  }
  seekTo(sec: number): void {
    if (!Number.isFinite(sec) || !this.audio.duration) return
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, sec))
  }
  setVolume(v0to100: number): void {
    this.audio.volume = Math.max(0, Math.min(1, v0to100 / 100))
  }
  /**
   * Скорость воспроизведения. `defaultPlaybackRate` нужен, чтобы при загрузке
   * нового src `playbackRate` не сбрасывался к 1 (по спецификации media-элемент
   * восстанавливает playbackRate из defaultPlaybackRate при load).
   */
  setPlaybackRate(rate: number): void {
    this._rate = rate
    this.audio.defaultPlaybackRate = rate
    this.audio.playbackRate = rate
  }
  private _rate = 1

  // ── Getters ──
  get paused(): boolean {
    return this.audio.paused
  }
  get currentTime(): number {
    return this.audio.currentTime || 0
  }
  get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0
  }
  get src(): string {
    return this.audio.src
  }
  /** Сырой текущий источник (url, переданный в play/load) — для сравнения «тот же трек». */
  get currentSrc(): string {
    return this.curSrc
  }
  get playbackRate(): number {
    return this._rate
  }
  /** Прямой доступ к элементу — для будущей привязки AudioContext (виза). */
  get element(): HTMLAudioElement {
    return this.audio
  }
}

export const audioEngine = new AudioEngine()
