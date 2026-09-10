import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { useT, useLocale } from '@shared/i18n'
import { getProvider } from '@features/providers'
import { playFromSource, useQueueStore } from '@features/player'
import { useDetailStore } from '@features/search'
import { extractCoverHsl } from '@features/settings'
import type { Playlist } from '@entities/playlist'
import { CardMarquee, EmptyCover } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Карточка релиза для витрины «Релизы» на главной: крупный круг с фото артиста
 * (имя — поверх низа круга) и плашка релиза внахлёст — мини-обложка, название,
 * подпись «альбом · 14 августа» и кнопка play.
 *
 * Клики разведены по смыслу: круг → страница артиста, плашка → страница
 * альбома, play → играть альбом целиком (треки догружаются по клику, витрина
 * их не тянет заранее).
 *
 * Фон плашки — доминанта обложки (`extractCoverHsl`), приглушённая до тёмного
 * коридора: цвет должен читаться как оттенок, а не как цветное пятно.
 * Геометрия — ручки `--rel-w` / `--rel-circle` / `--rel-overlap` в home.css.
 */

/** Доминанта обложки → тёмный фон плашки. Пусто — фон карточки по умолчанию. */
const tileTint = (hsl: { h: number; s: number; l: number }): string => {
  const s = Math.round(Math.min(0.55, hsl.s * 0.8) * 100)
  const l = Math.round(Math.max(0.13, Math.min(0.24, hsl.l * 0.5)) * 100)
  return `hsl(${Math.round(hsl.h)} ${s}% ${l}%)`
}

/**
 * Кеш тонов по URL обложки. Скан тейнтит canvas на удалённых картинках и тогда
 * уходит за байтами в Rust — на 24 карточках это заметная пачка запросов, а
 * витрина перемонтируется на каждый заход на главную. Живёт до перезапуска.
 */
const tintCache = new Map<string, string>()

export const ReleaseCard = ({ album, providerId }: { album: Playlist; providerId: string }) => {
  const t = useT()
  const locale = useLocale()
  const [tint, setTint] = useState<string | null>(() => (album.cover ? tintCache.get(album.cover) ?? null : null))
  // Ожидание после клика по play — две фазы: загрузка списка треков альбома
  // (busy) и резолв стрима первого трека плеером (loadingId в очереди).
  // Показываем спиннер обе, иначе кнопка «отпускается» на середине пути.
  const [busy, setBusy] = useState(false)
  const [startedId, setStartedId] = useState<string | null>(null)
  const resolving = useQueueStore((s) => !!startedId && s.loadingId === startedId)
  const loading = busy || resolving
  // Резолв закончился — забываем трек. Иначе карточка «залипла» бы на его id и
  // крутила спиннер, когда тот же трек позже запустят из библиотеки или поиска.
  const wasResolving = useRef(false)
  useEffect(() => {
    if (wasResolving.current && !resolving) setStartedId(null)
    wasResolving.current = resolving
  }, [resolving])

  useEffect(() => {
    const cover = album.cover
    if (!cover || tintCache.has(cover)) return
    let dead = false
    void extractCoverHsl(cover).then((hsl) => {
      if (!hsl) return
      const c = tileTint(hsl)
      tintCache.set(cover, c)
      if (!dead) setTint(c)
    })
    return () => {
      dead = true
    }
  }, [album.cover])

  // Фото артиста; у сборников/«various artists» его нет — тогда в круг идёт
  // обложка релиза, чтобы ряд не рассыпался на два разных вида карточек.
  const photo = album.ownerAvatar || album.cover || null

  const openArtist = (e: ReactMouseEvent): void => {
    e.stopPropagation()
    if (!album.ownerId) return
    useDetailStore.getState().open({
      kind: 'artist',
      providerId,
      id: album.ownerId,
      title: album.ownerName ?? '',
      cover: album.ownerAvatar ?? null,
      round: true,
    })
  }

  const openAlbum = (): void => {
    useDetailStore.getState().open({
      kind: 'album',
      providerId,
      id: album.id,
      title: album.title,
      cover: album.cover ?? null,
      ownerAvatar: album.ownerAvatar ?? null,
      year: album.year,
      round: false,
    })
  }

  const play = (e: ReactMouseEvent): void => {
    e.stopPropagation()
    const prov = getProvider(providerId)
    if (loading || !prov?.getAlbum) return
    setBusy(true)
    prov
      .getAlbum(album.id)
      .then(({ album: full, tracks }) => {
        if (!tracks.length) return
        playFromSource(
          tracks.map((x) => x.id),
          { kind: 'sc', label: full.title || album.title, cover: full.cover ?? album.cover ?? null },
        )
        // Альбом стартует с первого трека — за его резолвом и следим.
        setStartedId(tracks[0]!.id)
      })
      .catch(() => undefined)
      .finally(() => setBusy(false))
  }

  const typeLabel =
    album.albumType === 'single'
      ? t('home.rel.single')
      : album.albumType === 'compilation'
        ? t('home.rel.compilation')
        : album.albumType === 'podcast'
          ? t('home.rel.podcast')
          : t('home.rel.album')

  // Дата выхода: «14 августа» для релизов этого года, с годом — для прошлых.
  // Нет ISO-даты (площадка отдала только год) — показываем год.
  const d = album.releaseDate ? new Date(album.releaseDate) : null
  const dateLabel =
    d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString(
          locale === 'ru' ? 'ru' : 'en',
          d.getFullYear() === new Date().getFullYear()
            ? { day: 'numeric', month: 'long' }
            : { day: 'numeric', month: 'long', year: 'numeric' },
        )
      : (album.year ?? '')

  return (
    <div className="rel-card mqh" style={tint ? ({ '--rel-tint': tint } as CSSProperties) : undefined}>
      <div className="rel-head">
        <div className={`rel-photo${album.ownerId ? ' clickable' : ''}`} onClick={openArtist}>
          {photo ? <img src={photo} alt="" draggable={false} /> : <EmptyCover />}
          <div className="rel-shade" />
        </div>
        {/* Имя — сестра круга, а не его потомок: круг режет всё по overflow.
            Длинное имя переносится на вторую строку и растёт вверх (низ
            прибит к плашке), как в референсе, — без ужимания кегля. */}
        <div className="rel-artist">{album.ownerName}</div>
      </div>

      <div className="rel-tile" onClick={openAlbum}>
        <div className="rel-mini">{album.cover ? <img src={album.cover} alt="" draggable={false} /> : <EmptyCover />}</div>
        <div className="rel-meta">
          <CardMarquee className="rel-title">{album.title}</CardMarquee>
          <div className="rel-sub">{dateLabel ? `${typeLabel} • ${dateLabel}` : typeLabel}</div>
        </div>
        <button
          type="button"
          className={`rel-play${loading ? ' is-busy' : ''}`}
          aria-label={t('player.aria.play')}
          onClick={play}
        >
          {loading ? (
            <div className="sc-spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0 }} />
          ) : (
            <Ico name="play" variant="bold" size={14} />
          )}
        </button>
      </div>
    </div>
  )
}
