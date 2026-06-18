import { LyricsView, useLyricsStore } from '@features/lyrics'
import { useT } from '@shared/i18n'
import { useNavStore } from '@app/navigationStore'
import { useGrpStore } from '../model/grpStore'
import { QueueBlock } from './QueueBlock'

/**
 * Глобальная выезжающая боковая панель (#globalRightPanel) — очередь ИЛИ текст
 * песни. + `openGlobalPanel`.
 *
 * Открывается кнопками очереди/текста в нижнем баре (#mpQueueBtn/#mpLyricsBtn),
 * сторона (право/лево) переключается флип-кнопкой в шапке. Видимость — класс
 * `grp-visible` (ширина 0↔320, CSS в main.css). Сдвиг основного контента
 * — `#mainContentRow.has-grp-panel`, реверс при `.app.grp-side-left` (в App.tsx).
 */
export const GlobalRightPanel = () => {
  const open = useGrpStore((s) => s.open)
  const mode = useGrpStore((s) => s.mode)
  const toggleSide = useGrpStore((s) => s.toggleSide)
  const page = useNavStore((s) => s.page)
  // На странице плеера у неё своя очередь (#playerQueueBlock) + lyrics-overlay,
  // поэтому глобальную панель там прячем.
  const visible = open && page !== 'player'

  return (
    <div id="globalRightPanel" className={visible ? 'grp-visible' : ''}>
      <div id="grpInner">
        {mode === 'queue' ? (
          <QueueBlock similarIcon headerExtra={<FlipSideBtn onClick={toggleSide} />} />
        ) : (
          <GrpLyrics onFlip={toggleSide} active={visible} />
        )}
      </div>
    </div>
  )
}

// ── Lyrics-режим (mirror #grpLyricsBlock) ──────────────────────────────────

const GrpLyrics = ({ onFlip, active }: { onFlip: () => void; active: boolean }) => {
  const t = useT()
  const source = useLyricsStore((s) => s.source)
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
      <div
        style={{
          padding: '10px 16px 6px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="11" y2="18" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{t('player.lyrics')}</span>
          <span id="grpLyricsSourceBadge" style={{ fontSize: 10, color: 'var(--text2)' }}>
            {source}
          </span>
        </div>
        <FlipSideBtn onClick={onFlip} />
      </div>
      <LyricsView
        className="lq-content"
        id="grpLyricsContent"
        active={active}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px', scrollBehavior: 'smooth' }}
      />
    </div>
  )
}

// ── Кнопка смены стороны (flip left/right) ─────────────────────────────────

const FlipSideBtn = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      borderRadius: 'calc(var(--radius) * 0.6)',
      background: 'transparent',
      border: '1px solid rgba(255,255,255,var(--wb))',
      color: 'var(--text2)',
      cursor: 'pointer',
      transition: '.15s',
      flexShrink: 0,
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.color = '#fff'
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.color = 'var(--text2)'
    }}
  >
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16L3 12l4-4" /><line x1="3" y1="12" x2="21" y2="12" /><path d="M17 8l4 4-4 4" />
    </svg>
  </button>
)
