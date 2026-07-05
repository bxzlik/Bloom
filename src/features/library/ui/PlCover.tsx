import { useMemo } from 'react'
import { PlaylistCover } from '@shared/ui'
import { trackRegistry } from '@entities/track'
import { useLibStore } from '../model'

/**
 * Обложка плейлиста, которая сама достаёт обложки треков из lib-стора (+ реестра
 * стриминга) и рисует коллаж-мозаику (`PlaylistCover`). Обёртка для мест, где под
 * рукой только `Playlist` без готового `tracksById`: контекстные меню, попапы,
 * карточки на главной. Реактивна к изменению библиотеки.
 */
export const PlCover = ({ trs, seed }: { trs: string[]; seed: string }) => {
  const tracks = useLibStore((s) => s.tracks)
  const covers = useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]))
    return trs.map((id) => (byId.get(id) ?? trackRegistry.get(id))?.cover)
  }, [tracks, trs])
  return <PlaylistCover covers={covers} seed={seed} />
}
