import { useEffect, useState } from 'react'
import { useThemeStore, THEME_PRESETS, type ThemePreset } from '../../model/themeStore'
import { useUiPrefsStore } from '../../model/uiPrefsStore'
import { useTransparencyStore } from '../../model/transparencyStore'
import { openColorPicker } from '../../model/colorPickerStore'
import { toast } from '@shared/ui'
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

export const InterfaceSection = () => {
  const bg = useThemeStore((s) => s.bg)
  const blockColor = useThemeStore((s) => s.blockColor)
  const accent = useThemeStore((s) => s.accent)
  const setBg = useThemeStore((s) => s.setBg)
  const setBlockColor = useThemeStore((s) => s.setBlockColor)
  const setAccent = useThemeStore((s) => s.setAccent)
  const fontFamily = useThemeStore((s) => s.fontFamily)
  const setFontFamily = useThemeStore((s) => s.setFontFamily)
  const radius = useThemeStore((s) => s.radius)
  const setRadius = useThemeStore((s) => s.setRadius)
  const autoAccent = useThemeStore((s) => s.autoAccent)
  const setAutoAccent = useThemeStore((s) => s.setAutoAccent)
  const customThemes = useThemeStore((s) => s.customThemes)
  const activeThemeId = useThemeStore((s) => s.activeThemeId)
  const applyTheme = useThemeStore((s) => s.applyTheme)
  const saveAsPreset = useThemeStore((s) => s.saveAsPreset)
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
          Интерфейс
        </div>
        <button className="s-section-reset" onClick={() => p.reset()}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>{' '}
          Сбросить
        </button>
      </div>

      <div className="s-cat-label">ТЕМЫ</div>
      <div className="sc">
        <h3>Темы оформления</h3>
        <ThemeSaveRow onSave={(name) => { saveAsPreset(name); toast(`Пресет «${name.trim() || 'Мой пресет'}» сохранён`) }} />
        <ThemeGrid
          customThemes={customThemes}
          activeId={activeThemeId}
          onApply={applyTheme}
          onDelete={(id) => { deleteCustomTheme(id); toast('Пресет удалён') }}
        />
      </div>

      <div className="sc">
        <h3>Акцентный цвет</h3>
        <Swatch label="Акцент" sub="Активные кнопки, прогресс, выделение" color={accent} onChange={setAccent} disabled={autoAccent} />
        <div className="sr">
          <div>
            <div className="sl2">Авто акцент</div>
            <div className="ssub">цвет из обложки трека</div>
          </div>
          <Toggle checked={autoAccent} onChange={setAutoAccent} />
        </div>
      </div>
      <div className="sc">
        <h3>Фоновые цвета</h3>
        <Swatch label="Цвет блоков" sub="Библиотека, плеер, очередь (var(--block-color))" color={blockColor} onChange={setBlockColor} />
        <Swatch label="Фон приложения" sub="Фон страницы и сайдбара (var(--bg))" color={bg} onChange={setBg} />
      </div>

      <div className="s-cat-label">РАСПОЛОЖЕНИЕ</div>
      <div className="sc sc-keep">
        <div className="sc-title">Расположение сайдбара</div>
        <div className="sc-desc">Где отображается панель навигации</div>
        <div className="s-opt-row">
          <OptBtn active={p.sidebarPos === 'left'} onClick={() => p.set('sidebarPos', 'left')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="11" y="3" width="10" height="18" rx="1" /></svg>
            Слева
          </OptBtn>
          <OptBtn active={p.sidebarPos === 'top'} onClick={() => p.set('sidebarPos', 'top')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="5" rx="1" /><rect x="3" y="11" width="18" height="10" rx="1" /></svg>
            Сверху
          </OptBtn>
          <OptBtn active={p.sidebarPos === 'right'} onClick={() => p.set('sidebarPos', 'right')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="16" y="3" width="5" height="18" rx="1" /><rect x="3" y="3" width="10" height="18" rx="1" /></svg>
            Справа
          </OptBtn>
        </div>
        <div className="s-opt-row" style={{ marginTop: 8 }}>
          <OptBtn active={!p.sidebarCompact} onClick={() => p.set('sidebarCompact', false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="4" y="7" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="11" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="15" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /></svg>
            Обычный
          </OptBtn>
          <OptBtn active={p.sidebarCompact} onClick={() => p.set('sidebarCompact', true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="4" y="6" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="10" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /><rect x="4" y="14" width="3" height="2" rx=".5" fill="currentColor" stroke="none" /></svg>
            Компактный
          </OptBtn>
        </div>
        <div className="sr" style={{ marginTop: 8 }}>
          <div>
            <div className="sl2">Разделители в компактном режиме</div>
            <div className="ssub">Слабые линии между группами иконок</div>
          </div>
          <Toggle checked={p.sbSep} onChange={(v) => p.set('sbSep', v)} />
        </div>
      </div>

      <div className="sc sc-keep">
        <div className="sc-title">Вид библиотеки</div>
        <div className="sc-desc">Отображение плейлистов, папок и исполнителей</div>
        <div className="s-opt-row">
          <OptBtn active={p.libView === 'list'} onClick={() => p.set('libView', 'list')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" /></svg>
            Список
          </OptBtn>
          <OptBtn active={p.libView === 'grid'} onClick={() => p.set('libView', 'grid')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            Сетка
          </OptBtn>
        </div>
      </div>

      <div className="sc sc-keep">
        <div className="sc-title">Системные разделы</div>
        <div className="sc-desc">Стиль карточек Все треки, Любимые, История в сайдбаре</div>
        <div className="s-opt-row">
          <OptBtn active={p.libSysStyle === 'accent'} onClick={() => p.set('libSysStyle', 'accent')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none" /><path d="M3 17l5-5 4 4 3-3 6 4" /></svg>
            Акцент
          </OptBtn>
          <OptBtn active={p.libSysStyle === 'classic'} onClick={() => p.set('libSysStyle', 'classic')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="14" y2="13" /></svg>
            Классика
          </OptBtn>
        </div>
      </div>

      <div className="s-cat-label">МАСШТАБИРОВАНИЕ</div>
      <ZoomCard title="Полноэкранный" value={p.fullZoom} onChange={(v) => p.set('fullZoom', v)} />
      <ZoomCard title="Оконный" value={p.winZoom} onChange={(v) => p.set('winZoom', v)} />

      <div className="s-cat-label">ШРИФТ</div>
      <div className="sc">
        <div className="sc-title">Шрифт интерфейса</div>
        <div className="sc-desc">Выберите шрифт для всего приложения</div>
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

      <div className="s-cat-label">ИНТЕРФЕЙС</div>
      <div className="sc">
        <div className="sc-title">Скругление углов</div>
        <div className="sc-desc">Форма углов блоков интерфейса</div>
        <div className="s-opt-row" style={{ marginTop: 12 }}>
          <OptBtn active={radius === 0} onClick={() => setRadius(0)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" /></svg>
            Нет
          </OptBtn>
          <OptBtn active={radius === 6} onClick={() => setRadius(6)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="3" /></svg>
            Маленькое
          </OptBtn>
          <OptBtn active={radius === 14} onClick={() => setRadius(14)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="7" /></svg>
            Среднее
          </OptBtn>
          <OptBtn active={radius === 24} onClick={() => setRadius(24)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="12" /></svg>
            Большое
          </OptBtn>
        </div>
      </div>
      <div className="sc">
        <div className="sc-title">Рамки интерфейса</div>
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

      <div className="s-cat-label">НАВИГАЦИЯ</div>
      <div className="sc">
        <div className="sc-title">Кнопки навигации</div>
        <div className="sc-desc">Управляйте видимостью кнопок в панели</div>
        <div className="sr">
          <div>
            <div className="sl2">Всплывающий мини-плеер</div>
            <div className="ssub">Показывать кнопку мини-плеера в панели</div>
          </div>
          <Toggle checked={p.navFloatBtn} onChange={(v) => p.set('navFloatBtn', v)} />
        </div>
        <div className="sr">
          <div>
            <div className="sl2">Индикатор активной страницы</div>
            <div className="ssub">Полоска рядом с активной иконкой</div>
          </div>
          <Toggle checked={p.navIndicator} onChange={(v) => p.set('navIndicator', v)} />
        </div>
      </div>

      <div className="s-cat-label">ТАЙТЛБАР</div>
      <div className="sc">
        <div className="sc-title">Отображать на панели</div>
        <div className="sc-desc">Выберите элементы для отображения на панели</div>
        <div className="tb-chip-grid">
          {TITLEBAR_ITEMS.map((it) => (
            <TbChip
              key={it.key}
              active={!!p[it.key]}
              icon={it.icon}
              label={it.label}
              onClick={() => p.set(it.key, !p[it.key])}
            />
          ))}
        </div>
      </div>

      <div className="s-cat-label">ПРОЗРАЧНОСТЬ</div>
      <div className="sc">
        <div className="sc-title">Прозрачность</div>
        <div className="sc-desc">Прозрачность и стекло для блоков интерфейса</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className={`s-mode-btn${trMode === 'off' ? ' active' : ''}`} onClick={() => setTrMode('off')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            Выкл
          </button>
          <button className={`s-mode-btn${trMode === 'on' ? ' active' : ''}`} onClick={() => setTrMode('on')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M9 21V9" /></svg>
            Прозрачность
          </button>
        </div>
        <div className={`${trMode === 'on' ? 'vis' : ''}`} id="sTrSliders">
          <div className="s-sliders-3" style={{ marginTop: 14 }}>
            <GlassSlider label="Прозрачность блоков" valLabel={`${blockOpacity}%`} min={0} max={100} value={blockOpacity} onChange={setBlockOpacity} />
            <GlassSlider label="Яркость стекла" valLabel={`${glassStr}%`} min={0} max={100} value={glassStr} onChange={setGlassStr} />
            <GlassSlider label="Размытие стекла" valLabel={`${glassBlur}px`} min={0} max={40} value={glassBlur} onChange={setGlassBlur} />
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

const ThemeSaveRow = ({ onSave }: { onSave: (name: string) => void }) => {
  const [name, setName] = useState('')
  const save = () => {
    onSave(name)
    setName('')
  }
  return (
    <div className="theme-save-row">
      <input
        className="theme-save-input"
        placeholder="Название пресета..."
        maxLength={24}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          }
        }}
      />
      <button className="theme-save-btn" onClick={save}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ marginRight: 4 }}>
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Сохранить
      </button>
    </div>
  )
}

const ThemeGrid = ({
  customThemes,
  activeId,
  onApply,
  onDelete,
}: {
  customThemes: ThemePreset[]
  activeId: string
  onApply: (id: string) => void
  onDelete: (id: string) => void
}) => (
  <div id="themeGrid">
    <div className="theme-section-label">Встроенные</div>
    <div className="theme-grid">
      {THEME_PRESETS.map((t) => (
        <ThemeCard key={t.id} t={t} active={t.id === activeId} onApply={onApply} onDelete={onDelete} />
      ))}
    </div>
    {customThemes.length > 0 && (
      <>
        <div className="theme-section-label" style={{ marginTop: 14 }}>Мои пресеты</div>
        <div className="theme-grid">
          {customThemes.map((t) => (
            <ThemeCard key={t.id} t={t} active={t.id === activeId} onApply={onApply} onDelete={onDelete} />
          ))}
        </div>
      </>
    )}
  </div>
)

const ThemeCard = ({
  t,
  active,
  onApply,
  onDelete,
}: {
  t: ThemePreset
  active: boolean
  onApply: (id: string) => void
  onDelete: (id: string) => void
}) => {
  // _themeCardHtml: светлая тема → тёмный текст имени.
  const isLight = t.preview.bg.startsWith('#f') || t.preview.bg.startsWith('#e') || t.preview.bg === '#ffffff'
  const textColor = isLight ? '#444' : '#ccc'
  return (
    <div className={`theme-card${active ? ' active' : ''}`} onClick={() => onApply(t.id)}>
      {t.custom && (
        <button
          className="theme-card-del"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(t.id)
          }}
        >
          ✕
        </button>
      )}
      <div className="theme-card-preview" style={{ background: t.preview.bg }}>
        <div className="theme-card-bar" style={{ background: t.preview.card }} />
        <div className="theme-card-bar" style={{ background: t.preview.card }} />
        <div className="theme-card-bar" style={{ background: t.preview.card }} />
        <div className="theme-card-dot" style={{ background: t.preview.accent }} />
      </div>
      <div className="theme-card-footer" style={{ background: t.preview.bg }}>
        <div className="theme-card-swatches">
          <div className="theme-card-swatch" style={{ background: t.preview.bg, border: '1px solid rgba(128,128,128,.3)' }} />
          <div className="theme-card-swatch" style={{ background: t.preview.card, border: '1px solid rgba(128,128,128,.2)' }} />
          <div className="theme-card-swatch" style={{ background: t.preview.accent }} />
        </div>
        <div className="theme-card-name" style={{ color: active ? t.preview.accent : textColor }}>{t.name}</div>
        {active && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={t.preview.accent} strokeWidth={3} strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
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
const TITLEBAR_ITEMS: { key: TbKey; label: string; icon: React.ReactNode }[] = [
  {
    key: 'titlebarLabel',
    label: 'Название вкладки',
    icon: (
      <svg {...tbIcon} strokeWidth={2}>
        <path d="M5 19 L12 5 L19 19" /><path d="M8 14 H16" />
      </svg>
    ),
  },
  {
    key: 'tbMin',
    label: 'Свернуть',
    icon: (
      <svg {...tbIcon}>
        <path d="M4 9 V5 H8" /><path d="M20 9 V5 H16" /><path d="M4 15 V19 H8" /><path d="M20 15 V19 H16" />
      </svg>
    ),
  },
  {
    key: 'tbMax',
    label: 'Развернуть',
    icon: (
      <svg {...tbIcon}>
        <path d="M8 3 H5 V8" /><path d="M16 3 H19 V8" /><path d="M8 21 H5 V16" /><path d="M16 21 H19 V16" />
      </svg>
    ),
  },
  {
    key: 'tbPin',
    label: 'Закрепить',
    icon: (
      <svg {...tbIcon}>
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
      </svg>
    ),
  },
  {
    key: 'tbClose',
    label: 'Закрыть',
    icon: (
      <svg {...tbIcon} strokeWidth={2}>
        <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    ),
  },
  {
    key: 'tbLogo',
    label: 'Логотип',
    icon: (
      <svg {...tbIcon}>
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    key: 'tbVersion',
    label: 'Версия',
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

const Swatch = ({ label, sub, color, onChange, disabled }: { label: string; sub?: string; color: string; onChange: (hex: string) => void; disabled?: boolean }) => {
  return (
    <div className="sr">
      <div>
        <div className="sl2">{label}</div>
        {sub && <div className="ssub">{sub}</div>}
      </div>
      <button
        className="cin-swatch"
        style={{ background: color, opacity: disabled ? 0.35 : 1, pointerEvents: disabled ? 'none' : undefined }}
        onClick={(e) => openColorPicker({ anchor: e.currentTarget, color, onChange })}
      />
    </div>
  )
}
