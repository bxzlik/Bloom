import { gameToast } from '../lib/gameToast'

/**
 * Состояние и движок «Тамагочи».
 *
 * Состояние — модульный синглтон `tamaState`,
 * чтобы и компонент игры, и фоновый хук «конец трека» мутировали ОДИН объект
 *. Persist — localStorage `bloom_tama`.
 *
 * Еда зарабатывается прослушиванием музыки: на каждый доигравший до конца трек
 * `earnFoodFromSong` начисляет +1 еду. Подписка живёт в
 * App (`useTamaBootstrap`) — поэтому работает даже когда игра закрыта (в
 * хук тоже был глобальным, но активировался лишь после первого открытия игры;
 * здесь — всегда, что чуть лучше).
 */

export type TamaMoodKey = 'dancing' | 'happy' | 'hungry' | 'sad' | 'sleepy'

export interface TamaState {
  born: number
  hunger: number
  happiness: number
  food: number
  totalFed: number
  totalPets: number
  songsListened: number
  achievements: Record<string, boolean>
  name: string
  lastUpdate: number
}

export interface TamaAchievement {
  id: string
  icon: string
  name: string
  desc: string
  check: (s: TamaState) => boolean
}

export const TAMA_MOODS: Record<TamaMoodKey, { char: string; label: string; css: string }> = {
  dancing: { char: 'ノ(◕ヮ◕)ノ', label: 'Танцует! 🎵', css: 'mood-dancing' },
  happy: { char: '(＾▽＾)', label: 'Доволен~', css: 'mood-happy' },
  hungry: { char: '(>_<)', label: 'Голодный!!', css: 'mood-hungry' },
  sad: { char: '(T▽T)', label: 'Грустит...', css: 'mood-sad' },
  sleepy: { char: '(-.-)zzZ', label: 'Дрыхнет...', css: 'mood-sleepy' },
}

export const TAMA_ACHIEVEMENTS: TamaAchievement[] = [
  { id: 'born', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.5 2 5 6.5 5 11a7 7 0 0 0 14 0c0-4.5-3.5-9-7-9z"/></svg>', name: 'Рождение', desc: 'Завести питомца', check: () => true },
  { id: 'fed10', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>', name: 'Хорошо кормят', desc: 'Покормить 10 раз', check: (s) => (s.totalFed || 0) >= 10 },
  { id: 'pet20', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>', name: 'Любимчик', desc: 'Погладить 20 раз', check: (s) => (s.totalPets || 0) >= 20 },
  { id: 'songs50', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>', name: 'Меломан', desc: 'Послушать 50 треков вместе', check: (s) => (s.songsListened || 0) >= 50 },
  { id: 'day1', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>', name: 'День рождения', desc: 'Питомцу исполнился 1 день', check: (s) => tamaAgeHours(s) >= 24 },
  { id: 'week1', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', name: 'Неделя', desc: 'Питомцу 7 дней', check: (s) => tamaAgeHours(s) >= 168 },
]

export const TAMA_PHRASES: Record<string, string[]> = {
  dancing: ['Крутой трек! 🔥', 'Я обожаю эту песню!', 'Погромче! 🎶', 'Врываемся!'],
  happy: ['Мне хорошо 😊', 'Всё отлично!', 'Рад тебя видеть!', 'Хороший день~'],
  sleepy: ['Хочу спать... 💤', 'Уааааа...', 'Тихо, пожалуйста...'],
  hungry: ['Хочу есть! 🍖', 'ПОКОРМИ МЕНЯ', 'Голодно (>_<)', 'Желудок урчит...'],
  sad: ['Мне плохо...', 'Побудь со мной', 'Включи музыку...', 'Скучно :('],
  pet: ['Спасибо! ♡', 'Ещё! Ещё!', 'Хи-хи ~', 'Мурр~', 'Тепло!'],
}

const LS_KEY = 'bloom_tama'

/** Модульный синглтон состояния. */
export let tamaState: TamaState | null = null

export function tamaAgeHours(s: TamaState | null): number {
  return s && s.born ? (Date.now() - s.born) / 3600000 : 0
}

/** Загрузка + применение деградации за прошедшее время (макс 8ч). tamaLoad. */
export function loadTama(): TamaState {
  let st: Partial<TamaState> | null = null
  try {
    st = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
  } catch {
    st = null
  }
  const s = (st || {}) as TamaState
  const now = Date.now()
  if (!s.born) s.born = now
  if (s.hunger === undefined) s.hunger = 100
  if (s.happiness === undefined) s.happiness = 80
  if (!s.food) s.food = 3
  if (!s.totalFed) s.totalFed = 0
  if (!s.totalPets) s.totalPets = 0
  if (!s.songsListened) s.songsListened = 0
  if (!s.achievements) s.achievements = {}
  if (!s.name) s.name = 'Малыш'
  if (!s.lastUpdate) s.lastUpdate = now
  const minPassed = Math.min((now - s.lastUpdate) / 60000, 480)
  if (minPassed > 0) {
    s.hunger = Math.max(0, s.hunger - minPassed * 0.05)
    s.happiness = Math.max(0, s.happiness - minPassed * 0.02)
    s.lastUpdate = now
  }
  tamaState = s
  return s
}

export function saveTama(): void {
  if (!tamaState) return
  tamaState.lastUpdate = Date.now()
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tamaState))
  } catch {
    /* ignore */
  }
}

/** Сброс к новорождённому питомцу. */
export function resetTama(): TamaState {
  localStorage.removeItem(LS_KEY)
  tamaState = null
  return loadTama()
}

/** Текущее настроение по сытости/счастью/музыке/времени суток. */
export function tamaMood(s: TamaState | null, musicPlaying: boolean): TamaMoodKey {
  if (!s) return 'happy'
  if (s.hunger < 25) return 'hungry'
  if (s.happiness < 28) return 'sad'
  if (musicPlaying && s.happiness > 45) return 'dancing'
  const h = new Date().getHours()
  if (h >= 23 || h < 7) return 'sleepy'
  if (s.happiness < 50) return 'sleepy'
  return 'happy'
}

/** Проверка достижений + тост. */
export function checkTamaAchievements(): void {
  const s = tamaState
  if (!s) return
  if (!s.achievements) s.achievements = {}
  let changed = false
  TAMA_ACHIEVEMENTS.forEach((a) => {
    if (!s.achievements[a.id] && a.check(s)) {
      s.achievements[a.id] = true
      changed = true
      gameToast('tama', 'Достижение питомца: ' + a.name)
    }
  })
  if (changed) saveTama()
}

/** Доигравший трек → +1 еда. Грузит состояние при первом вызове. */
export function earnFoodFromSong(): void {
  if (!tamaState) loadTama()
  const s = tamaState!
  s.songsListened = (s.songsListened || 0) + 1
  s.food = (s.food || 0) + 1
  s.happiness = Math.min(100, (s.happiness || 0) + 5)
  saveTama()
  checkTamaAchievements()
  gameToast('tama', '+1 еда для питомца!')
}
