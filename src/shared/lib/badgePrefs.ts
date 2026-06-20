import { create } from 'zustand'

/**
 * Глобальная настройка цвета бейджей источника (SoundCloud/Yandex/YTM/Spotify).
 *
 * По умолчанию бейджи рисуются в СВОИХ брендовых цветах. Тоггл `accentBadges`
 * перекрашивает их в цвет акцента (прежнее поведение). Живёт в `@shared`, чтобы
 * `entities/SourceBadge` мог читать настройку, не нарушая слои FSD (entities не
 * импортит из features). Persist в localStorage.
 */

const LS_KEY = 'bloom_accent_badges'

const loadInitial = (): boolean => {
  try {
    return localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

interface BadgePrefsState {
  /** true → красить бейджи в акцент; false (по умолчанию) → брендовые цвета. */
  accentBadges: boolean
  setAccentBadges: (v: boolean) => void
}

export const useBadgePrefs = create<BadgePrefsState>((set) => ({
  accentBadges: loadInitial(),
  setAccentBadges: (v) => {
    try {
      localStorage.setItem(LS_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ accentBadges: v })
  },
}))
