import type { CSSProperties } from 'react'
import { Ico } from '@shared/ui/icons/solar'
import { useT } from '@shared/i18n'
import { useOfflineStore } from '@features/offline'
import { isDownloadable } from '@features/player'
import { useLibStore } from '../model'

/**
 * Офлайн-статус плейлиста по списку id его треков: сколько скачиваемых
 * (площадочных) треков лежит в офлайн-кеше. Реактивен к офлайн-стору и составу
 * библиотеки.
 */
export const usePlaylistOffline = (
  trackIds: string[],
): { any: boolean; all: boolean; cached: number; total: number } => {
  const paths = useOfflineStore((s) => s.paths)
  const tracks = useLibStore((s) => s.tracks)
  const byId = new Map(tracks.map((t) => [t.id, t]))
  const dlable = trackIds
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => !!t && isDownloadable(t))
  const cached = dlable.filter((t) => paths.has(t.id)).length
  return { any: cached > 0, all: dlable.length > 0 && cached === dlable.length, cached, total: dlable.length }
}

/**
 * Индикатор «доступно офлайн» для подписи плейлиста (шапка, сайдбар, меню).
 * Ничего не рендерит, если в кеше нет ни одного трека плейлиста. Полностью
 * скачан → «офлайн»; частично → «N/M». Цвет наследует от подписи (как «5 треков
 * · 13 мин»), поэтому не выделяется акцентом.
 */
export const PlaylistOfflineTag = ({
  trackIds,
  dot = true,
  style,
}: {
  trackIds: string[]
  /** Ставить ли разделитель-точку перед индикатором (для inline-подписи). */
  dot?: boolean
  style?: CSSProperties
}) => {
  const t = useT()
  const st = usePlaylistOffline(trackIds)
  if (!st.any) return null
  return (
    <span
      className="pl-offline-tag"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle', ...style }}
    >
      {dot && <span style={{ margin: '0 3px' }}>·</span>}
      <Ico name="save" width={11} height={11} />
      {st.all ? t('lib.plmenu.offlineBadge') : `${st.cached}/${st.total}`}
    </span>
  )
}
