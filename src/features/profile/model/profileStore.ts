import { create } from 'zustand'
import { t } from '@shared/i18n'

/**
 * Профиль пользователя приложения. набора `acc*`-переменных
 * + persist в `localStorage['bloom_profile']` (saveProfile).
 *
 * Хранит только данные карточки профиля (ник/био/статус/аватар/баннер/цвета).
 * Старые поля `discIdx`/`discColor` (пресеты винил-аватара) при загрузке
 * игнорируются и больше не пишутся — дефолтный аватар теперь заглушка.
 * Счётчики (playCount) в bloom НЕ ведутся — статистика считается из
 * `useHistoryStore`/`useActivityStore` (см. StatsSection). Поле `playCount` из
 * старого формата при загрузке игнорируем, при сохранении не пишем.
 *
 * `editOpen`/`shareOpen` — флаги модалок профиля (редактирование/шаринг);
 * кнопки карточки выставляют их.
 */

export type BannerColorMode = 'solid' | 'gradient'

export interface ProfileData {
  name: string
  bio: string
  status: string
  bannerColor: string
  bannerColor2: string
  bannerColorMode: BannerColorMode
  bannerAngle: number
  /** data-URL загруженного аватара (null = заглушка с человечком). */
  avatar: string | null
  /** data-URL загруженного баннера (null = цвет/градиент). */
  banner: string | null
}

export const PROFILE_DEFAULTS: ProfileData = {
  name: t('common.defaultUser'),
  bio: '',
  status: '',
  bannerColor: '#1a1a1a',
  bannerColor2: '#0d0d0d',
  bannerColorMode: 'solid',
  bannerAngle: 135,
  avatar: null,
  banner: null,
}

const LS_KEY = 'bloom_profile'

const load = (): ProfileData => {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (!p || typeof p !== 'object') return { ...PROFILE_DEFAULTS }
    return {
      name: typeof p.name === 'string' && p.name ? p.name : PROFILE_DEFAULTS.name,
      bio: typeof p.bio === 'string' ? p.bio : '',
      status: typeof p.status === 'string' ? p.status : '',
      bannerColor: typeof p.bannerColor === 'string' ? p.bannerColor : PROFILE_DEFAULTS.bannerColor,
      bannerColor2: typeof p.bannerColor2 === 'string' ? p.bannerColor2 : PROFILE_DEFAULTS.bannerColor2,
      bannerColorMode: p.bannerColorMode === 'gradient' ? 'gradient' : 'solid',
      bannerAngle: typeof p.bannerAngle === 'number' ? p.bannerAngle : PROFILE_DEFAULTS.bannerAngle,
      avatar: typeof p.avatar === 'string' ? p.avatar : null,
      banner: typeof p.banner === 'string' ? p.banner : null,
    }
  } catch {
    return { ...PROFILE_DEFAULTS }
  }
}

const pickData = (s: ProfileData): ProfileData => ({
  name: s.name,
  bio: s.bio,
  status: s.status,
  bannerColor: s.bannerColor,
  bannerColor2: s.bannerColor2,
  bannerColorMode: s.bannerColorMode,
  bannerAngle: s.bannerAngle,
  avatar: s.avatar,
  banner: s.banner,
})

/**
 * Сохранение с фолбэком: при переполнении localStorage (большие data-URL
 * аватара/баннера) пишем «slim»-версию без картинок —
 * saveProfile.
 */
const save = (data: ProfileData): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ...data, avatar: null, banner: null }))
    } catch {
      // ничего не поделать — игнорируем
    }
  }
}

interface ProfileState extends ProfileData {
  editOpen: boolean
  shareOpen: boolean
  setProfile: (patch: Partial<ProfileData>) => void
  openEdit: () => void
  closeEdit: () => void
  openShare: () => void
  closeShare: () => void
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...load(),
  editOpen: false,
  shareOpen: false,

  setProfile: (patch) => {
    set(patch)
    save(pickData(get()))
  },

  openEdit: () => set({ editOpen: true }),
  closeEdit: () => set({ editOpen: false }),
  openShare: () => set({ shareOpen: true }),
  closeShare: () => set({ shareOpen: false }),
}))
