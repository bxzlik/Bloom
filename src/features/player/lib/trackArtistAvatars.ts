/**
 * Аватарки артистов трека — стопкой перед их именем в плеере (порт мобильного
 * `features/player/ui/artist_avatars.dart`).
 *
 * Аватарки настоящие, с площадки: у трека своя картинка есть только у аккаунта,
 * который его залил, остальных приходится искать по имени. Поиск — общий с
 * топами профиля и «Итогов» (`useArtistAvatars`), поэтому его кеш
 * («площадка|имя», 30 дней в localStorage) работает и здесь: артист, уже
 * попавшийся в топе, приезжает в плеер без сети.
 *
 * Пока ищем — не показываем НИЧЕГО, и не нашли — тоже: заглушка со знаком bloom
 * читалась бы как чужая аватарка, а пустой кружок — как недогруз. Строка с
 * именем от этого разъезжается один раз, когда картинки приезжают; у трека с
 * одним артистом этого не видно вовсе — его аватарка приходит вместе с треком.
 */
import {
  artistAvatarKey,
  useArtistAvatars,
  type ArtistRef,
} from '@features/profile/lib/useArtistAvatars'
import type { Track } from '@entities/track'
import { t as i18nT } from '@shared/i18n'
// Тот же сплиттер, которым `ArtistLinks` режет строку на имена: разъедься они,
// кружков стало бы не столько же, сколько имён рядом.
import { parseArtists } from '@shared/lib/parseArtists'

/**
 * Площадка трека — дубль `trackProviderId` из `api/play`: тот файл тянет за
 * собой половину плеера, а здесь нужны три поля трека.
 */
const providerOf = (t?: Track | null): string =>
  t?._ym ? 'yandex' : t?._ytm ? 'ytmusic' : t?._sc ? 'soundcloud' : 'local'

/**
 * Кого искать и у какой площадки. Пусто — искать нечего (нет имени). Кружок
 * на КАЖДОЕ имя рядом, без потолка: стопка с наездом растёт на ~60% диаметра
 * за артиста, и обрезанная на трёх она врала, что артистов трое.
 */
export const trackArtistRefs = (t?: Track | null): ArtistRef[] => {
  const artist = t?.artist?.trim()
  // «Неизвестный исполнитель» — не имя: искать его по площадкам бессмысленно.
  if (!artist || artist === i18nT('common.unknownArtist')) return []
  const source = providerOf(t)
  return parseArtists(artist).map((name) => ({ name, source }))
}

/**
 * Аватарка трека «своими силами»: артист один — значит строка трека и есть имя
 * аккаунта, который его залил, а его картинку трек уже везёт с собой. Обычный
 * случай, и он обходится без сети и без разъезжающейся строки.
 */
const ownAvatar = (t?: Track | null): string | null => {
  if (trackArtistRefs(t).length !== 1) return null
  return t?.artistAvatar || null
}

/**
 * Найденные аватарки трека в порядке имён, с фоновой догрузкой недостающих.
 * Ненайденные пропускаются — пустых мест в стопке не остаётся.
 */
export const useTrackArtistAvatars = (t?: Track | null): string[] => {
  const own = ownAvatar(t)
  const refs = trackArtistRefs(t)
  // Аватарка уже на руках — в сеть не идём: пустой список refs хук игнорирует.
  const map = useArtistAvatars(own ? [] : refs)
  if (own) return [own]
  const out: string[] = []
  for (const r of refs) {
    const url = map[artistAvatarKey(r.source, r.name)]
    if (url) out.push(url)
  }
  return out
}
