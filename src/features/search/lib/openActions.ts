import { trackRegistry, type Track } from '@entities/track'
import type { Artist } from '@entities/artist'
import type { Playlist } from '@entities/playlist'
import { playSingleTrack } from '@features/player'
import { useLibStore, tracksCountLabel } from '@features/library'
import { getProvider } from '@features/providers'
import { useSearchStore, type RecentItem } from '../model/store'
import { useDetailStore, type DetailTarget } from '../model/detailStore'

/**
 * Действия по результату/недавнему, общие для страницы поиска (`SearchPage`) и
 * всплывающего поиска (`SearchOverlay`). Все стороны берут стор через
 * `getState()` — функции вызываются из обработчиков, реактивность не нужна.
 */

/** Открыть детальный вид + записать в «недавно открытые» (author — в подзаголовок). */
export const openSearchTarget = (target: DetailTarget, author?: string): void => {
  useSearchStore.getState().pushRecentItem({ ...target, author })
  useDetailStore.getState().open(target)
}

/** Открыть страницу артиста из выдачи (у артиста автора нет → подзаголовок «Артист»). */
export const openArtistFromSearch = (a: Artist): void =>
  openSearchTarget({
    kind: 'artist',
    providerId: a.source ?? 'soundcloud',
    id: a.id,
    title: a.name,
    cover: a.avatar ?? null,
    round: true,
  })

/**
 * Открыть плейлист/альбом из выдачи. Аватарку владельца и год отдаём сразу —
 * hero покажет их, не дожидаясь загрузки страницы.
 */
export const openPlaylistFromSearch = (p: Playlist, kind: 'album' | 'playlist'): void =>
  openSearchTarget(
    {
      kind,
      providerId: p.source ?? 'soundcloud',
      id: p.id,
      title: p.title,
      cover: p.cover ?? null,
      subtitle: tracksCountLabel(p.trackCount),
      ownerAvatar: p.ownerAvatar ?? null,
      year: p.year,
      round: false,
    },
    p.ownerName, // автор/владелец → «{owner} · Плейлист/Альбом»
  )

/** Проиграть трек ИЗ ПОИСКА (очередь из одного трека) + записать в «недавние». */
export const playSearchTrack = (t: Track): void => {
  useSearchStore.getState().pushRecentItem({
    kind: 'track',
    providerId: t._ym ? 'yandex' : t._ytm ? 'ytmusic' : t._sc ? 'soundcloud' : 'local',
    id: t.id,
    title: t.name,
    cover: t.cover ?? null,
    author: t.artist, // → подзаголовок «{артист} · Трек»
    round: false,
  })
  playSingleTrack(t.id)
}

/**
 * Клик по элементу «недавно открытые»: трек → играть (с ре-резолвом по id после
 * рестарта, когда трека уже нет ни в библиотеке, ни в реестре); артист / альбом /
 * плейлист → открыть DetailView.
 */
export const openRecentItem = (it: RecentItem): void => {
  if (it.kind === 'track') {
    useSearchStore.getState().pushRecentItem(it) // наверх
    const found =
      useLibStore.getState().tracks.some((t) => t.id === it.id) || !!trackRegistry.get(it.id)
    if (found) {
      playSingleTrack(it.id)
      return
    }
    const prov = getProvider(it.providerId)
    void prov?.resolveTrackById?.(it.id).then((t) => {
      if (t) playSingleTrack(t.id)
    })
    return
  }
  openSearchTarget({
    kind: it.kind,
    providerId: it.providerId,
    id: it.id,
    title: it.title,
    cover: it.cover ?? null,
    subtitle: it.subtitle,
    round: it.round,
  })
}
