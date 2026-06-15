import { useState } from 'react'
import waveApi, { getWaveSource, setWaveSource } from '@/wave'
import { useYmAuthStore } from '@features/yandex'
import { ScLogo, YmLogo } from '@entities/track'
import { DislikesModal } from './DislikesModal'

/**
 * Карточка «Моя волна» на главной (#homeWaveCard / .home-wave-bar).
 *: прозрачный бар с двумя анимированными волнами-линиями,
 * большая кнопка play (запуск персональной волны) и заголовок.
 *
 * Переключатель источника SC/Яндекс показывается только при
 * логине в Яндекс: SC → движок Bloom (stations/related), Яндекс → нативный rotor.
 *
 * Отложено (зависит от немигрированных фич): аватары сидов.
 */
export const WaveCard = () => {
  const [loading, setLoading] = useState(false)
  const [dislikesOpen, setDislikesOpen] = useState(false)
  const [srcOpen, setSrcOpen] = useState(false)
  const ymAuthed = useYmAuthStore((s) => s.authed)
  const [source, setSource] = useState<'sc' | 'ym'>(getWaveSource())
  // Разлогинились → источник 'ym' уже не валиден, показываем как 'sc'.
  const effSource = ymAuthed ? source : 'sc'

  const pickSource = (s: 'sc' | 'ym') => {
    setWaveSource(s)
    setSource(s)
    setSrcOpen(false)
  }

  const start = async () => {
    if (loading) return
    setLoading(true)
    try {
      await waveApi.startPersonal()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home-wave-bar" id="homeWaveCard">
      <div className="hwb-wave-wrap">
        <svg className="hwb-wave hwb-wave-1" viewBox="0 0 3200 100" preserveAspectRatio="none">
          <path
            d="M0 50 C80 42,120 42,200 50 S320 58,400 50 S520 42,600 50 S720 58,800 50 S920 42,1000 50 S1120 58,1200 50 S1320 42,1400 50 S1520 58,1600 50 S1720 42,1800 50 S1920 58,2000 50 S2120 42,2200 50 S2320 58,2400 50 S2520 42,2600 50 S2720 58,2800 50 S2920 42,3000 50 S3120 58,3200 50"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
        <svg className="hwb-wave hwb-wave-2" viewBox="0 0 3200 100" preserveAspectRatio="none">
          <path
            d="M0 50 C80 57,120 57,200 50 S320 43,400 50 S520 57,600 50 S720 43,800 50 S920 57,1000 50 S1120 43,1200 50 S1320 57,1400 50 S1520 43,1600 50 S1720 57,1800 50 S1920 43,2000 50 S2120 57,2200 50 S2320 43,2400 50 S2520 57,2600 50 S2720 43,2800 50 S2920 57,3000 50 S3120 43,3200 50"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="hwb-top">
        <button
          className={`hwb-play${loading ? ' is-loading' : ''}`}
          id="homeWavePlayBtn"
          onClick={start}
          aria-label="Запустить «Мою волну»"
        >
          <svg width={56} height={56} viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
          </svg>
          <div className="hwb-spinner" aria-hidden="true" />
        </button>
        <div className="hwb-title">Моя волна</div>
        {ymAuthed && (
          <div
            className="hwb-wsrc"
            style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSrcOpen((o) => !o)
              }}
              aria-label="Выбор площадки"
              aria-haspopup="listbox"
              aria-expanded={srcOpen}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(255,255,255,.07)',
                border: '1px solid var(--border)',
                borderRadius: 'calc(var(--radius)*.6)',
                padding: '7px 10px',
                color: 'var(--text)',
                cursor: 'pointer',
                transition: '.15s',
              }}
            >
              {effSource === 'sc' ? <ScLogo size={15} /> : <YmLogo size={14} />}
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: srcOpen ? 'rotate(180deg)' : 'none', transition: '.15s' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {srcOpen && (
              <>
                {/* клик мимо — закрыть */}
                <div
                  onClick={() => setSrcOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                />
                <div
                  role="listbox"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    zIndex: 11,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    minWidth: 168,
                    padding: 5,
                    background: 'color-mix(in srgb,var(--card-solid,var(--card)) 50%,#000 50%)',
                    border: '1px solid rgba(255,255,255,.07)',
                    borderRadius: 'calc(var(--radius)*.7)',
                    boxShadow: '0 20px 60px rgba(0,0,0,.85),0 6px 20px rgba(0,0,0,.5)',
                    backdropFilter: 'blur(32px)',
                    WebkitBackdropFilter: 'blur(32px)',
                  }}
                >
                  {(['sc', 'ym'] as const).map((s) => (
                    <button
                      key={s}
                      role="option"
                      aria-selected={effSource === s}
                      onClick={(e) => {
                        e.stopPropagation()
                        pickSource(s)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        border: 'none',
                        background: effSource === s ? 'var(--accent)' : 'none',
                        // На акцентном фоне — контрастный токен (--accent-text тёмный,
                        // когда акцент светлый), иначе текст сливается с фоном.
                        color: effSource === s ? 'var(--accent-text, #fff)' : 'var(--text)',
                        padding: '8px 10px',
                        borderRadius: 'calc(var(--radius)*.5)',
                        cursor: 'pointer',
                        transition: '.15s',
                        fontFamily: 'var(--font)',
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: 'left',
                      }}
                    >
                      {s === 'sc' ? <ScLogo size={15} /> : <YmLogo size={14} />}
                      <span>{s === 'sc' ? 'SoundCloud' : 'Яндекс.Музыка'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <button
          className="hwb-tune"
          onClick={() => setDislikesOpen(true)}
          aria-label="Настроить волну (дизлайки)"
          // дропдаун уже прижат вправо через marginLeft:auto — кнопка дизлайков
          // встаёт вплотную к нему (gap бара), иначе сама прижимается вправо.
          style={ymAuthed ? { marginLeft: 0 } : undefined}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <line x1="4" y1="6" x2="14" y2="6" /><line x1="4" y1="12" x2="10" y2="12" /><line x1="4" y1="18" x2="18" y2="18" />
            <circle cx="17" cy="6" r="2" /><circle cx="13" cy="12" r="2" />
          </svg>
        </button>
      </div>
      <DislikesModal open={dislikesOpen} onClose={() => setDislikesOpen(false)} />
    </div>
  )
}
