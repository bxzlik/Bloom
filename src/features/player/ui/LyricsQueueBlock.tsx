import { LyricsView, useLyricsStore } from '@features/lyrics'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { usePlayerViewStore } from '@features/settings'

/**
 * Блок «Текст вместо очереди» (#lyricsQueueBlock) — занимает место
 * очереди на странице плеера, когда включена настройка «Текст вместо очереди»
 * (`lyricsInQueue`) и панель текста открыта.: шапка-пилюля
 * «Текст песни» + источник, тело — общий `LyricsView` в контейнере `.lq-content`.
 *
 * @param active  рендерить эффекты (скролл/караоке) — панель видима.
 */
export const LyricsQueueBlock = ({ active }: { active: boolean }) => {
  const t = useT()
  const source = useLyricsStore((s) => s.source)
  const hideHeader = usePlayerViewStore((s) => s.hideLyricsHeader)
  return (
    <div
      id="lyricsQueueBlock"
      style={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        minHeight: 0,
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(255,255,255,var(--wb))',
        background: 'rgba(255,255,255,.02)',
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
            <Ico name="lyrics" width={14} height={14} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{t('player.lyrics')}</span>
            <span id="lqSourceBadge" style={{ fontSize: 10, color: 'var(--text2)' }}>
              {source}
            </span>
          </div>
        </div>
      )}
      <LyricsView
        className="lq-content"
        id="lqContent"
        active={active}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px', scrollBehavior: 'smooth' }}
      />
    </div>
  )
}
