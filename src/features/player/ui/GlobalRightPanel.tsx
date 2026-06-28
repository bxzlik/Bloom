import { LyricsView, useLyricsStore } from '@features/lyrics'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { usePlayerViewStore } from '@features/settings'
import { useNavStore } from '@app/navigationStore'
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
  // поэтому глобальную панель там прячем.
  const visible = open && page !== 'player' && !!curId

  return (
    <div id="globalRightPanel" className={visible ? 'grp-visible' : ''}>
      <div id="grpInner">
        {mode === 'queue' ? <QueueBlock similarIcon /> : <GrpLyrics active={visible} />}
      </div>
    </div>
  )
}

// ── Lyrics-режим (mirror #grpLyricsBlock) ──────────────────────────────────

const GrpLyrics = ({ active }: { active: boolean }) => {
  const t = useT()
  const source = useLyricsStore((s) => s.source)
  const hideHeader = usePlayerViewStore((s) => s.hideLyricsHeader)
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
        border: '1px solid rgba(255,255,255,var(--wb))',
        background: 'var(--block-color)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {!hideHeader && (
        <div
          style={{
            padding: '10px 16px 6px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 12px',
              borderRadius: 'calc(var(--radius) * 0.8)',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,var(--wb2))',
            }}
          >
            <Ico name="lyrics" width={14} height={14} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{t('player.lyrics')}</span>
            <span id="grpLyricsSourceBadge" style={{ fontSize: 10, color: 'var(--text2)' }}>
              {source}
            </span>
          </div>
        </div>
      )}
      <LyricsView
        className="lq-content"
        id="grpLyricsContent"
        active={active}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px', scrollBehavior: 'smooth' }}
      />
    </div>
  )
}
