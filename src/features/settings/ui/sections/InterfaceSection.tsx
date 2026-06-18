import { useEffect, useRef, useState } from 'react'
import { useThemeStore, THEME_PRESETS, type ThemePreset } from '../../model/themeStore'
import { useUiPrefsStore } from '../../model/uiPrefsStore'
import { useTransparencyStore } from '../../model/transparencyStore'
import { openColorPicker } from '../../model/colorPickerStore'
import { toast } from '@shared/ui'
import { useT, useI18nStore, useLocale, LOCALES, type TFunc, type TranslationKey } from '@shared/i18n'
import {
  FONT_CATS,
  FONT_CAT_LABELS,
  ensureFontLoaded,
  catOfFont,
  type FontCat,
} from '../../lib/fonts'

/**
 * Раздел «Интерфейс» (`#ssec-interface`). Перенесена РАБОЧАЯ часть:
 * цвета (акцент/блоки/фон), расположение сайдбара (лево/верх/право, компакт,
 * разделители, стиль системных карточек), навигация (видимость кнопок,
 * индикатор, метка в шапке), рамки (прозрачность бордеров).
 *
 * + скругление углов (radius).
 * + прозрачность/стекло (trMode/blockOpacity/glassStr/glassBlur, transparencyStore).
 *
 * Отложено (отдельным заходом): grid-вид библиотеки (setLibView).
 */

/** Флаги языков */
const FLAGS: Record<string, React.ReactNode> = {
  en: (
    <svg viewBox="0 0 36 24" className="s-flag-svg" role="img" aria-label="US">
      <rect width="36" height="24" rx="2" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(i * 24) / 13} width="36" height={24 / 13} fill="#b22234" />
      ))}
      <rect width="15.6" height={(24 / 13) * 7} fill="#3c3b6e" />
      {Array.from({ length: 4 }).map((_, r) =>
        Array.from({ length: 5 }).map((_, c) => (
          <circle key={`${r}-${c}`} cx={1.6 + c * 3.1 + (r % 2 ? 1.55 : 0)} cy={1.6 + r * 2.9} r="0.6" fill="#fff" />
        )),
      )}
    </svg>
  ),
  ru: (
    <svg viewBox="0 0 36 24" className="s-flag-svg" role="img" aria-label="RU">
      <rect width="36" height="24" rx="2" fill="#fff" />
      <rect y="8" width="36" height="8" fill="#0039a6" />
      <rect y="16" width="36" height="8" fill="#d52b1e" />
    </svg>
  ),
}

export const InterfaceSection = () => {
  const t = useT()
  const locale = useLocale()
  const setLocale = useI18nStore((s) => s.setLocale)
  const bg = useThemeStore((s) => s.bg)
  const blockColor = useThemeStore((s) => s.blockColor)
  const accent = useThemeStore((s) => s.accent)
  const fontFamily = useThemeStore((s) => s.fontFamily)
  const setFontFamily = useThemeStore((s) => s.setFontFamily)
  const radius = useThemeStore((s) => s.radius)
  const setRadius = useThemeStore((s) => s.setRadius)
  const autoAccent = useThemeStore((s) => s.autoAccent)
  const setAutoAccent = useThemeStore((s) => s.setAutoAccent)
  const customThemes = useThemeStore((s) => s.customThemes)
  const activeThemeId = useThemeStore((s) => s.activeThemeId)
  const applyTheme = useThemeStore((s) => s.applyTheme)
  const createCustomTheme = useThemeStore((s) => s.createCustomTheme)
  const deleteCustomTheme = useThemeStore((s) => s.deleteCustomTheme)

  const p = useUiPrefsStore()

  const trMode = useTransparencyStore((s) => s.trMode)
  const blockOpacity = useTransparencyStore((s) => s.blockOpacity)
  const glassStr = useTransparencyStore((s) => s.glassStr)
  const glassBlur = useTransparencyStore((s) => s.glassBlur)
  const setTrMode = useTransparencyStore((s) => s.setMode)
  const setBlockOpacity = useTransparencyStore((s) => s.setBlockOpacity)
  const setGlassStr = useTransparencyStore((s) => s.setGlassStr)
  const setGlassBlur = useTransparencyStore((s) => s.setGlassBlur)

  // Шрифт: вкладка категории + грид. Стартовая вкладка — категория текущего шрифта.
  const [fontCat, setFontCat] = useState<FontCat>(() => catOfFont(fontFamily))
  useEffect(() => {
    FONT_CATS[fontCat].forEach((f) => ensureFontLoaded(f.val))
  }, [fontCat])
  const normFont = fontFamily.replace(/\s/g, '')
  const pickFont = (val: string) => {
    setFontFamily(val)
    ensureFontLoaded(val)
  }

  return (
    <div className="s-section active" id="ssec-interface">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
          </svg>{' '}
          {t('settings.interface.title')}
        </div>
        <button className="s-section-reset" onClick={() => p.reset()}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>{' '}
          {t('common.reset')}
        </button>
      </div>

      <div className="s-cat-label">{t('settings.interface.cat.language')}</div>
      <div className="s-lang-grid">
        {LOCALES.map((l) => (
          <button
            key={l.id}
            className={`s-lang-card${locale === l.id ? ' active' : ''}`}
            onClick={() => setLocale(l.id)}
          >
            {locale === l.id && <span className="s-lang-badge">{l.code}</span>}
            <span className="s-lang-flag">{FLAGS[l.id]}</span>
            <span className="s-lang-name">{t(l.labelKey)}</span>
          </button>
        ))}
      </div>

      <div className="s-cat-label">{t('settings.interface.cat.theme')}</div>
      <div className="sc sc-keep">
        <ThemePicker
          customThemes={customThemes}
          activeId={activeThemeId}
          liveColors={{ bg, blockColor, accent }}
          onApply={applyTheme}
          onDelete={(id) => { deleteCustomTheme(id); toast(t('theme.toast.deleted')) }}
          onCreate={(name, colors) => { createCustomTheme(name, colors); toast(t('theme.toast.created', { name: name.trim() || t('theme.defaultName') })) }}
          t={t}
        />
      </div>
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.autoAccent.title')}</div>
            <div className="ssub">{t('settings.interface.autoAccent.sub')}</div>
          </div>
          <Toggle checked={autoAccent} onChange={setAutoAccent} />
        </div>
      </div>

      <div className="s-cat-label">{t('settings.interface.cat.view')}</div>
      <div className="sc sc-keep">
        <div className="sc-title">{t('settings.interface.sidebarPos.title')}</div>
        <div className="sc-desc">{t('settings.interface.sidebarPos.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.sidebarPos === 'left'} onClick={() => p.set('sidebarPos', 'left')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="11" y="3" width="10" height="18" rx="1" /></svg>
            {t('settings.interface.sidebarPos.left')}
          </OptBtn>
          <OptBtn active={p.sidebarPos === 'top'} onClick={() => p.set('sidebarPos', 'top')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="5" rx="1" /><rect x="3" y="11" width="18" height="10" rx="1" /></svg>
            {t('settings.interface.sidebarPos.top')}
          </OptBtn>
          <OptBtn active={p.sidebarPos === 'right'} onClick={() => p.set('sidebarPos', 'right')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="16" y="3" width="5" height="18" rx="1" /><rect x="3" y="3" width="10" height="18" rx="1" /></svg>
            {t('settings.interface.sidebarPos.right')}
          </OptBtn>
        </div>
        <div className="s-opt-row" style={{ marginTop: 8 }}>
          <OptBtn active={!p.sidebarCompact} onClick={() => p.set('sidebarCompact', false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="4" y="7" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="11" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="15" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.sidebar.normal')}
          </OptBtn>
          <OptBtn active={p.sidebarCompact} onClick={() => p.set('sidebarCompact', true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="4" y="6" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="10" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="14" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.sidebar.compact')}
          </OptBtn>
        </div>
        <div className="sr" style={{ marginTop: 8 }}>
          <div>
            <div className="sl2">{t('settings.interface.sidebar.sep.title')}</div>
            <div className="ssub">{t('settings.interface.sidebar.sep.sub')}</div>
          </div>
          <Toggle checked={p.sbSep} onChange={(v) => p.set('sbSep', v)} />
        </div>
      </div>

      <div className="sc sc-keep">
        <div className="sc-title">{t('settings.interface.libView.title')}</div>
        <div className="sc-desc">{t('settings.interface.libView.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.libView === 'list'} onClick={() => p.set('libView', 'list')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.libView.list')}
          </OptBtn>
          <OptBtn active={p.libView === 'grid'} onClick={() => p.set('libView', 'grid')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            {t('settings.interface.libView.grid')}
          </OptBtn>
        </div>
      </div>

      <div className="sc sc-keep">
        <div className="sc-title">{t('settings.interface.libSys.title')}</div>
        <div className="sc-desc">{t('settings.interface.libSys.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.libSysStyle === 'accent'} onClick={() => p.set('libSysStyle', 'accent')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none" /><path d="M3 17l5-5 4 4 3-3 6 4" /></svg>
            {t('settings.interface.libSys.accent')}
          </OptBtn>
          <OptBtn active={p.libSysStyle === 'classic'} onClick={() => p.set('libSysStyle', 'classic')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="14" y2="13" /></svg>
            {t('settings.interface.libSys.classic')}
          </OptBtn>
        </div>
      </div>

      <div className="s-cat-label">{t('settings.interface.cat.scaling')}</div>
      <ZoomCard title={t('settings.interface.zoom.fullscreen')} value={p.fullZoom} onChange={(v) => p.set('fullZoom', v)} />
      <ZoomCard title={t('settings.interface.zoom.windowed')} value={p.winZoom} onChange={(v) => p.set('winZoom', v)} />

      <div className="s-cat-label">{t('settings.interface.cat.font')}</div>
      <div className="sc">
        <div className="sc-title">{t('settings.interface.font.title')}</div>
        <div className="sc-desc">{t('settings.interface.font.desc')}</div>
        <div className="s-font-cats" style={{ marginTop: 12, flexWrap: 'nowrap' }}>
          {FONT_CAT_LABELS.map((c) => (
            <button
              key={c.id}
              className={`s-font-cat${fontCat === c.id ? ' active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setFontCat(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="s-font-grid">
          {FONT_CATS[fontCat].map((f) => (
            <button
              key={f.name}
              className={`s-font-item${normFont === f.val.replace(/\s/g, '') ? ' active' : ''}`}
              style={{ fontFamily: f.val }}
              onClick={() => pickFont(f.val)}
            >
              <span className="s-font-item-aa" style={{ fontFamily: f.val }}>Aa</span>
              <span className="s-font-item-name">{f.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="s-cat-label">{t('settings.interface.cat.interface')}</div>
      <div className="sc">
        <div className="sc-title">{t('settings.interface.radius.title')}</div>
        <div className="sc-desc">{t('settings.interface.radius.desc')}</div>
        <div className="s-opt-row" style={{ marginTop: 12 }}>
          <OptBtn active={radius === 0} onClick={() => setRadius(0)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" /></svg>
            {t('settings.interface.radius.none')}
          </OptBtn>
          <OptBtn active={radius === 6} onClick={() => setRadius(6)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="3" /></svg>
            {t('settings.interface.radius.small')}
          </OptBtn>
          <OptBtn active={radius === 14} onClick={() => setRadius(14)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="7" /></svg>
            {t('settings.interface.radius.medium')}
          </OptBtn>
          <OptBtn active={radius === 24} onClick={() => setRadius(24)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="12" /></svg>
            {t('settings.interface.radius.large')}
          </OptBtn>
        </div>
      </div>
      <div className="sc">
        <div className="sc-title">{t('settings.interface.borders.title')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span className="ssub" style={{ minWidth: 36 }}>{Math.round((p.borderAlpha / 6) * 100)}%</span>
          <input
            type="range"
            className="srange-full"
            min={0}
            max={6}
            value={p.borderAlpha}
            onChange={(e) => p.set('borderAlpha', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="s-cat-label">{t('settings.interface.cat.navigation')}</div>
      <div className="sc">
        <div className="sc-title">{t('settings.interface.nav.title')}</div>
        <div className="sc-desc">{t('settings.interface.nav.desc')}</div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.nav.float.title')}</div>
            <div className="ssub">{t('settings.interface.nav.float.sub')}</div>
          </div>
          <Toggle checked={p.navFloatBtn} onChange={(v) => p.set('navFloatBtn', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.nav.indicator.title')}</div>
            <div className="ssub">{t('settings.interface.nav.indicator.sub')}</div>
          </div>
          <Toggle checked={p.navIndicator} onChange={(v) => p.set('navIndicator', v)} />
        </div>
      </div>

      <div className="s-cat-label">{t('settings.interface.cat.titlebar')}</div>
      <div className="sc">
        <div className="sc-title">{t('settings.interface.titlebar.title')}</div>
        <div className="sc-desc">{t('settings.interface.titlebar.desc')}</div>
        <div className="tb-chip-grid">
          {TITLEBAR_ITEMS.map((it) => (
            <TbChip
              key={it.key}
              active={!!p[it.key]}
              icon={it.icon}
              label={t(it.labelKey)}
              onClick={() => p.set(it.key, !p[it.key])}
            />
          ))}
        </div>
      </div>

      <div className="s-cat-label">{t('settings.interface.cat.transparency')}</div>
      <div className="sc">
        <div className="sc-title">{t('settings.interface.transparency.title')}</div>
        <div className="sc-desc">{t('settings.interface.transparency.desc')}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className={`s-mode-btn${trMode === 'off' ? ' active' : ''}`} onClick={() => setTrMode('off')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            {t('settings.interface.transparency.off')}
          </button>
          <button className={`s-mode-btn${trMode === 'on' ? ' active' : ''}`} onClick={() => setTrMode('on')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M9 21V9" /></svg>
            {t('settings.interface.transparency.on')}
          </button>
        </div>
        <div className={`${trMode === 'on' ? 'vis' : ''}`} id="sTrSliders">
          <div className="s-sliders-3" style={{ marginTop: 14 }}>
            <GlassSlider label={t('settings.interface.transparency.blockOpacity')} valLabel={`${blockOpacity}%`} min={0} max={100} value={blockOpacity} onChange={setBlockOpacity} />
            <GlassSlider label={t('settings.interface.transparency.glassStr')} valLabel={`${glassStr}%`} min={0} max={100} value={glassStr} onChange={setGlassStr} />
            <GlassSlider label={t('settings.interface.transparency.glassBlur')} valLabel={`${glassBlur}px`} min={0} max={40} value={glassBlur} onChange={setGlassBlur} />
          </div>
        </div>
      </div>

    </div>
  )
}

const GlassSlider = ({ label, valLabel, min, max, value, onChange }: { label: string; valLabel: string; min: number; max: number; value: number; onChange: (v: number) => void }) => (
  <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 'calc(var(--radius)*0.7)', padding: 12 }}>
    <div className="s-slider-col-head">
      <span className="s-slider-col-lbl">{label}</span>
      <span className="s-slider-col-val">{valLabel}</span>
    </div>
    <input type="range" className="srange-full" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </div>
)

const ZOOM_PRESETS = [70, 85, 100, 115, 130]

const ZoomCard = ({ title, value, onChange }: { title: string; value: number; onChange: (v: number) => void }) => {
  // Снап к ближайшему пресету для подсветки плитки.
  const snap = ZOOM_PRESETS.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a))
  return (
    <div className="sc">
      <div className="sc-title">{title}</div>
      <div className="s-zoom-presets" style={{ marginTop: 14 }}>
        {ZOOM_PRESETS.map((z) => (
          <button key={z} className={`s-zoom-tile ${z === snap ? 'bta' : 'btg'}`} onClick={() => onChange(z)}>
            <svg width="18" height="14" viewBox="0 0 22 17" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="1" y="1" width="20" height="13" rx="2" /><line x1="7" y1="14" x2="15" y2="14" /><line x1="11" y1="14" x2="11" y2="16" /></svg>
            {z}%
          </button>
        ))}
      </div>
      <div className="s-zoom-slider-row" style={{ marginTop: 12 }}>
        <span className="s-zoom-slider-lbl">{title}</span>
        <span className="s-zoom-slider-val">{value}%</span>
      </div>
      <input
        type="range"
        className="srange-full"
        min={70}
        max={130}
        value={value}
        style={{ marginTop: 6, display: 'block' }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

type ThemeColors = { bg: string; blockColor: string; accent: string }

/** Случайная приятная палитра (тёмный фон/карточка + насыщенный акцент). */
const randomThemeColors = (): ThemeColors => {
  const h = Math.floor(Math.random() * 360)
  const bgL = 5 + Math.random() * 5 // 5–10%
  return {
    bg: hslToHex(h, 18, bgL),
    blockColor: hslToHex(h, 16, bgL + 5),
    accent: hslToHex((h + 20 + Math.random() * 320) % 360, 65, 58),
  }
}

const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

/**
 * Пикер темы (как на референсе): компактная строка с текущей темой + кнопка «+».
 * Строка раскрывает грид пресетов; «+» открывает поповер создания темы
 * (название + 3 цвета + «Случайные цвета» / «Сохранить»).
 */
const ThemePicker = ({
  customThemes,
  activeId,
  liveColors,
  onApply,
  onDelete,
  onCreate,
  t,
}: {
  customThemes: ThemePreset[]
  activeId: string
  liveColors: ThemeColors
  onApply: (id: string) => void
  onDelete: (id: string) => void
  onCreate: (name: string, colors: ThemeColors) => void
  t: TFunc
}) => {
  const [mode, setMode] = useState<'none' | 'list' | 'create'>('none')
  const rootRef = useRef<HTMLDivElement>(null)

  const allThemes = [...THEME_PRESETS, ...customThemes]
  const current = allThemes.find((t) => t.id === activeId)
  const currentName = current?.name ?? t('theme.ownName')
  const currentPreview = current?.preview ?? { bg: liveColors.bg, card: liveColors.blockColor, accent: liveColors.accent }

  // Клик вне пикера закрывает поповер (но не клик внутри глобального color-picker).
  useEffect(() => {
    if (mode === 'none') return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (rootRef.current?.contains(t) || t?.closest?.('#cpPopup')) return
      setMode('none')
    }
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 10)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', onDown)
    }
  }, [mode])

  return (
    <div className="tp" ref={rootRef}>
      <button className={`tp-current${mode === 'list' ? ' open' : ''}`} onClick={() => setMode((m) => (m === 'list' ? 'none' : 'list'))}>
        <Dots preview={currentPreview} />
        <span className="tp-current-name">{currentName}</span>
        <svg className="tp-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <button className={`tp-add${mode === 'create' ? ' open' : ''}`} onClick={() => setMode((m) => (m === 'create' ? 'none' : 'create'))}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {mode === 'list' && (
        <div className="tp-pop tp-list">
          <div className="theme-section-label">{t('theme.builtin')}</div>
          <div className="tp-grid">
            {THEME_PRESETS.map((t) => (
              <TpCard key={t.id} t={t} active={t.id === activeId} onApply={(id) => { onApply(id); setMode('none') }} />
            ))}
          </div>
          {customThemes.length > 0 && (
            <>
              <div className="theme-section-label" style={{ marginTop: 12 }}>{t('theme.mine')}</div>
              <div className="tp-grid">
                {customThemes.map((t) => (
                  <TpCard key={t.id} t={t} active={t.id === activeId} onApply={(id) => { onApply(id); setMode('none') }} onDelete={onDelete} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {mode === 'create' && (
        <ThemeCreator
          initial={currentPreview}
          onCreate={(name, colors) => { onCreate(name, colors); setMode('none') }}
          t={t}
        />
      )}
    </div>
  )
}

/** Три кружка-превью палитры (фон / карточка / акцент). */
const Dots = ({ preview }: { preview: { bg: string; card: string; accent: string } }) => (
  <span className="tp-dots">
    <span className="tp-dot" style={{ background: preview.bg }} />
    <span className="tp-dot" style={{ background: preview.card }} />
    <span className="tp-dot" style={{ background: preview.accent }} />
  </span>
)

const TpCard = ({
  t,
  active,
  onApply,
  onDelete,
}: {
  t: ThemePreset
  active: boolean
  onApply: (id: string) => void
  onDelete?: (id: string) => void
}) => (
  <button className={`tp-card${active ? ' active' : ''}`} onClick={() => onApply(t.id)}>
    {onDelete && t.custom && (
      <span
        className="tp-card-del"
        role="button"
        onClick={(e) => { e.stopPropagation(); onDelete(t.id) }}
      >
        ✕
      </span>
    )}
    <Dots preview={t.preview} />
    <span className="tp-card-name">{t.name}</span>
    {active && (
      <svg className="tp-card-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )}
  </button>
)

/** Поповер создания темы: название + 3 цвета + случайные/сохранить. */
const ThemeCreator = ({
  initial,
  onCreate,
  t,
}: {
  initial: { bg: string; card: string; accent: string }
  onCreate: (name: string, colors: ThemeColors) => void
  t: TFunc
}) => {
  const [name, setName] = useState('')
  const [colors, setColors] = useState<ThemeColors>({
    bg: initial.bg,
    blockColor: initial.card,
    accent: initial.accent,
  })

  const slots: { key: keyof ThemeColors; label: string }[] = [
    { key: 'bg', label: t('theme.slot.bg') },
    { key: 'blockColor', label: t('theme.slot.card') },
    { key: 'accent', label: t('theme.slot.accent') },
  ]

  return (
    <div className="tp-pop tp-creator">
      <input
        className="tp-name-input"
        placeholder={t('theme.defaultName')}
        maxLength={24}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCreate(name, colors) }}
      />
      <div className="tp-slots">
        {slots.map((s) => (
          <div className="tp-slot" key={s.key}>
            <span className="tp-slot-label">{s.label}</span>
            <button
              className="cin-swatch tp-swatch"
              style={{ background: colors[s.key] }}
              onClick={(e) =>
                openColorPicker({
                  anchor: e.currentTarget,
                  color: colors[s.key],
                  onChange: (hex) => setColors((c) => ({ ...c, [s.key]: hex })),
                })
              }
            />
          </div>
        ))}
      </div>
      <div className="tp-foot">
        <button className="tp-btn-rand" onClick={() => setColors(randomThemeColors())}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 4.6L19 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
          </svg>
          {t('theme.random')}
        </button>
        <button className="tp-btn-save" onClick={() => onCreate(name, colors)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
          </svg>
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}

const OptBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button className={`s-opt-btn ${active ? 'bta' : 'btg'}`} onClick={onClick}>
    {children}
  </button>
)

/** Boolean-ключи UiPrefs, управляющие элементами тайтлбара. */
type TbKey = 'titlebarLabel' | 'tbMin' | 'tbMax' | 'tbPin' | 'tbClose' | 'tbLogo' | 'tbVersion'

const tbIcon = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
  width: 15,
  height: 15,
}

/** Элементы тайтлбара в порядке отображения (как в макете). */
const TITLEBAR_ITEMS: { key: TbKey; labelKey: TranslationKey; icon: React.ReactNode }[] = [
  {
    key: 'titlebarLabel',
    labelKey: 'settings.interface.titlebar.item.label',
    icon: (
      <svg {...tbIcon} strokeWidth={2}>
        <path d="M5 19 L12 5 L19 19" /><path d="M8 14 H16" />
      </svg>
    ),
  },
  {
    key: 'tbMin',
    labelKey: 'settings.interface.titlebar.item.min',
    icon: (
      <svg {...tbIcon}>
        <path d="M4 9 V5 H8" /><path d="M20 9 V5 H16" /><path d="M4 15 V19 H8" /><path d="M20 15 V19 H16" />
      </svg>
    ),
  },
  {
    key: 'tbMax',
    labelKey: 'settings.interface.titlebar.item.max',
    icon: (
      <svg {...tbIcon}>
        <path d="M8 3 H5 V8" /><path d="M16 3 H19 V8" /><path d="M8 21 H5 V16" /><path d="M16 21 H19 V16" />
      </svg>
    ),
  },
  {
    key: 'tbPin',
    labelKey: 'settings.interface.titlebar.item.pin',
    icon: (
      <svg {...tbIcon}>
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
      </svg>
    ),
  },
  {
    key: 'tbClose',
    labelKey: 'settings.interface.titlebar.item.close',
    icon: (
      <svg {...tbIcon} strokeWidth={2}>
        <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    ),
  },
  {
    key: 'tbLogo',
    labelKey: 'settings.interface.titlebar.item.logo',
    icon: (
      <svg {...tbIcon}>
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    key: 'tbVersion',
    labelKey: 'settings.interface.titlebar.item.version',
    icon: (
      <svg {...tbIcon}>
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
]

const TbChip = ({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button className={`tb-chip${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
    <span className="tb-chip-ico">{icon}</span>
    <span className="tb-chip-lbl">{label}</span>
  </button>
)

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="tele-sw">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="tele-sw-track" />
  </label>
)
