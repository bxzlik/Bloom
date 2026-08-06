import { useState } from 'react'
import {
  usePlayerViewStore,
  matchMpPreset,
  type TrackAnimCfg,
  type TrackAnimKind,
  type LyricsFill,
  type LyricsFx,
  type LyricsStyleCfg,
} from '../../model/playerViewStore'
import { useT, type TranslationKey } from '@shared/i18n'
import { Ico, type IconName } from '@shared/ui/icons/solar'

/**
 * Раздел «Плеер» (`#ssec-view`). Группы разнесены по полосе вкладок
 * (`.s-ptabs`, как в разделах «Страницы» и «Вкладки»), а не идут одной
 * простынёй с заголовками-категориями:
 *
 * - «Плеер» — выравнивание заголовка, стиль, слайдер, кнопки на обложке;
 * - «Очередь и текст» — позиция и вид очереди, текст и караоке;
 * - «Мини-плеер» — пресеты, фон, прогресс, форма, элементы, позиция, раскладка;
 * - «Анимации» — смена трека на трёх поверхностях.
 *
 * Кнопка сброса в шапке общая (сбрасывает playerViewStore целиком, как и раньше).
 */
type ViewTab = 'player' | 'queue' | 'mini' | 'anim'

const TABS: { id: ViewTab; labelKey: TranslationKey; icon: IconName }[] = [
  { id: 'player', labelKey: 'settings.view.cat.player', icon: 'note' },
  { id: 'queue', labelKey: 'settings.view.cat.queueLyrics', icon: 'lyrics' },
  { id: 'mini', labelKey: 'settings.view.cat.miniPlayer', icon: 'widget' },
  { id: 'anim', labelKey: 'settings.view.cat.anim', icon: 'stars' },
]

export const ViewSection = () => {
  const t = useT()
  const reset = usePlayerViewStore((s) => s.reset)
  const [tab, setTab] = useState<ViewTab>('player')

  return (
    <div className="s-section active" id="ssec-view">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="note" width={15} height={15} />{' '}
          {t('settings.nav.player')}
        </div>
        <button className="s-section-reset" onClick={() => reset()}>
          <Ico name="refresh" width={10} height={10} />{' '}
          {t('common.reset')}
        </button>
      </div>

      {/* Переключатель групп — полоса вкладок над карточками раздела. */}
      <div className="s-ptabs">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            className={`s-ptab${tab === tb.id ? ' active' : ''}`}
            onClick={() => setTab(tb.id)}
          >
            <Ico name={tb.icon} width={14} height={14} />
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'player' && <PlayerCards />}
      {tab === 'queue' && <QueueLyricsCards />}
      {tab === 'mini' && <MiniPlayerCards />}
      {tab === 'anim' && <AnimCards />}
    </div>
  )
}

/**
 * Вкладка «Плеер»: выравнивание, стиль, слайдер, кнопки на обложке и эффекты
 * страницы плеера — визуализатор, ambient glow, parallax.
 */
const PlayerCards = () => {
  const t = useT()
  const p = usePlayerViewStore()
  // «Кнопки на обложке в плеер» бессмысленна в большом плеере — там ♥/+ всегда в баре.
  const covBtnsLocked = p.playerStyle === 'large'

  return (
    <>
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
          {/* «Кино» (style-cinema): как большой, но без нижнего бара — инфо,
              прогресс и контролы накладываются на крупную обложку. */}
          <OptBtn
            active={p.playerStyle === 'cinema'}
            onClick={() => {
              p.set('playerStyle', 'cinema')
              if (p.queuePos === 'bottom') p.set('queuePos', 'right')
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15h18" /><path d="M8 19h8" /></svg>
            {t('settings.view.style.cinema')}
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
          <OptBtn active={p.sliderType === 'cover'} onClick={() => p.set('sliderType', 'cover')}>
            <svg width="44" height="10" viewBox="0 0 44 10"><rect x="0" y="4" width="44" height="2" rx="1" fill="currentColor" opacity={0.3} /><rect x="0" y="4" width="22" height="2" rx="1" fill="currentColor" /><rect x="17" y="0.5" width="9" height="9" rx="2" fill="currentColor" /></svg>
            {t('settings.view.slider.cover')}
          </OptBtn>
        </div>
      </div>

      {/* В большом плеере ♥/+ и так живут в нижнем баре (единственная их копия,
          см. .sl-bottom-info в PagePlayer) — настройке нечего переносить, поэтому
          тумблер недоступен и нейтрален по цвету. */}
      <div className="sc">
        <div className="sr">
          <div style={covBtnsLocked ? { opacity: 0.45 } : undefined}>
            <div className="sl2">{t('settings.view.covBtns')}</div>
            <div className="ssub">{t('settings.view.covBtns.sub')}</div>
          </div>
          <Toggle
            checked={p.covBtnsInBar}
            disabled={covBtnsLocked}
            onChange={(v) => p.set('covBtnsInBar', v)}
          />
        </div>
      </div>

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
    </>
  )
}

/**
 * Вкладка «Очередь и текст»: позиция и вид очереди, текст/караоке.
 * Сторона выезжающей панели и блокировка её ширины переехали в «Интерфейс» →
 * «Боковые панели» (там же общая настройка сторон для всех drawer'ов).
 */
const QueueLyricsCards = () => {
  const t = useT()
  const p = usePlayerViewStore()

  return (
    <>
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
            disabled={p.hideQueue || p.playerStyle === 'large' || p.playerStyle === 'cinema'}
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
        <div className="sc-title">{t('settings.view.queueView')}</div>
        <div className="sc-desc">{t('settings.view.queueView.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.queueView === 'normal'} disabled={p.hideQueue} onClick={() => p.set('queueView', 'normal')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
            {t('settings.view.queueView.normal')}
          </OptBtn>
          <OptBtn active={p.queueView === 'extended'} disabled={p.hideQueue} onClick={() => p.set('queueView', 'extended')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            {t('settings.view.queueView.extended')}
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
        {p.hideQueue && p.playerStyle !== 'large' && p.playerStyle !== 'cinema' && (
          <div className="sr">
            <div>
              <div className="sl2">{t('settings.view.showNext')}</div>
              <div className="ssub">{t('settings.view.showNext.sub')}</div>
            </div>
            <Toggle checked={p.showNextTrack} onChange={(v) => p.set('showNextTrack', v)} />
          </div>
        )}
      </div>

      {/* Оформление текста — своя карточка на каждую поверхность. */}
      {(['player', 'panel', 'big'] as const).map((surface) => (
        <LyricsStyleCard
          key={surface}
          label={t(`settings.view.lyricsStyle.${surface}`)}
          sub={t(`settings.view.lyricsStyle.${surface}.sub`)}
          cfg={p.lyricsStyle[surface]}
          onChange={(next) => p.set('lyricsStyle', { ...p.lyricsStyle, [surface]: next })}
        />
      ))}
    </>
  )
}

/** Вкладка «Мини-плеер»: пресеты и всё, что раскрывается при включённом баре. */
const MiniPlayerCards = () => {
  const t = useT()
  const p = usePlayerViewStore()
  const activePreset = matchMpPreset(p)
  const setProgress = (key: 'line' | 'bg' | 'circle') =>
    p.set('mpProgress', { ...p.mpProgress, [key]: !p.mpProgress[key] })
  const toggleHide = (key: keyof typeof p.mpHide) =>
    p.set('mpHide', { ...p.mpHide, [key]: !p.mpHide[key] })

  return (
    <>
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
            <div className="sc-title">{t('settings.view.mpShape')}</div>
            <div className="sc-desc">{t('settings.view.mpShape.desc')}</div>
            <div className="s-opt-row" style={{ marginTop: 12 }}>
              <OptBtn active={!p.mpRounded} onClick={() => p.set('mpRounded', false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                {t('settings.view.mpShape.default')}
              </OptBtn>
              <OptBtn active={p.mpRounded} onClick={() => p.set('mpRounded', true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /></svg>
                {t('settings.view.mpShape.capsule')}
              </OptBtn>
            </div>
          </div>

          <div className="sc">
            <div className="sc-title">{t('settings.view.mpElements')}</div>
            <div className="sc-desc">{t('settings.view.mpElements.desc')}</div>
            <div className="s-opt-row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
              <OptBtn active={!p.mpHide.fav} onClick={() => toggleHide('fav')}>
                <Ico name="heart" width={18} height={18} />
                {t('settings.view.mpEl.fav')}
              </OptBtn>
              <OptBtn active={!p.mpHide.add} onClick={() => toggleHide('add')}>
                <Ico name="addCircle" width={18} height={18} />
                {t('settings.view.mpEl.add')}
              </OptBtn>
              <OptBtn active={!p.mpHide.lyrics} onClick={() => toggleHide('lyrics')}>
                <Ico name="lyrics" width={18} height={18} />
                {t('settings.view.mpEl.lyrics')}
              </OptBtn>
              <OptBtn active={!p.mpHide.queue} onClick={() => toggleHide('queue')}>
                <Ico name="sidebar" width={18} height={18} />
                {t('settings.view.mpEl.queue')}
              </OptBtn>
              <OptBtn active={!p.mpHide.bigpic} onClick={() => toggleHide('bigpic')}>
                <Ico name="bigpic" width={18} height={18} />
                {t('settings.view.mpEl.bigpic')}
              </OptBtn>
              <OptBtn active={!p.mpHide.shuffle} onClick={() => toggleHide('shuffle')}>
                <Ico name="shuffle" width={18} height={18} />
                {t('settings.view.mpEl.shuffle')}
              </OptBtn>
              <OptBtn active={!p.mpHide.repeat} onClick={() => toggleHide('repeat')}>
                <Ico name="repeat" width={18} height={18} />
                {t('settings.view.mpEl.repeat')}
              </OptBtn>
              <OptBtn active={!p.mpHide.time} onClick={() => toggleHide('time')}>
                <Ico name="clock" width={18} height={18} />
                {t('settings.view.mpEl.time')}
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

          {/* Раскладка бара — только для горизонтального (bottom/top). Два сегментных
              переключателя: положение (обычный/в самом низу/плавающий) и ширина
              (обычный/компактный). Взаимоисключения внутри каждой группы держит стор. */}
          {(p.playerBarPos === 'bottom' || p.playerBarPos === 'top') && (
            <>
              <div className="sc">
                <div className="sc-title">{t('settings.view.mpLayout')}</div>
                <div className="sc-desc">{t('settings.view.mpLayout.desc')}</div>
                <div className="s-opt-row" style={{ marginTop: 12 }}>
                  {/* Обычный — оба флага сняты (стандартный бар в потоке). */}
                  <OptBtn
                    active={!p.mpFullWidth && !p.mpFloating}
                    onClick={() => {
                      p.set('mpFullWidth', false)
                      p.set('mpFloating', false)
                    }}
                  >
                    {/* Обычный: сайдбар во всю высоту + бар только в колонке контента. */}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="18" rx="1.2" /><rect x="10" y="3" width="11" height="12" rx="1.2" /><rect x="10" y="17" width="11" height="4" rx="1.2" /></svg>
                    {t('settings.view.mpLayout.normal')}
                  </OptBtn>
                  {/* В самом низу — mpFullWidth (стор гасит mpFloating). */}
                  <OptBtn active={p.mpFullWidth} onClick={() => p.set('mpFullWidth', true)}>
                    {/* Укороченный сайдбар + контент, бар во всю ширину под ними. */}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="12" rx="1.2" /><rect x="10" y="3" width="11" height="12" rx="1.2" /><rect x="3" y="17" width="18" height="4" rx="1.2" /></svg>
                    {t('settings.view.mpFullWidth')}
                  </OptBtn>
                  {/* Плавающий — mpFloating (стор гасит mpFullWidth+mpFlush). */}
                  <OptBtn active={p.mpFloating} onClick={() => p.set('mpFloating', true)}>
                    {/* Контент во всю площадь + плавающая скруглённая плашка поверх низа. */}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1.2" /><rect x="6" y="15" width="12" height="4" rx="2" fill="currentColor" fillOpacity="0.9" stroke="none" /></svg>
                    {t('settings.view.mpFloating')}
                  </OptBtn>
                </div>
              </div>

              {/* Без отступов — отдельная плитка-тоггл. Одиночный .sr в обычной .sc
                  глобальное правило (settings.css) рендерит как самостоятельную
                  плитку. Виден только при «в самом низу» и не в компактном. */}
              {p.mpFullWidth && !p.mpCompact && (
                <div className="sc">
                  <div className="sr">
                    <div>
                      <div className="sl2">{t('settings.view.mpFlush')}</div>
                      <div className="ssub">{t('settings.view.mpFlush.sub')}</div>
                    </div>
                    <Toggle checked={p.mpFlush} onChange={(v) => p.set('mpFlush', v)} />
                  </div>
                </div>
              )}

              <div className="sc">
                <div className="sc-title">{t('settings.view.mpWidth')}</div>
                <div className="sc-desc">{t('settings.view.mpWidth.desc')}</div>
                <div className="s-opt-row" style={{ marginTop: 12 }}>
                  <OptBtn active={!p.mpCompact} onClick={() => p.set('mpCompact', false)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="9" width="18" height="6" rx="1" /></svg>
                    {t('settings.view.mpWidth.normal')}
                  </OptBtn>
                  {/* Компактный — стор гасит mpFlush. */}
                  <OptBtn active={p.mpCompact} onClick={() => p.set('mpCompact', true)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="7" y="9" width="10" height="6" rx="1" /></svg>
                    {t('settings.view.mpCompact')}
                  </OptBtn>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

/**
 * Вкладка «Анимации» — только смена трека. Эффекты (визуализатор, glow,
 * parallax) живут во вкладке «Плеер»: они про статичный вид обложки, а здесь —
 * движение. Каждая поверхность (плеер / нижний бар / фуллскрин) — своя карточка:
 * у них разный размер коробки, и одна настройка на всех заставляла бы выбирать
 * между «красиво в плеере» и «не рябит в баре».
 */
const AnimCards = () => {
  const t = useT()
  const p = usePlayerViewStore()

  return (
    <>
      {(['player', 'bar', 'big'] as const).map((surface) => (
        <TrackAnimCard
          key={surface}
          label={t(`settings.view.trackAnim.${surface}`)}
          sub={t(`settings.view.trackAnim.${surface}.sub`)}
          cfg={p.trackAnim[surface]}
          onChange={(next) => p.set('trackAnim', { ...p.trackAnim, [surface]: next })}
        />
      ))}
    </>
  )
}

/**
 * Карточка анимации смены трека для одной поверхности. Две независимые строки:
 * обложка и подпись — у них разный вес в кадре, и слайд обложки при спокойном
 * затухании текста (или наоборот) — рабочая комбинация, а не «недонастройка».
 */
const TrackAnimCard = ({
  label,
  sub,
  cfg,
  onChange,
}: {
  label: string
  sub: string
  cfg: TrackAnimCfg
  onChange: (next: TrackAnimCfg) => void
}) => {
  const t = useT()
  return (
    <div className="sc">
      <div className="sc-title">{label}</div>
      <div className="sc-desc">{sub}</div>
      <TrackAnimRow
        icon="gallery"
        label={t('settings.view.trackAnim.cover')}
        value={cfg.cover}
        onChange={(kind) => onChange({ ...cfg, cover: kind })}
      />
      <TrackAnimRow
        icon="text"
        label={t('settings.view.trackAnim.text')}
        value={cfg.text}
        onChange={(kind) => onChange({ ...cfg, text: kind })}
      />
    </div>
  )
}

/** Строка выбора типа анимации для одной цели (обложка / подпись). */
const TrackAnimRow = ({
  icon,
  label,
  value,
  onChange,
}: {
  icon: 'gallery' | 'text'
  label: string
  value: TrackAnimKind
  onChange: (kind: TrackAnimKind) => void
}) => {
  const t = useT()
  return (
    <>
      <div className="sc-desc" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Ico name={icon} width={13} height={13} />
        {label}
      </div>
      <div className="s-opt-row">
        <OptBtn active={value === 'none'} onClick={() => onChange('none')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="12" cy="12" r="9" /><line x1="6" y1="18" x2="18" y2="6" /></svg>
          {t('settings.view.trackAnim.none')}
        </OptBtn>
        <OptBtn active={value === 'slide'} onClick={() => onChange('slide')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="9" height="12" rx="1.5" opacity={0.4} /><rect x="13" y="6" width="9" height="12" rx="1.5" /><path d="M9 12h6" opacity={0.4} /></svg>
          {t('settings.view.trackAnim.slide')}
        </OptBtn>
        <OptBtn active={value === 'fade'} onClick={() => onChange('fade')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="3" y="6" width="12" height="12" rx="1.5" opacity={0.35} /><rect x="9" y="6" width="12" height="12" rx="1.5" /></svg>
          {t('settings.view.trackAnim.fade')}
        </OptBtn>
      </div>
    </>
  )
}

/** Порядок заливок в карточке — от самой спокойной к самой дробной. */
const LYRICS_FILLS: LyricsFill[] = ['line', 'word', 'letter', 'wipe']
const LYRICS_FXS: LyricsFx[] = ['none', 'fade', 'glow', 'spring']

/**
 * Карточка оформления текста одной поверхности. Две независимые строки:
 * ЗАЛИВКА (чем меряется прогресс) и ЭФФЕКТ (как появляется единица) — это
 * разные вещи, и «по буквам со свечением» ничем не хуже «по словам сразу».
 */
const LyricsStyleCard = ({
  label,
  sub,
  cfg,
  onChange,
}: {
  label: string
  sub: string
  cfg: LyricsStyleCfg
  onChange: (next: LyricsStyleCfg) => void
}) => {
  const t = useT()
  return (
    <div className="sc">
      <div className="sc-title">{label}</div>
      <div className="sc-desc">{sub}</div>
      <div className="sc-desc" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Ico name="lyrics" width={13} height={13} />
        {t('settings.view.lyricsStyle.fill')}
      </div>
      <div className="s-opt-row">
        {LYRICS_FILLS.map((fill) => (
          <OptBtn key={fill} active={cfg.fill === fill} onClick={() => onChange({ ...cfg, fill })}>
            <LyricsStyleIcon kind={fill} />
            {t(`settings.view.lyricsStyle.fill.${fill}`)}
          </OptBtn>
        ))}
      </div>
      <div className="sc-desc" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Ico name="stars" width={13} height={13} />
        {t('settings.view.lyricsStyle.fx')}
      </div>
      <div className="s-opt-row">
        {LYRICS_FXS.map((fx) => (
          <OptBtn key={fx} active={cfg.fx === fx} onClick={() => onChange({ ...cfg, fx })}>
            <LyricsStyleIcon kind={fx} />
            {t(`settings.view.lyricsStyle.fx.${fx}`)}
          </OptBtn>
        ))}
      </div>
    </div>
  )
}

/**
 * Мини-превью заливки/эффекта: строка как ряд плашек-единиц, яркость плашки —
 * спето / поётся / ещё нет. Рисуем прямо здесь, а не иконкой из набора: тут
 * важно показать РАСПРЕДЕЛЕНИЕ яркости внутри строки, а не предмет.
 */
const LyricsStyleIcon = ({ kind }: { kind: LyricsFill | LyricsFx }) => {
  const bar = (x: number, w: number, o: number, y = 10) => (
    <rect key={`${x}-${y}`} x={x} y={y} width={w} height={4} rx={1.5} fill="currentColor" opacity={o} />
  )
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      {/* заливки */}
      {kind === 'line' && [bar(2, 20, 0.22, 4), bar(2, 20, 1, 10), bar(2, 20, 0.22, 16)]}
      {kind === 'word' && [bar(2, 6, 1), bar(10, 5, 1), bar(17, 5, 0.22)]}
      {kind === 'letter' && [
        bar(2, 2.4, 1),
        bar(5.4, 2.4, 1),
        bar(8.8, 2.4, 1),
        bar(12.2, 2.4, 0.22),
        bar(15.6, 2.4, 0.22),
        bar(19, 2.4, 0.22),
      ]}
      {kind === 'wipe' && [bar(2, 6, 1), bar(10, 2.6, 1), bar(12.6, 2.4, 0.22), bar(17, 5, 0.22)]}
      {/* эффекты */}
      {kind === 'none' && [bar(2, 9, 1), bar(13, 9, 0.22)]}
      {kind === 'fade' && [bar(2, 6, 1), bar(10, 5, 0.55), bar(17, 5, 0.22)]}
      {kind === 'glow' && [
        bar(2, 6, 1),
        <rect key="halo" x={8.5} y={8} width={8} height={8} rx={3} fill="currentColor" opacity={0.22} />,
        bar(10, 5, 1),
        bar(18, 4, 0.22),
      ]}
      {/* пружина: средняя единица «вспухла» — крупнее соседних */}
      {kind === 'spring' && [
        bar(2, 6, 1),
        <rect key="pop" x={9.5} y={6.5} width={6} height={7} rx={2} fill="currentColor" />,
        bar(17.5, 4.5, 0.22),
      ]}
    </svg>
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

const Toggle = ({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) => (
  <label className="tele-sw">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="tele-sw-track" />
  </label>
)
