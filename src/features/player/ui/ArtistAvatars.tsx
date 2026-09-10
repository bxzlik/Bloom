import { useState } from 'react'
import type { Track } from '@entities/track'
import { useTrackArtistAvatars } from '../lib/trackArtistAvatars'

export interface ArtistAvatarsProps {
  /** Трек, чьих артистов показываем. Нет трека — нет и стопки. */
  track?: Track | null
}

/**
 * Стопка круглых аватарок артистов перед их именем (порт мобильного
 * `TrackArtistAvatars`). Кто откуда берётся и почему ничего не показываем, пока
 * ищем, — см. `lib/trackArtistAvatars`.
 *
 * Раскладку (размер, наезд, вырез) держит CSS `.tra-avas` в `player.css`: она
 * общая для всех трёх поверхностей и считается в `em` от строки артиста.
 *
 * Кружки декоративные: имена рядом и так кликабельны (`ArtistLinks`), поэтому
 * стопка скрыта от скринридера.
 */
export const ArtistAvatars = ({ track }: ArtistAvatarsProps) => {
  const urls = useTrackArtistAvatars(track)
  // Битую ссылку выкидываем целиком, а не оставляем пустой кружок: пустой
  // читался бы как недогруз (то же правило, что и у ненайденных).
  const [broken, setBroken] = useState<string[]>([])
  const shown = urls.filter((u) => !broken.includes(u))
  if (!shown.length) return null
  return (
    <span className="tra-avas" aria-hidden="true">
      {shown.map((url, i) => (
        <img
          key={`${url}#${i}`}
          className="tra-ava"
          src={url}
          alt=""
          draggable={false}
          onError={() => setBroken((b) => (b.includes(url) ? b : [...b, url]))}
        />
      ))}
    </span>
  )
}
