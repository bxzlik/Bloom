import { create } from 'zustand'

/**
 * Глобальное состояние модалки «Поделиться» (#shareCardMover / openShareCardModal).
 * Вызывается из разных мест (страница артиста/альбома/плейлиста,
 * ПКМ-меню трека), поэтому единый стор + единственный `<ShareCardModal>` в App —
 * как `useTrackInfoStore` (см. [[project-bloom-track-badges-artistlinks]]).
 */

export type ShareKind = 'track' | 'artist' | 'album' | 'playlist'

/** Сырой ввод от вызывающего — из него строится shareUrl. */
export interface ShareInput {
  type: ShareKind
  id?: string | number | null
  /** Заголовок трека/альбома/плейлиста. */
  title?: string | null
  /** Имя артиста (для type='artist'). */
  name?: string | null
  /** Артист трека (подпись). */
  artist?: string | null
  permalink?: string | null
  cover?: string | null
}

/** Готовые данные для рендера карточки. */
export interface ShareData {
  type: ShareKind
  title: string
  artist: string
  cover: string | null
  shareUrl: string
}

const SHARE_BASE = 'https://bxzlik.github.io/bloom/share/'

/** Построить share-ссылку (cxshare / _spShareCurrentPanel). */
export const buildShareUrl = (input: ShareInput): string => {
  const cover = input.cover && input.cover.startsWith('http') ? input.cover : null
  const params: Record<string, string> =
    input.type === 'artist'
      ? {
          type: 'artist',
          id: String(input.id ?? ''),
          name: input.name ?? input.title ?? '',
          permalink: input.permalink ?? '',
        }
      : {
          type: input.type,
          id: String(input.id ?? ''),
          title: input.title ?? '',
          artist: input.artist ?? '',
          permalink: input.permalink ?? '',
        }
  if (cover) params.cover = cover
  return SHARE_BASE + '?' + new URLSearchParams(params).toString()
}

interface ShareState {
  data: ShareData | null
  /** Открыть модалку «Поделиться» для трека/артиста/альбома/плейлиста. */
  openShare: (input: ShareInput) => void
  closeShare: () => void
}

export const useShareStore = create<ShareState>((set) => ({
  data: null,
  openShare: (input) => {
    const cover = input.cover && input.cover.startsWith('http') ? input.cover : null
    set({
      data: {
        type: input.type,
        title: input.type === 'artist' ? input.name ?? input.title ?? '' : input.title ?? '',
        artist: input.artist ?? '',
        cover,
        shareUrl: buildShareUrl(input),
      },
    })
  },
  closeShare: () => set({ data: null }),
}))
