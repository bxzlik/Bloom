import { create } from 'zustand'
import type { MpState } from '@shared/tauri'
import type { RepeatMode } from './types'
import { loadVolumePrefs } from './volumePrefs'

const isRepeatMode = (n: number): n is RepeatMode => n === 0 || n === 1 || n === 2
const nextRepeat = (n: RepeatMode): RepeatMode => ((n + 1) % 3) as RepeatMode

/**
 * Zustand-стор плеера. Используется во ВСЕХ окнах:
 *
 * - В main окне это **источник правды**: HTML-аудио меняет состояние,
 *   пушится в Rust через `now_playing()`. Реализация — на шаге 10.
 * - В miniplayer / tray-popup это **зеркало**: хук `usePlayerBridge`
 *   подписывается на `bloom-mp-state` от Rust и заливает сюда.
 *
 * Optimistic-методы (`togglePlay`, `toggleFav`, `toggleShuffle`, `cycleRepeat`,
 * `toggleMute`) применяют изменение в локальный стор сразу — Rust подтвердит
 * через bloom-mp-state, и при расхождении перетрёт. Это даёт мгновенный отклик.
 */
export interface PlayerState {
  title: string
  artist: string
  artwork: string | null
  playing: boolean
  /** Секунды. */
  position: number
  /** Секунды. */
  duration: number
  /** 0..100 */
  volume: number
  shuffle: boolean
  /** «Умная» перемешка активна (подвид shuffle). Зеркалит queueStore.smartShuffle. */
  smartShuffle: boolean
  repeat: RepeatMode
  fav: boolean
  canAddToLib: boolean
  /**
   * Пользовательская обложка-override (раздел «Кастомизация» → контекст Обложка).
   * Если задана — показывается ВМЕСТО artwork во всех местах обложки плеера
   *. Пишется customizationStore. null = нет.
   */
  coverOverride: string | null
  /**
   * Фото визуализатора (раздел «Кастомизация» → контекст Визуализатор). Если
   * задано — в #vizWrap показывается картинка вместо canvas-баров.
   * Пишется customizationStore. null = нет.
   */
  vizPhoto: string | null
  /**
   * Своё фото для ползунка слайдера (раздел «Кастомизация» → контекст Слайдер).
   * Если задано — показывается на thumb прогресса (PagePlayer/BigPicture) при
   * любом типе слайдера, кроме волнового. Пишется customizationStore. null = нет.
   */
  sliderThumb: string | null
  /** URL трека (SC permalink) — для Discord-кнопки «На трек». null = нет ссылки. */
  trackUrl: string | null
  /** URL артиста (SC permalink) — для Discord-кнопки «На артиста». */
  artistUrl: string | null
  /** Запоминается перед mute, чтобы вернуть тот же уровень. */
  _prevVolume: number

  setFromMpState: (s: MpState) => void

  // — низкоуровневые сеттеры (для bridge / drag) —
  setPlaying: (v: boolean) => void
  setPosition: (sec: number) => void
  setVolume: (v: number) => void

  // — optimistic toggles для UI —
  togglePlay: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  toggleFav: () => void
  /** Если volume>0 — обнуляем (запомнив prev); иначе восстанавливаем prev. Возвращает новое значение. */
  toggleMute: () => number
}

const _vol = loadVolumePrefs()

export const usePlayerStore = create<PlayerState>((set, get) => ({
  title: '',
  artist: '',
  artwork: null,
  playing: false,
  position: 0,
  duration: 0,
  volume: _vol.volume,
  shuffle: false,
  smartShuffle: false,
  repeat: 0,
  fav: false,
  canAddToLib: false,
  coverOverride: null,
  vizPhoto: null,
  sliderThumb: null,
  trackUrl: null,
  artistUrl: null,
  _prevVolume: _vol.prevVolume,

  setFromMpState: (s) =>
    set({
      title: s.title,
      artist: s.artist,
      artwork: s.artwork ?? null,
      playing: s.playing,
      position: s.position,
      duration: s.duration,
      volume: s.volume,
      shuffle: s.shuffle,
      repeat: isRepeatMode(s.repeat) ? s.repeat : 0,
      fav: s.fav,
      canAddToLib: s.can_add_to_lib,
    }),

  setPlaying: (v) => set({ playing: v }),
  setPosition: (sec) => set({ position: sec }),
  setVolume: (v) => set({ volume: v }),

  togglePlay: () => set((s) => ({ playing: !s.playing })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () => set((s) => ({ repeat: nextRepeat(s.repeat) })),
  toggleFav: () => set((s) => ({ fav: !s.fav })),

  toggleMute: () => {
    const cur = get().volume
    if (cur > 0) {
      set({ _prevVolume: cur, volume: 0 })
      return 0
    }
    const restored = get()._prevVolume || 100
    set({ volume: restored })
    return restored
  },
}))
