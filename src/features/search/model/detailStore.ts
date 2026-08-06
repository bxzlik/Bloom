import { create } from 'zustand'
import { useNavStore, type PageId } from '@app/navigationStore'

export type DetailKind = 'artist' | 'album' | 'playlist'

/**
 * Что открыто в детальном виде. `id` — id сущности (`sc_artist_<id>` /
 * `sc_pl_<id>` / локальный pl id); `providerId` — у кого спрашивать данные
 * (`getProvider(providerId).getArtist/getAlbum/getPlaylist(id)`).
 * Поля title/cover/subtitle — для мгновенного hero до завершения сетевой загрузки.
 */
export interface DetailTarget {
  kind: DetailKind
  providerId: string
  id: string
  title: string
  cover?: string | null
  subtitle?: string
  /** Аватарка владельца/артиста (альбом/плейлист) — строка владельца в hero. */
  ownerAvatar?: string | null
  /** Год выпуска (альбом) — стат в hero. */
  year?: string
  /** Круглый аватар (артист) vs квадратная обложка (альбом/плейлист). */
  round?: boolean
}

/** Пустой стек — стабильная ссылка, чтобы селекторы не дёргали ре-рендер. */
const EMPTY: DetailTarget[] = []

/** Страница, к которой относится открываемый/текущий детальный вид. */
const curPage = (): PageId => useNavStore.getState().page

interface DetailState {
  /**
   * Стеки переходов ПО СТРАНИЦАМ: детальный вид живёт на той странице, где его
   * открыли. Уход на другую вкладку прячет оверлей, возврат — показывает снова
   * (с тем же стеком «артист → его альбом»).
   */
  stacks: Partial<Record<PageId, DetailTarget[]>>
  /**
   * Номер открытия ПО СТРАНИЦАМ: растёт только на `open` и только у своей
   * страницы. По нему DetailView отличает новое открытие (играет анимация
   * появления, скролл/вкладка с нуля) от возврата на вкладку, где вид уже был
   * открыт (показывается сразу, с прежним скроллом и вкладкой). Считаем на
   * страницу, иначе открытие в одной вкладке сбрасывало бы вид в другой.
   */
  openSeq: Partial<Record<PageId, number>>
  /** Открыть с нуля на текущей странице (очищает её стек). */
  open: (t: DetailTarget) => void
  /** Углубиться (альбом внутри артиста). */
  push: (t: DetailTarget) => void
  /** Назад на предыдущий уровень (или закрыть, если он один). */
  back: () => void
  /** Полностью закрыть детальный вид текущей страницы. */
  close: () => void
}

/**
 * Состояние детальных страниц поиска (артист / альбом / плейлист).
 * Стек произвольной глубины, свой на каждую страницу приложения.
 */
export const useDetailStore = create<DetailState>((set) => ({
  stacks: {},
  openSeq: {},
  open: (t) =>
    set((s) => {
      const p = curPage()
      return { stacks: { ...s.stacks, [p]: [t] }, openSeq: { ...s.openSeq, [p]: (s.openSeq[p] ?? 0) + 1 } }
    }),
  push: (t) =>
    set((s) => {
      const p = curPage()
      return { stacks: { ...s.stacks, [p]: [...(s.stacks[p] ?? EMPTY), t] } }
    }),
  back: () =>
    set((s) => {
      const p = curPage()
      const st = s.stacks[p] ?? EMPTY
      return { stacks: { ...s.stacks, [p]: st.length > 1 ? st.slice(0, -1) : EMPTY } }
    }),
  close: () => set((s) => ({ stacks: { ...s.stacks, [curPage()]: EMPTY } })),
}))

/** Стек детального вида ТЕКУЩЕЙ страницы (реактивно). */
export const useDetailStack = (): DetailTarget[] => {
  const page = useNavStore((s) => s.page)
  return useDetailStore((s) => s.stacks[page] ?? EMPTY)
}

/** Верхушка стека текущей страницы — что именно показано (или null). */
export const useDetailTop = (): DetailTarget | null => {
  const stack = useDetailStack()
  return stack[stack.length - 1] ?? null
}

/**
 * Номер текущего открытия на активной странице. Меняется только когда на ЭТОЙ
 * странице открыли вид заново — этим DetailView отделяет новое открытие от
 * возврата на вкладку (анимация, сохранённые скролл/вкладка).
 */
export const useDetailOpenSeq = (): number => {
  const page = useNavStore((s) => s.page)
  return useDetailStore((s) => s.openSeq[page] ?? 0)
}

/** Виден ли детальный оверлей на текущей странице. */
export const useDetailOpen = (): boolean => {
  const page = useNavStore((s) => s.page)
  return useDetailStore((s) => (s.stacks[page]?.length ?? 0) > 0)
}
