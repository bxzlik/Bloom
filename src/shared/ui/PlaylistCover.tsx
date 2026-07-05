import type { CSSProperties } from 'react'
import { VinylCover } from './VinylCover'

/**
 * Обложка плейлиста без своей картинки: коллаж из обложек первых треков
 * (как в Spotify). Сколько разных обложек набралось из начала плейлиста —
 * такой и коллаж: 1 → одна на всю площадь, 2 → две половины, 3 → большая слева
 * + две справа, 4 → сетка 2×2. Нет ни одной обложки → нарисованный винил
 * (`VinylCover` по seed).
 *
 * Компонент чистый: `covers` — уже разрешённые URL обложек треков в порядке
 * плейлиста; дубли/пустые отсеиваются здесь. Каждое место вызова само достаёт
 * список обложек из своих треков — shared/ui не тянет library-модели.
 */
export const PlaylistCover = ({
  covers,
  seed,
}: {
  covers: (string | null | undefined)[]
  seed: string
}) => {
  // Первые до 4 РАЗНЫХ непустых обложек (в порядке плейлиста).
  const uniq: string[] = []
  for (const c of covers) {
    if (!c || uniq.includes(c)) continue
    uniq.push(c)
    if (uniq.length === 4) break
  }

  if (uniq.length === 0) return <VinylCover seed={seed} />

  // Одна обложка — просто картинка на всю площадь.
  if (uniq.length === 1) {
    return (
      <img
        src={uniq[0]}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ ...IMG, borderRadius: 'inherit' }}
      />
    )
  }

  // 2 → 2 колонки в ряд; 3 → большая слева (2 ряда) + 2 справа; 4 → сетка 2×2.
  const grid: CSSProperties =
    uniq.length === 2
      ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' }
      : { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }

  return (
    <div
      style={{
        display: 'grid',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        // Обрезаем квадратный коллаж под скругление родителя (hero/иконка/карточка
        // задают border-radius, но не всегда overflow:hidden).
        borderRadius: 'inherit',
        ...grid,
      }}
      aria-hidden="true"
    >
      {uniq.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          // При 3 обложках первая занимает оба ряда левой колонки.
          style={uniq.length === 3 && i === 0 ? { ...IMG, gridRow: 'span 2' } : IMG}
        />
      ))}
    </div>
  )
}

const IMG: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
}
