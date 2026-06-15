import { useState } from 'react'
import { toast } from '@shared/ui'
import { useMediaLibStore } from '../model/mediaLibStore'
import { useCustomizationStore } from '../model/customizationStore'
import { usePresetsStore } from '../model/presetsStore'
import type { MediaItem } from '../lib/mediaIdb'

/**
 * Раздел «Кастомизация» (`ssec-medialib`) — медиа-библиотека картинок
 * + применение к 4 контекстам (Фон / Обложка / Визуализатор / Курсор) + пресеты.
 * Все 4 контекста рабочие; пресеты — снимок 4-х (presetsStore). Параметры фона
 * (blur/dim/обложка-как-фон) — в отдельном разделе «Фон» (BackgroundSection).
 */

type Ctx = 'bg' | 'cover' | 'viz' | 'cursor'

export const CustomizationSection = () => {
  const items = useMediaLibStore((s) => s.items)
  const addFiles = useMediaLibStore((s) => s.addFiles)
  const addUrl = useMediaLibStore((s) => s.addUrl)
  const removeItem = useMediaLibStore((s) => s.remove)

  const bgUrl = useCustomizationStore((s) => s.bgUrl)
  const cursorUrl = useCustomizationStore((s) => s.cursorUrl)
  const coverUrl = useCustomizationStore((s) => s.coverUrl)
  const vizUrl = useCustomizationStore((s) => s.vizUrl)
  const setBg = useCustomizationStore((s) => s.setBg)
  const setCover = useCustomizationStore((s) => s.setCover)
  const setViz = useCustomizationStore((s) => s.setViz)
  const setCursor = useCustomizationStore((s) => s.setCursor)

  const [urlVal, setUrlVal] = useState('')
  const [selCtx, setSelCtx] = useState<Ctx | null>(null)

  const applyToCtx = (ctx: Ctx, data: string) => {
    if (ctx === 'bg') {
      setBg(data)
      toast('Фон обновлён!')
    } else if (ctx === 'cover') {
      setCover(data)
      toast('Обложка обновлена!')
    } else if (ctx === 'viz') {
      setViz(data)
      toast('Визуализатор обновлён!')
    } else if (ctx === 'cursor') {
      setCursor(data)
      toast('Курсор обновлён!')
    }
  }
  const clearCtx = (ctx: Ctx) => {
    if (ctx === 'bg') {
      setBg(null)
      toast('Фон удалён')
    } else if (ctx === 'cover') {
      setCover(null)
      toast('Обложка сброшена')
    } else if (ctx === 'viz') {
      setViz(null)
      toast('Визуализатор удалён')
    } else if (ctx === 'cursor') {
      setCursor(null)
      toast('Курсор сброшен')
    }
  }

  const ctxLabel: Record<Ctx, string> = { bg: 'Фон', cover: 'Обложка', viz: 'Визуализатор', cursor: 'Курсор' }

  const onGalleryClick = (item: MediaItem) => {
    if (!selCtx) {
      toast('Выберите карточку (Фон/Обложка/Виз/Курсор), затем картинку')
      return
    }
    applyToCtx(selCtx, item.data)
  }

  const addUrlAndClear = () => {
    addUrl(urlVal)
    setUrlVal('')
  }

  const ctxCurrent: Record<Ctx, string | null> = { bg: bgUrl, cover: coverUrl, viz: vizUrl, cursor: cursorUrl }

  return (
    <div className="s-section active" id="ssec-medialib">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>{' '}
          Кастомизация
        </div>
      </div>

      {/* Добавить в библиотеку */}
      <div className="sc sc-keep">
        <h3>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ marginRight: 6, verticalAlign: 'middle', opacity: 0.7 }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Добавить в библиотеку
        </h3>
        <div className="sr">
          <div><div className="sl2">Фото или GIF</div><div className="ssub">поддерживаются HD/2K/4K</div></div>
          <label className="mlm-add-btn" style={{ cursor: 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Добавить
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div><div className="sl2">По ссылке</div><div className="ssub">вставьте URL изображения или GIF</div></div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <input
            type="text"
            placeholder="https://example.com/image.gif"
            maxLength={2048}
            value={urlVal}
            onChange={(e) => setUrlVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUrlAndClear()}
            style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'calc(var(--radius)*0.5)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12, padding: '6px 10px', outline: 'none' }}
          />
          <button className="mlm-add-btn" onClick={addUrlAndClear}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Добавить
          </button>
        </div>
      </div>

      {/* Текущие настройки — 4 контекста */}
      <div className="sc">
        <h3>Текущие настройки</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 8 }}>
          <CtxCard ctx="bg" label="Фон" current={ctxCurrent.bg} selected={selCtx === 'bg'} onSelect={() => setSelCtx('bg')} onClear={() => clearCtx('bg')} icon={<BgIcon />} />
          <CtxCard ctx="cover" label="Обложка" current={ctxCurrent.cover} selected={selCtx === 'cover'} onSelect={() => setSelCtx('cover')} onClear={() => clearCtx('cover')} icon={<CoverIcon />} />
          <CtxCard ctx="viz" label="Визуализатор" current={ctxCurrent.viz} selected={selCtx === 'viz'} onSelect={() => setSelCtx('viz')} onClear={() => clearCtx('viz')} icon={<VizIcon />} />
          <CtxCard ctx="cursor" label="Курсор" current={ctxCurrent.cursor} selected={selCtx === 'cursor'} onSelect={() => setSelCtx('cursor')} onClear={() => clearCtx('cursor')} icon={<CursorIcon />} />
        </div>
        <div className="ssub" style={{ marginTop: 10 }}>
          {selCtx
            ? `Выбрано: ${ctxLabel[selCtx]} — кликните картинку ниже, чтобы применить`
            : 'Выберите карточку (Фон / Обложка / Визуализатор / Курсор), затем картинку из библиотеки'}
        </div>
      </div>

      {/* Ваша библиотека (галерея) */}
      <div className="sc">
        <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ opacity: 0.7, flexShrink: 0 }}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
            Ваша библиотека
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'none', letterSpacing: 0 }}>{items.length} / 50</span>
        </h3>
        {items.length === 0 ? (
          <div className="ssub" style={{ padding: '20px 0', textAlign: 'center' }}>Библиотека пуста — добавьте фото или GIF выше</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 9, marginTop: 8 }}>
            {items.map((it) => (
              <div key={it.id} className="mlm-card" onClick={() => onGalleryClick(it)}>
                <img src={it.data} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.opacity = '0.2' }} />
                <button
                  className="mlm-card-del"
                  onClick={(e) => { e.stopPropagation(); removeItem(it.id) }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
                <div className="mlm-card-info">{it.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Пресеты */}
      <PresetsCard />
    </div>
  )
}

// ── Пресеты (снимок 4-х контекстов) ───────────────────────────────────────
const PresetsCard = () => {
  const presets = usePresetsStore((s) => s.presets)
  const savePreset = usePresetsStore((s) => s.savePreset)
  const applyPreset = usePresetsStore((s) => s.applyPreset)
  const deletePreset = usePresetsStore((s) => s.deletePreset)
  const [name, setName] = useState('')

  const onSave = () => {
    if (savePreset(name)) setName('')
  }

  return (
    <div className="sc">
      <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ opacity: 0.7, flexShrink: 0 }}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          Пресеты
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'none', letterSpacing: 0 }}>{presets.length} / 20</span>
      </h3>
      <div className="preset-save-row">
        <input
          className="preset-name-inp"
          type="text"
          placeholder="Название пресета..."
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
        />
        <button className="preset-save-btn" onClick={onSave}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>{' '}
          Сохранить
        </button>
      </div>
      {presets.length === 0 ? (
        <div className="presets-empty-box">Сохраните текущие настройки как пресет</div>
      ) : (
        <div className="presets-grid">
          {presets.map((p) => {
            const thumb = p.bg || p.cover || p.viz || p.cursor || ''
            const badges = [p.bg && 'Фон', p.cover && 'Обложка', p.viz && 'Визуал', p.cursor && 'Курсор'].filter(Boolean) as string[]
            return (
              <div key={p.id} className="preset-card" onClick={() => applyPreset(p.id)}>
                <div className="preset-thumb">
                  {thumb ? (
                    <img src={thumb} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <div className="preset-thumb-empty">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.3 }}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    </div>
                  )}
                </div>
                <div className="preset-badges">
                  {badges.map((b) => <span key={b} className="preset-badge">{b}</span>)}
                </div>
                <div className="preset-name">{p.name || 'Без названия'}</div>
                <button className="preset-del-btn" onClick={(e) => { e.stopPropagation(); deletePreset(p.id) }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Карточка контекста ────────────────────────────────────────────────────
const CtxCard = ({
  label,
  current,
  selected,
  disabled,
  onSelect,
  onClear,
  icon,
}: {
  ctx: Ctx
  label: string
  current: string | null
  selected?: boolean
  disabled?: boolean
  onSelect?: () => void
  onClear?: () => void
  icon: React.ReactNode
}) => (
  <div
    className={`mls-card${selected ? ' active' : ''}`}
    onClick={disabled ? undefined : onSelect}
    style={disabled ? { opacity: 0.45, cursor: 'default' } : undefined}
  >
    <div className="mls-card-preview">
      {current && <img src={current} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
      <div className="mls-card-icon-wrap">
        {icon}
        <span className="mls-icon-label">{label}</span>
        {!current && <span className="mls-icon-sub">{disabled ? 'Скоро' : 'Нажмите для выбора'}</span>}
      </div>
    </div>
    {current && !disabled && (
      <button className="mls-del-btn" style={{ opacity: 1 }} onClick={(e) => { e.stopPropagation(); onClear?.() }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    )}
  </div>
)

const BgIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
)
const CoverIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="9" x2="12" y2="3" /></svg>
)
const VizIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><polyline points="22 8 22 16" /><polyline points="18 10 18 14" /><polyline points="14 4 14 20" /><polyline points="10 8 10 16" /><polyline points="6 11 6 13" /><polyline points="2 10 2 14" /></svg>
)
const CursorIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M4 3l6.5 16 2-7 7-2L4 3z" /></svg>
)
