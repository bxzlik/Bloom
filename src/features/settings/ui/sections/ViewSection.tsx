import { usePlayerViewStore, matchMpPreset } from '../../model/playerViewStore'
import { useLyricsStore } from '@features/lyrics'

/**
 * Раздел «Плеер» (`#ssec-view`). Перенесена РАБОЧАЯ часть:
 * выравнивание заголовка, кнопки на обложке в баре, ambient glow, parallax.
 *
 * Отложено (тяжёлая инфра, отдельными заходами): стиль плеера (vinyl/large),
 * тип слайдера (default/thin/ios/wave), положение очереди, текст/караоке/
 * скрыть-очередь/след.трек, мини-плеер (пресеты/фон/прогресс/форма/позиция),
 * визуализатор.
 */
export const ViewSection = () => {
  const p = usePlayerViewStore()
  const karaoke = useLyricsStore((s) => s.karaoke)
  const toggleKaraoke = useLyricsStore((s) => s.toggleKaraoke)
  const activePreset = matchMpPreset(p)
  const setProgress = (key: 'line' | 'bg' | 'circle') =>
    p.set('mpProgress', { ...p.mpProgress, [key]: !p.mpProgress[key] })
  return (
    <div className="s-section active" id="ssec-view">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><path d="M11 9.5C11 8.9 11.6 8.6 12.1 8.9l4 2.5c.5.3.5 1 0 1.3l-4 2.5C11.6 15.5 11 15.1 11 14.6V9.5z" />
          </svg>{' '}
          Плеер
        </div>
        <button className="s-section-reset" onClick={() => p.reset()}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>{' '}
          Сбросить
        </button>
      </div>

      <div className="s-cat-label">НАСТРОЙКИ ПЛЕЕРА</div>
      <div className="sc">
        <div className="sc-title">Выравнивание заголовка</div>
        <div className="sc-desc">Позиция названия трека и исполнителя в плеере</div>
        <div className="s-opt-row">
          <OptBtn active={p.titleAlign === 'left'} onClick={() => p.set('titleAlign', 'left')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>
            По левому
          </OptBtn>
          <OptBtn active={p.titleAlign === 'center'} onClick={() => p.set('titleAlign', 'center')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
            По центру
          </OptBtn>
          <OptBtn active={p.titleAlign === 'right'} onClick={() => p.set('titleAlign', 'right')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>
            По правому
          </OptBtn>
        </div>
      </div>

      <div className="sc">
        <div className="sc-title">Стиль плеера</div>
        <div className="sc-desc">Внешний вид обложки и элементов плеера</div>
        <div className="s-opt-row">
          <OptBtn active={p.playerStyle === 'standard'} onClick={() => p.set('playerStyle', 'standard')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="8" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /></svg>
            Обычный
          </OptBtn>
          <OptBtn active={p.playerStyle === 'vinyl'} onClick={() => p.set('playerStyle', 'vinyl')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>
            Пластинка
          </OptBtn>
          {/* «Большой» (style-large): grid-раскладка. При входе из режима с
              очередью снизу — переводим очередь вправо. */}
          <OptBtn
            active={p.playerStyle === 'large'}
            onClick={() => {
              p.set('playerStyle', 'large')
              if (p.queuePos === 'bottom') p.set('queuePos', 'right')
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
            Большой
          </OptBtn>
        </div>
      </div>

      <div className="sc">
        <div className="sc-title">Тип слайдера</div>
        <div className="sc-desc">Стиль полосы прогресса и громкости</div>
        <div className="s-opt-row">
          <OptBtn active={p.sliderType === 'default'} onClick={() => p.set('sliderType', 'default')}>
            <svg width="44" height="10" viewBox="0 0 44 10"><rect x="0" y="4" width="44" height="2" rx="1" fill="currentColor" opacity={0.3} /><rect x="0" y="4" width="22" height="2" rx="1" fill="currentColor" /></svg>
            Обычный
          </OptBtn>
          <OptBtn active={p.sliderType === 'thin'} onClick={() => p.set('sliderType', 'thin')}>
            <svg width="44" height="10" viewBox="0 0 44 10"><rect x="0" y="4.5" width="44" height="1" rx="0.5" fill="currentColor" opacity={0.3} /><rect x="0" y="4.5" width="22" height="1" rx="0.5" fill="currentColor" /><circle cx="22" cy="5" r="2.5" fill="currentColor" /></svg>
            Тонкий
          </OptBtn>
          <OptBtn active={p.sliderType === 'ios'} onClick={() => p.set('sliderType', 'ios')}>
            <svg width="44" height="10" viewBox="0 0 44 10"><rect x="0" y="4" width="20" height="2" rx="1" fill="currentColor" /><rect x="24" y="4" width="20" height="2" rx="1" fill="currentColor" opacity={0.3} /><rect x="21" y="1" width="2" height="8" rx="1" fill="currentColor" /></svg>
            iOS
          </OptBtn>
          <OptBtn active={p.sliderType === 'wave'} onClick={() => p.set('sliderType', 'wave')}>
            <svg width="44" height="10" viewBox="0 0 44 10"><rect x="0" y="3" width="2" height="4" rx="1" fill="currentColor" /><rect x="3" y="2" width="2" height="6" rx="1" fill="currentColor" /><rect x="6" y="3.5" width="2" height="3" rx="1" fill="currentColor" /><rect x="9" y="1" width="2" height="8" rx="1" fill="currentColor" /><rect x="12" y="2.5" width="2" height="5" rx="1" fill="currentColor" /><rect x="15" y="1.5" width="2" height="7" rx="1" fill="currentColor" /><rect x="18" y="3" width="2" height="4" rx="1" fill="currentColor" /><rect x="21" y="2" width="2" height="6" rx="1" fill="currentColor" opacity={0.3} /><rect x="24" y="3.5" width="2" height="3" rx="1" fill="currentColor" opacity={0.3} /><rect x="27" y="1.5" width="2" height="7" rx="1" fill="currentColor" opacity={0.3} /><rect x="30" y="2.5" width="2" height="5" rx="1" fill="currentColor" opacity={0.3} /><rect x="33" y="3" width="2" height="4" rx="1" fill="currentColor" opacity={0.3} /><rect x="36" y="1" width="2" height="8" rx="1" fill="currentColor" opacity={0.3} /><rect x="39" y="3.5" width="2" height="3" rx="1" fill="currentColor" opacity={0.3} /><rect x="42" y="2.5" width="2" height="5" rx="1" fill="currentColor" opacity={0.3} /></svg>
            Волновой
          </OptBtn>
        </div>
      </div>

      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">Кнопки на обложке в плеер</div>
            <div className="ssub">Перенести ♥ и + из обложки в панель управления</div>
          </div>
          <Toggle checked={p.covBtnsInBar} onChange={(v) => p.set('covBtnsInBar', v)} />
        </div>
      </div>

      <div className="s-cat-label">ОЧЕРЕДЬ И ТЕКСТ</div>
      <div className="sc">
        <div className="sc-title">Положение очереди</div>
        <div className="sc-desc">Где отображается список треков в плеере</div>
        <div className="s-opt-row">
          {/* При скрытой очереди выбор позиции недоступен. */}
          <OptBtn active={p.queuePos === 'left'} disabled={p.hideQueue} onClick={() => p.set('queuePos', 'left')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="13" y="3" width="8" height="18" rx="1" /></svg>
            Слева
          </OptBtn>
          <OptBtn
            active={p.queuePos === 'bottom'}
            disabled={p.hideQueue || p.playerStyle === 'large'}
            onClick={() => p.set('queuePos', 'bottom')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="9" rx="1" /><rect x="3" y="15" width="18" height="6" rx="1" /></svg>
            Снизу
          </OptBtn>
          <OptBtn active={p.queuePos === 'right'} disabled={p.hideQueue} onClick={() => p.set('queuePos', 'right')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="14" y="3" width="7" height="18" rx="1" /><rect x="3" y="3" width="8" height="18" rx="1" /></svg>
            Справа
          </OptBtn>
        </div>
      </div>

      <div className="sc">
        <div className="sc-title">Текст песни</div>
        <div className="sc-desc">Настройки отображения текста и очереди</div>
        <div className="sr">
          <div>
            <div className="sl2">Текст вместо очереди</div>
            <div className="ssub">Показывать текст песни вместо списка треков</div>
          </div>
          <Toggle checked={p.lyricsInQueue} onChange={(v) => p.set('lyricsInQueue', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">Караоке-режим</div>
            <div className="ssub">Подсвечивать текст по словам, а не строкам (требует синхронизированный текст)</div>
          </div>
          <Toggle checked={karaoke} onChange={() => toggleKaraoke()} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">Скрыть очередь</div>
            <div className="ssub">Убрать блок очереди из плеера</div>
          </div>
          {/* Выключение скрытия очереди сбрасывает «след. трек». */}
          <Toggle
            checked={p.hideQueue}
            onChange={(v) => {
              p.set('hideQueue', v)
              if (!v) p.set('showNextTrack', false)
            }}
          />
        </div>
        {/* «Показать следующий трек» — только при скрытой очереди и НЕ в large
. */}
        {p.hideQueue && p.playerStyle !== 'large' && (
          <div className="sr">
            <div>
              <div className="sl2">Показать следующий трек</div>
              <div className="ssub">Отображать следующий трек под элементами управления</div>
            </div>
            <Toggle checked={p.showNextTrack} onChange={(v) => p.set('showNextTrack', v)} />
          </div>
        )}
      </div>

      <div className="s-cat-label">МИНИ-ПЛЕЕР</div>
      <div className="sc">
        <div className="sc-title">Пресеты</div>
        <div className="sc-desc">Быстро применить готовые настройки мини-плеера</div>
        <div className="s-opt-row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          <OptBtn active={activePreset === 'off'} onClick={() => p.applyMpPreset('off')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            Выключено
          </OptBtn>
          <OptBtn active={activePreset === 'full'} onClick={() => p.applyMpPreset('full')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            Полный
          </OptBtn>
          <OptBtn active={activePreset === 'rounded'} onClick={() => p.applyMpPreset('rounded')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /></svg>
            Закруглённый
          </OptBtn>
          <OptBtn active={activePreset === 'hybrid'} onClick={() => p.applyMpPreset('hybrid')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>
            Гибрид
          </OptBtn>
          <OptBtn active={activePreset === 'deck'} onClick={() => p.applyMpPreset('deck')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            Дек
          </OptBtn>
        </div>
      </div>

      {p.mpEnabled && (
        <>
          <div className="sc">
            <div className="sc-title">Фон мини-плеера</div>
            <div className="sc-desc">Выберите источник фона мини-плеера</div>
            <div className="s-opt-row" style={{ marginTop: 12 }}>
              <OptBtn active={p.mpBgMode === 'theme'} onClick={() => p.set('mpBgMode', 'theme')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                Тема
              </OptBtn>
              <OptBtn active={p.mpBgMode === 'cover'} onClick={() => p.set('mpBgMode', 'cover')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                Обложка
              </OptBtn>
              <OptBtn active={p.mpBgMode === 'coverColor'} onClick={() => p.set('mpBgMode', 'coverColor')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></svg>
                Цвет обложки
              </OptBtn>
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">Прогресс мини-плеера</div>
            <div className="sc-desc">Как отображать прогресс трека (можно совмещать)</div>
            <div className="s-opt-row" style={{ marginTop: 12 }}>
              <OptBtn active={p.mpProgress.line} onClick={() => setProgress('line')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="2" y1="12" x2="22" y2="12" /></svg>
                Линия
              </OptBtn>
              <OptBtn active={p.mpProgress.bg} onClick={() => setProgress('bg')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="2" y="4" width="10" height="16" rx="2" fill="currentColor" stroke="none" opacity={0.4} /></svg>
                Фоном
              </OptBtn>
              <OptBtn active={p.mpProgress.circle} onClick={() => setProgress('circle')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 3 A9 9 0 0 1 21 12" strokeWidth={2.5} strokeLinecap="round" /></svg>
                Вокруг обложки
              </OptBtn>
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">Обложка мини-плеера</div>
            <div className="sc-desc">Выберите форму обложки в мини-плеере</div>
            <div className="s-opt-row" style={{ marginTop: 12 }}>
              <OptBtn active={p.mpCoverShape === 'default'} onClick={() => p.set('mpCoverShape', 'default')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                По умолчанию
              </OptBtn>
              <OptBtn active={p.mpCoverShape === 'round'} onClick={() => p.set('mpCoverShape', 'round')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /></svg>
                Круглая
              </OptBtn>
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">Позиция мини-плеера</div>
            <div className="sc-desc">Где отображается панель управления воспроизведением</div>
            <div className="s-opt-row" id="miniPlayerPosRow" style={{ marginTop: 12 }}>
              <OptBtn active={p.playerBarPos === 'bottom'} onClick={() => p.set('playerBarPos', 'bottom')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="12" rx="1" /><rect x="3" y="18" width="18" height="3" rx="1" /></svg>
                Снизу
              </OptBtn>
              <OptBtn active={p.playerBarPos === 'top'} onClick={() => p.set('playerBarPos', 'top')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="3" rx="1" /><rect x="3" y="9" width="18" height="12" rx="1" /></svg>
                Сверху
              </OptBtn>
              <OptBtn active={p.playerBarPos === 'left'} onClick={() => p.set('playerBarPos', 'left')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="3" height="18" rx="1" /><rect x="9" y="3" width="12" height="18" rx="1" /></svg>
                Слева
              </OptBtn>
              <OptBtn active={p.playerBarPos === 'right'} onClick={() => p.set('playerBarPos', 'right')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="18" y="3" width="3" height="18" rx="1" /><rect x="3" y="3" width="12" height="18" rx="1" /></svg>
                Справа
              </OptBtn>
            </div>
          </div>
        </>
      )}

      <div className="s-cat-label">ЭФФЕКТЫ</div>
      {/* Визуализатор. Загрузка фото-фона (vizPhoto) отложена. */}
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">Визуализатор</div>
            <div className="ssub">показывать эффекты визуализации аудио</div>
          </div>
          <Toggle checked={p.vizEnabled} onChange={(v) => p.set('vizEnabled', v)} />
        </div>
      </div>
      {p.vizEnabled && (
        <div className="sc">
          <div className="viz-type-row">
            <OptBtn active={p.vizType === 'wave'} onClick={() => p.set('vizType', 'wave')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12c2 0 2-6 4-6s2 12 4 12 2-12 4-12 2 12 4 12 2-6 4-6" /></svg>
              Волна
            </OptBtn>
            <OptBtn active={p.vizType === 'bars'} onClick={() => p.set('vizType', 'bars')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><polyline points="4 14 4 18" /><polyline points="9 6 9 18" /><polyline points="14 10 14 18" /><polyline points="20 4 20 18" /></svg>
              Столбцы
            </OptBtn>
          </div>
        </div>
      )}

      <div className="sc">
        <h3>Дополнительные эффекты</h3>
        <div className="sr">
          <div>
            <div className="sl2">Ambient Glow</div>
            <div className="ssub">свечение обложки в цвет акцента</div>
          </div>
          <Toggle checked={p.ambientGlow} onChange={(v) => p.set('ambientGlow', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">Parallax обложки</div>
            <div className="ssub">3D наклон при движении мыши</div>
          </div>
          <Toggle checked={p.parallax} onChange={(v) => p.set('parallax', v)} />
        </div>
      </div>
    </div>
  )
}

const OptBtn = ({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) => (
  <button
    className={`s-opt-btn ${active ? 'bta' : 'btg'}`}
    onClick={onClick}
    disabled={disabled}
    style={disabled ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
  >
    {children}
  </button>
)

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="tele-sw">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="tele-sw-track" />
  </label>
)
