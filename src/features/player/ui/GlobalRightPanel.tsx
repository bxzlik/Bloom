import { type PointerEvent as ReactPointerEvent } from 'react'
import { LyricsView } from '@features/lyrics'
import { cn } from '@shared/lib/cn'
import { useNavStore } from '@app/navigationStore'
import { useDetailOpen } from '@features/search/model/detailStore'
import { useUiPrefsStore, usePlayerViewStore, GRP_W_MIN, GRP_W_MAX, GRP_W_DEFAULT } from '@features/settings'
import { useGrpStore } from '../model/grpStore'
import { useQueueStore } from '../model/queueStore'
import { QueueBlock } from './QueueBlock'

/**
 * Глобальная выезжающая боковая панель (#globalRightPanel) — очередь ИЛИ текст
 * песни. + `openGlobalPanel`.
 *
 * Открывается кнопками очереди/текста в нижнем баре (#mpQueueBtn/#mpLyricsBtn),
 * сторона (право/лево) задаётся в настройках («Боковая панель», setSide).
 * Видимость — класс `grp-visible` (ширина 0↔320, CSS в main.css). Сдвиг
 * основного контента — `#mainContentRow.has-grp-panel`, реверс при
 * `.app.grp-side-left` (в App.tsx).
 */
export const GlobalRightPanel = () => {
  const open = useGrpStore((s) => s.open)
  const mode = useGrpStore((s) => s.mode)
  const page = useNavStore((s) => s.page)
  // Без трека мини-плеер скрыт (там кнопки панели) — панель тоже прячем, иначе
  // её нечем закрыть.
  const curId = useQueueStore((s) => s.curId)
  // На странице плеера у неё своя очередь (#playerQueueBlock) + lyrics-overlay,
  // поэтому глобальную панель там прячем — КРОМЕ случая, когда поверх плеера открыт
  // детальный оверлей (артист/альбом): инлайн-очередь перекрыта, панель нужна.
  const detailOpen = useDetailOpen()
  const visible = open && (page !== 'player' || detailOpen) && !!curId

  return (
    <div id="globalRightPanel" className={visible ? 'grp-visible' : ''}>
      <div id="grpInner">
        <GrpResizer />
        {mode === 'queue' ? <QueueBlock similarIcon /> : <GrpLyrics active={visible} />}
      </div>
    </div>
  )
}

/**
 * Ручка растягивания панели — невидимая полоса по её внутренней кромке
 * (`.grp-resizer`, base.css): слева, когда панель справа, и наоборот. Тянет
 * `--grp-w`; Shift+ЛКМ — сброс к GRP_W_DEFAULT. Отключается настройкой
 * «Заблокировать растягивание».
 *
 * Как и у сайдбара настроек: во время drag пишем переменную прямо в DOM, в стор
 * коммитим один раз на pointerup (там же persist).
 */
const GrpResizer = () => {
  const side = useGrpStore((s) => s.side)
  const locked = useUiPrefsStore((s) => s.grpResizeLock)
  const setPref = useUiPrefsStore((s) => s.set)

  if (locked) return null

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (e.shiftKey) {
      setPref('grpW', GRP_W_DEFAULT)
      return
    }
    // Панель справа — ручка на её левой кромке: движение влево расширяет.
    const dir = side === 'left' ? 1 : -1
    const startX = e.clientX
    const startW = useUiPrefsStore.getState().grpW
    const root = document.documentElement
    let commit = startW

    const onMove = (ev: PointerEvent) => {
      const raw = startW + dir * (ev.clientX - startX)
      commit = Math.min(GRP_W_MAX, Math.max(GRP_W_MIN, Math.round(raw)))
      root.style.setProperty('--grp-w', `${commit}px`)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('grp-resizing')
      setPref('grpW', commit)
    }
    document.body.classList.add('grp-resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={cn('grp-resizer', side === 'left' && 'grp-resizer-right')}
      onPointerDown={onPointerDown}
    />
  )
}

// ── Lyrics-режим (mirror #grpLyricsBlock) ──────────────────────────────────

const GrpLyrics = ({ active }: { active: boolean }) => {
  const st = usePlayerViewStore((s) => s.lyricsStyle.panel)
  return (
    <div
      id="grpLyricsBlock"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        minHeight: 0,
        overflow: 'hidden',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--ovl-line)',
        background: 'var(--block-color)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <LyricsView
        className="lq-content"
        id="grpLyricsContent"
        active={active}
        fill={st.fill}
        fx={st.fx}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px', scrollBehavior: 'smooth' }}
      />
    </div>
  )
}
