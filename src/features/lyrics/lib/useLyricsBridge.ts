import { useEffect } from 'react'
import { useTauriEvent } from '@shared/hooks'
import { usePlayerStore, useGrpStore, useBigPicStore } from '@features/player'
import { useLyricsStore } from '../model/lyricsStore'

/**
 * Мост текста в main окне. Подключается ОДИН раз в App.tsx.
 *
 *   - принимает результат запроса из Rust (`bloom-lyrics`) → applyResult;
 *   - синхронизирует активную строку с позицией воспроизведения (setTime);
 *   - закрывает панели текста, если у нового трека текста нет.
 *
 * Сам запрос текста инициирует плеер при смене трека (`loadPlay` → requestLyrics),
 * хука `updUI`.
 */
export const useLyricsBridge = () => {
  useTauriEvent('bloom-lyrics', (r) => {
    useLyricsStore.getState().applyResult(r)
  })

  // position → активная строка. Подписка вне React-рендера: setTime сам решает,
  // менять ли curLine (стор обновится только при смене строки, не каждый тик).
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((s, prev) => {
      if (s.position === prev.position) return
      useLyricsStore.getState().setTime(s.position)
    })
    return unsub
  }, [])

  // Трек сменился на такой, где текста нет → гасим все панели текста (страница
  // плеера / глобальная правая / фуллскрин), иначе панель зависла бы с пустотой,
  // а кнопка «Текст» держалась бы видимой только ради возможности её закрыть.
  // Ловим именно ПЕРЕХОД в 'empty': на 'loading' панель не трогаем (мигало бы
  // на каждой смене трека), и панель, открытую руками на пустом треке, не рвём.
  useEffect(() => {
    const unsub = useLyricsStore.subscribe((s, prev) => {
      if (s.status !== 'empty' || prev.status === 'empty') return
      if (s.open) useLyricsStore.getState().setOpen(false)
      const grp = useGrpStore.getState()
      if (grp.open && grp.mode === 'lyrics') grp.close()
      const bp = useBigPicStore.getState()
      if (bp.panel === 'lyrics') bp.toggleLyrics()
    })
    return unsub
  }, [])
}
