import { useQueueStore, sourceKey } from '../model/queueStore'
import { usePlayerStore } from '../model/store'

/**
 * «Играет ли сейчас ЭТОТ список» для широкой кнопки шапки.
 *
 * Страница списка — то же место, откуда его и поставили, поэтому второй клик по
 * кнопке обязан снимать/ставить паузу, а не перезапускать список с первого
 * трека: иначе кнопка теряла бы то, что слушают прямо сейчас. Так же ведёт себя
 * мобильная версия (`HeroPlayButton`), и разъехаться им нельзя.
 *
 * `key` — `sourceKey()` источника страницы; `null` (страница без источника,
 * ещё не загрузилась, треков нет) значит «кнопка всегда воспроизводит».
 */
export const useSourcePlayback = (
  key: string | null,
): { mine: boolean; playing: boolean } => {
  const curKey = useQueueStore((s) => sourceKey(s.source))
  const playing = usePlayerStore((s) => s.playing)
  const mine = !!key && curKey === key
  return { mine, playing: mine && playing }
}
