import { usePlayerViewStore, matchMpPreset } from '../../model/playerViewStore'
import { useLyricsStore } from '@features/lyrics'
import { useT } from '@shared/i18n'

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
  const t = useT()
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
          {t('settings.nav.player')}
        </div>
        <button className="s-section-reset" onClick={() => p.reset()}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>{' '}
          {t('common.reset')}
        </button>
      </div>

      <div className="s-cat-label">{t('settings.view.cat.player')}</div>
      <div className="sc">
        <div className="sc-title">{t('settings.view.titleAlign')}</div>
        <div className="sc-desc">{t('settings.view.titleAlign.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.titleAlign === 'left'} onClick={() => p.set('titleAlign', 'left')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>
            {t('settings.view.titleAlign.left')}
          </OptBtn>
          <OptBtn active={p.titleAlign === 'center'} onClick={() => p.set('titleAlign', 'center')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
            {t('settings.view.titleAlign.center')}
          </OptBtn>
          <OptBtn active={p.titleAlign === 'right'} onClick={() => p.set('titleAlign', 'right')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>
            {t('settings.view.titleAlign.right')}
          </OptBtn>
        </div>
      </div>

      <div className="sc">
        <div className="sc-title">{t('settings.view.style')}</div>
        <div className="sc-desc">{t('settings.view.style.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.playerStyle === 'standard'} onClick={() => p.set('playerStyle', 'standard')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="8" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /></svg>
            {t('settings.view.style.standard')}
          </OptBtn>
          <OptBtn active={p.playerStyle === 'vinyl'} onClick={() => p.set('playerStyle', 'vinyl')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>
            {t('settings.view.style.vinyl')}
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
            {t('settings.view.style.large')}
          </OptBtn>
        </div>
      </div>

      <div className="sc">
        <div className="sc-title">{t('settings.view.slider')}</div>
        <div className="sc-desc">{t('settings.view.slider.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.sliderType === 'default'} onClick={() => p.set('sliderType', 'default')}>
            <svg width="44" height="10" viewBox="0 0 44 10"><rect x="0" y="4" width="44" height="2" rx="1" fill="currentColor" opacity={0.3} /><rect x="0" y="4" width="22" height="2" rx="1" fill="currentColor" /></svg>
            {t('settings.view.slider.default')}
          </OptBtn>
          <OptBtn active={p.sliderType === 'thin'} onClick={() => p.set('sliderType', 'thin')}>
            <svg width="44" height="10" viewBox="0 0 44 10"><rect x="0" y="4.5" width="44" height="1" rx="0.5" fill="currentColor" opacity={0.3} /><rect x="0" y="4.5" width="22" height="1" rx="0.5" fill="currentColor" /><circle cx="22" cy="5" r="2.5" fill="currentColor" /></svg>
            {t('settings.view.slider.thin')}
          </OptBtn>
          <OptBtn active={p.sliderType === 'ios'} onClick={() => p.set('sliderType', 'ios')}>
            <svg width="44" height="10" viewBox="0 0 44 10"><rect x="0" y="4" width="20" height="2" rx="1" fill="currentColor" /><rect x="24" y="4" width="20" height="2" rx="1" fill="currentColor" opacity={0.3} /><rect x="21" y="1" width="2" height="8" rx="1" fill="currentColor" /></svg>
            iOS
          </OptBtn>
          <OptBtn active={p.sliderType === 'wave'} onClick={() => p.set('sliderType', 'wave')}>
            <svg width="44" height="10" viewBox="0 0 44 10"><rect x="0" y="3" width="2" height="4" rx="1" fill="currentColor" /><rect x="3" y="2" width="2" height="6" rx="1" fill="currentColor" /><rect x="6" y="3.5" width="2" height="3" rx="1" fill="currentColor" /><rect x="9" y="1" width="2" height="8" rx="1" fill="currentColor" /><rect x="12" y="2.5" width="2" height="5" rx="1" fill="currentColor" /><rect x="15" y="1.5" width="2" height="7" rx="1" fill="currentColor" /><rect x="18" y="3" width="2" height="4" rx="1" fill="currentColor" /><rect x="21" y="2" width="2" height="6" rx="1" fill="currentColor" opacity={0.3} /><rect x="24" y="3.5" width="2" height="3" rx="1" fill="currentColor" opacity={0.3} /><rect x="27" y="1.5" width="2" height="7" rx="1" fill="currentColor" opacity={0.3} /><rect x="30" y="2.5" width="2" height="5" rx="1" fill="currentColor" opacity={0.3} /><rect x="33" y="3" width="2" height="4" rx="1" fill="currentColor" opacity={0.3} /><rect x="36" y="1" width="2" height="8" rx="1" fill="currentColor" opacity={0.3} /><rect x="39" y="3.5" width="2" height="3" rx="1" fill="currentColor" opacity={0.3} /><rect x="42" y="2.5" width="2" height="5" rx="1" fill="currentColor" opacity={0.3} /></svg>
            {t('settings.view.slider.wave')}
          </OptBtn>
        </div>
      </div>

      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.view.covBtns')}</div>
            <div className="ssub">{t('settings.view.covBtns.sub')}</div>
          </div>
          <Toggle checked={p.covBtnsInBar} onChange={(v) => p.set('covBtnsInBar', v)} />
        </div>
      </div>

      <div className="s-cat-label">{t('settings.view.cat.queueLyrics')}</div>
      <div className="sc">
        <div className="sc-title">{t('settings.view.queuePos')}</div>
        <div className="sc-desc">{t('settings.view.queuePos.desc')}</div>
        <div className="s-opt-row">
          {/* При скрытой очереди выбор позиции недоступен. */}
          <OptBtn active={p.queuePos === 'left'} disabled={p.hideQueue} onClick={() => p.set('queuePos', 'left')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="13" y="3" width="8" height="18" rx="1" /></svg>
            {t('settings.view.queuePos.left')}
          </OptBtn>
          <OptBtn
            active={p.queuePos === 'bottom'}
            disabled={p.hideQueue || p.playerStyle === 'large'}
            onClick={() => p.set('queuePos', 'bottom')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="9" rx="1" /><rect x="3" y="15" width="18" height="6" rx="1" /></svg>
            {t('settings.view.queuePos.bottom')}
          </OptBtn>
          <OptBtn active={p.queuePos === 'right'} disabled={p.hideQueue} onClick={() => p.set('queuePos', 'right')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="14" y="3" width="7" height="18" rx="1" /><rect x="3" y="3" width="8" height="18" rx="1" /></svg>
            {t('settings.view.queuePos.right')}
          </OptBtn>
        </div>
      </div>

      <div className="sc">
        <div className="sc-title">{t('settings.view.lyrics')}</div>
        <div className="sc-desc">{t('settings.view.lyrics.desc')}</div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.view.lyricsInQueue')}</div>
            <div className="ssub">{t('settings.view.lyricsInQueue.sub')}</div>
          </div>
          <Toggle checked={p.lyricsInQueue} onChange={(v) => p.set('lyricsInQueue', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.view.karaoke')}</div>
            <div className="ssub">{t('settings.view.karaoke.sub')}</div>
          </div>
          <Toggle checked={karaoke} onChange={() => toggleKaraoke()} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.view.hideQueue')}</div>
            <div className="ssub">{t('settings.view.hideQueue.sub')}</div>
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
              <div className="sl2">{t('settings.view.showNext')}</div>
              <div className="ssub">{t('settings.view.showNext.sub')}</div>
            </div>
            <Toggle checked={p.showNextTrack} onChange={(v) => p.set('showNextTrack', v)} />
          </div>
        )}
      </div>

      <div className="s-cat-label">{t('settings.view.cat.miniPlayer')}</div>
      <div className="sc">
        <div className="sc-title">{t('settings.view.mpPreset')}</div>
        <div className="sc-desc">{t('settings.view.mpPreset.desc')}</div>
        <div className="s-opt-row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          <OptBtn active={activePreset === 'off'} onClick={() => p.applyMpPreset('off')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            {t('settings.view.mpPreset.off')}
          </OptBtn>
          <OptBtn active={activePreset === 'full'} onClick={() => p.applyMpPreset('full')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            {t('settings.view.mpPreset.full')}
          </OptBtn>
          <OptBtn active={activePreset === 'rounded'} onClick={() => p.applyMpPreset('rounded')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /></svg>
            {t('settings.view.mpPreset.rounded')}
          </OptBtn>
          <OptBtn active={activePreset === 'hybrid'} onClick={() => p.applyMpPreset('hybrid')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>
            {t('settings.view.mpPreset.hybrid')}
          </OptBtn>
          <OptBtn active={activePreset === 'deck'} onClick={() => p.applyMpPreset('deck')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            {t('settings.view.mpPreset.deck')}
          </OptBtn>
        </div>
      </div>

      {p.mpEnabled && (
        <>
          <div className="sc">
            <div className="sc-title">{t('settings.view.mpBg')}</div>
            <div className="sc-desc">{t('settings.view.mpBg.desc')}</div>
            <div className="s-opt-row" style={{ marginTop: 12 }}>
              <OptBtn active={p.mpBgMode === 'theme'} onClick={() => p.set('mpBgMode', 'theme')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                {t('settings.view.mpBg.theme')}
              </OptBtn>
              <OptBtn active={p.mpBgMode === 'cover'} onClick={() => p.set('mpBgMode', 'cover')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                {t('settings.view.mpBg.cover')}
              </OptBtn>
              <OptBtn active={p.mpBgMode === 'coverColor'} onClick={() => p.set('mpBgMode', 'coverColor')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></svg>
                {t('settings.view.mpBg.coverColor')}
              </OptBtn>
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">{t('settings.view.mpProgress')}</div>
            <div className="sc-desc">{t('settings.view.mpProgress.desc')}</div>
            <div className="s-opt-row" style={{ marginTop: 12 }}>
              <OptBtn active={p.mpProgress.line} onClick={() => setProgress('line')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="2" y1="12" x2="22" y2="12" /></svg>
                {t('settings.view.mpProgress.line')}
              </OptBtn>
              <OptBtn active={p.mpProgress.bg} onClick={() => setProgress('bg')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="2" y="4" width="10" height="16" rx="2" fill="currentColor" stroke="none" opacity={0.4} /></svg>
                {t('settings.view.mpProgress.bg')}
              </OptBtn>
              <OptBtn active={p.mpProgress.circle} onClick={() => setProgress('circle')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 3 A9 9 0 0 1 21 12" strokeWidth={2.5} strokeLinecap="round" /></svg>
                {t('settings.view.mpProgress.circle')}
              </OptBtn>
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">{t('settings.view.mpCover')}</div>
            <div className="sc-desc">{t('settings.view.mpCover.desc')}</div>
            <div className="s-opt-row" style={{ marginTop: 12 }}>
              <OptBtn active={p.mpCoverShape === 'default'} onClick={() => p.set('mpCoverShape', 'default')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                {t('settings.view.mpCover.default')}
              </OptBtn>
              <OptBtn active={p.mpCoverShape === 'round'} onClick={() => p.set('mpCoverShape', 'round')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /></svg>
                {t('settings.view.mpCover.round')}
              </OptBtn>
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">{t('settings.view.mpPos')}</div>
            <div className="sc-desc">{t('settings.view.mpPos.desc')}</div>
            <div className="s-opt-row" id="miniPlayerPosRow" style={{ marginTop: 12 }}>
              <OptBtn active={p.playerBarPos === 'bottom'} onClick={() => p.set('playerBarPos', 'bottom')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="12" rx="1" /><rect x="3" y="18" width="18" height="3" rx="1" /></svg>
                {t('settings.view.mpPos.bottom')}
              </OptBtn>
              <OptBtn active={p.playerBarPos === 'top'} onClick={() => p.set('playerBarPos', 'top')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="3" rx="1" /><rect x="3" y="9" width="18" height="12" rx="1" /></svg>
                {t('settings.view.mpPos.top')}
              </OptBtn>
              <OptBtn active={p.playerBarPos === 'left'} onClick={() => p.set('playerBarPos', 'left')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="3" height="18" rx="1" /><rect x="9" y="3" width="12" height="18" rx="1" /></svg>
                {t('settings.view.mpPos.left')}
              </OptBtn>
              <OptBtn active={p.playerBarPos === 'right'} onClick={() => p.set('playerBarPos', 'right')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="18" y="3" width="3" height="18" rx="1" /><rect x="3" y="3" width="12" height="18" rx="1" /></svg>
                {t('settings.view.mpPos.right')}
              </OptBtn>
            </div>
          </div>
        </>
      )}

      <div className="s-cat-label">{t('settings.view.cat.effects')}</div>
      {/* Визуализатор. Загрузка фото-фона (vizPhoto) отложена. */}
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.view.viz')}</div>
            <div className="ssub">{t('settings.view.viz.sub')}</div>
          </div>
          <Toggle checked={p.vizEnabled} onChange={(v) => p.set('vizEnabled', v)} />
        </div>
      </div>
      {p.vizEnabled && (
        <div className="sc">
          <div className="viz-type-row">
            <OptBtn active={p.vizType === 'wave'} onClick={() => p.set('vizType', 'wave')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12c2 0 2-6 4-6s2 12 4 12 2-12 4-12 2 12 4 12 2-6 4-6" /></svg>
              {t('settings.view.viz.wave')}
            </OptBtn>
            <OptBtn active={p.vizType === 'bars'} onClick={() => p.set('vizType', 'bars')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><polyline points="4 14 4 18" /><polyline points="9 6 9 18" /><polyline points="14 10 14 18" /><polyline points="20 4 20 18" /></svg>
              {t('settings.view.viz.bars')}
            </OptBtn>
          </div>
        </div>
      )}

      <div className="sc">
        <h3>{t('settings.view.moreEffects')}</h3>
        <div className="sr">
          <div>
            <div className="sl2">Ambient Glow</div>
            <div className="ssub">{t('settings.view.glow.sub')}</div>
          </div>
          <Toggle checked={p.ambientGlow} onChange={(v) => p.set('ambientGlow', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.view.parallax')}</div>
            <div className="ssub">{t('settings.view.parallax.sub')}</div>
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
