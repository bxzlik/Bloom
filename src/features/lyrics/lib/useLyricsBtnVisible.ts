import { useLyricsStore } from '../model/lyricsStore'

/**
 * Показывать ли кнопку «Текст». Текст запрашивается на каждой смене трека
 * (`loadPlay` → `requestLyrics`) независимо от панели, поэтому статус успевает
 * стать `ready` до того, как пользователь что-то нажмёт — кнопка просто не
 * появляется на треках без текста.
 *
 * @param panelOpen  панель текста сейчас открыта — тогда кнопку держим видимой
 *                   в любом случае, иначе её нечем будет закрыть.
 */
export const useLyricsBtnVisible = (panelOpen: boolean): boolean => {
  const found = useLyricsStore((s) => s.status === 'ready')
  return found || panelOpen
}
