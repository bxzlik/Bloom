import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { usePopupOpenAnimation } from '@shared/hooks'
import { useMediaLibStore } from '../model/mediaLibStore'
import { useCustomizationStore } from '../model/customizationStore'
import { usePresetsStore, resolvePresetImg, type Preset } from '../model/presetsStore'
import type { MediaItem } from '../lib/mediaIdb'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Раздел «Кастомизация» (`ssec-medialib`) — медиа-библиотека картинок
 * + применение к 4 контекстам (Фон / Обложка / Визуализатор / Курсор) + пресеты.
 * Все 4 контекста рабочие; пресеты — снимок 4-х (presetsStore). Параметры фона
 * (blur/dim/обложка-как-фон) — в отдельном разделе «Фон» (BackgroundSection).
 */

type Ctx = 'bg' | 'cover' | 'viz' | 'cursor' | 'slider'

// ── Лёгкое контекстное меню (стиль `.ctx`/`.ci`) ───────────────────────────
interface CtxMenuItem {
  label: string
  icon: React.ReactNode
  danger?: boolean
  onClick: () => void
}
const CtxMenu = ({ pos, items, onClose }: { pos: { x: number; y: number } | null; items: CtxMenuItem[]; onClose: () => void }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [clamped, setClamped] = useState<{ x: number; y: number } | null>(null)
  usePopupOpenAnimation(ref, clamped)

  // Удерживаем меню в пределах окна.
  useLayoutEffect(() => {
    if (!pos || !ref.current) {
      setClamped(pos)
      return
    }
    const m = ref.current
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = pos.x
    let y = pos.y
    if (x + m.offsetWidth > vw - 8) x = vw - m.offsetWidth - 8
    if (y + m.offsetHeight > vh - 8) y = vh - m.offsetHeight - 8
    if (x < 8) x = 8
    if (y < 8) y = 8
    setClamped({ x, y })
  }, [pos])

  // Закрытие по клику вне / Escape.
  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [pos, onClose])

  if (!pos) return null
  const rp = clamped ?? pos
  return createPortal(
    <div ref={ref} className="ctx open" style={{ left: rp.x, top: rp.y, visibility: clamped ? 'visible' : 'hidden' }}>
      {items.map((it, i) => (
        <div key={i} className={`ci${it.danger ? ' red' : ''}`} onClick={() => { onClose(); it.onClick() }}>
          <span className="ci-icon">{it.icon}</span> {it.label}
        </div>
      ))}
    </div>,
    document.body,
  )
}

export const CustomizationSection = () => {
  const t = useT()
  const items = useMediaLibStore((s) => s.items)
  const addFiles = useMediaLibStore((s) => s.addFiles)
  const addUrl = useMediaLibStore((s) => s.addUrl)
  const removeItem = useMediaLibStore((s) => s.remove)

  const bgUrl = useCustomizationStore((s) => s.bgUrl)
  const cursorUrl = useCustomizationStore((s) => s.cursorUrl)
  const coverUrl = useCustomizationStore((s) => s.coverUrl)
  const vizUrl = useCustomizationStore((s) => s.vizUrl)
  const sliderUrl = useCustomizationStore((s) => s.sliderUrl)
  const setBg = useCustomizationStore((s) => s.setBg)
  const setCover = useCustomizationStore((s) => s.setCover)
  const setViz = useCustomizationStore((s) => s.setViz)
  const setCursor = useCustomizationStore((s) => s.setCursor)
  const setSlider = useCustomizationStore((s) => s.setSlider)

  const [urlVal, setUrlVal] = useState('')
  const [selCtx, setSelCtx] = useState<Ctx | null>(null)
  const [imgMenu, setImgMenu] = useState<{ pos: { x: number; y: number }; item: MediaItem } | null>(null)

  const applyToCtx = (ctx: Ctx, data: string) => {
    if (ctx === 'bg') {
      setBg(data)
      toast(t('settings.custom.toast.bgUpdated'))
    } else if (ctx === 'cover') {
      setCover(data)
      toast(t('settings.custom.toast.coverUpdated'))
    } else if (ctx === 'viz') {
      setViz(data)
      toast(t('settings.custom.toast.vizUpdated'))
    } else if (ctx === 'cursor') {
      setCursor(data)
      toast(t('settings.custom.toast.cursorUpdated'))
    } else if (ctx === 'slider') {
      setSlider(data)
      toast(t('settings.custom.toast.sliderUpdated'))
    }
  }
  const clearCtx = (ctx: Ctx) => {
    if (ctx === 'bg') {
      setBg(null)
      toast(t('settings.custom.toast.bgRemoved'))
    } else if (ctx === 'cover') {
      setCover(null)
      toast(t('settings.custom.toast.coverReset'))
    } else if (ctx === 'viz') {
      setViz(null)
      toast(t('settings.custom.toast.vizRemoved'))
    } else if (ctx === 'cursor') {
      setCursor(null)
      toast(t('settings.custom.toast.cursorReset'))
    } else if (ctx === 'slider') {
      setSlider(null)
      toast(t('settings.custom.toast.sliderRemoved'))
    }
  }

  const onGalleryClick = (item: MediaItem) => {
    if (!selCtx) {
      toast(t('settings.custom.toast.selectCard'))
      return
    }
    applyToCtx(selCtx, item.data)
  }

  const addUrlAndClear = () => {
    addUrl(urlVal)
    setUrlVal('')
  }

  const ctxCurrent: Record<Ctx, string | null> = { bg: bgUrl, cover: coverUrl, viz: vizUrl, cursor: cursorUrl, slider: sliderUrl }

  return (
    <div className="s-section active" id="ssec-medialib">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="album" width={15} height={15} />{' '}
          {t('settings.nav.customization')}
        </div>
      </div>

      {/* Контексты (4 вкладки) — без обёртки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        <CtxCard ctx="bg" label={t('settings.custom.ctx.bg')} current={ctxCurrent.bg} selected={selCtx === 'bg'} onSelect={() => setSelCtx('bg')} onClear={() => clearCtx('bg')} icon={<BgIcon />} />
        <CtxCard ctx="cover" label={t('settings.custom.ctx.cover')} current={ctxCurrent.cover} selected={selCtx === 'cover'} onSelect={() => setSelCtx('cover')} onClear={() => clearCtx('cover')} icon={<CoverIcon />} />
        <CtxCard ctx="viz" label={t('settings.custom.ctx.viz')} current={ctxCurrent.viz} selected={selCtx === 'viz'} onSelect={() => setSelCtx('viz')} onClear={() => clearCtx('viz')} icon={<VizIcon />} />
        <CtxCard ctx="cursor" label={t('settings.custom.ctx.cursor')} current={ctxCurrent.cursor} selected={selCtx === 'cursor'} onSelect={() => setSelCtx('cursor')} onClear={() => clearCtx('cursor')} icon={<CursorIcon />} />
        <CtxCard ctx="slider" label={t('settings.custom.ctx.slider')} current={ctxCurrent.slider} selected={selCtx === 'slider'} onSelect={() => setSelCtx('slider')} onClear={() => clearCtx('slider')} icon={<SliderIcon />} />
      </div>

      {/* Ваша библиотека (галерея) */}
      <div className="s-cat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {t('settings.custom.library')}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0, maxWidth: 360, marginLeft: 'auto' }}>
          <input
            type="text"
            placeholder="https://example.com/image.gif"
            maxLength={2048}
            value={urlVal}
            onChange={(e) => setUrlVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUrlAndClear()}
            style={{ flex: 1, minWidth: 0, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'calc(var(--radius)*0.5)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 400, textTransform: 'none', letterSpacing: 0, padding: '7px 10px', outline: 'none' }}
          />
          {urlVal.trim() ? (
            <button className="mlm-icon-btn" onClick={addUrlAndClear}>
              <Ico name="check" width={15} height={15} />
            </button>
          ) : (
            <label className="mlm-icon-btn" style={{ cursor: 'pointer' }}>
              <Ico name="gallery" width={15} height={15} />
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
          )}
        </div>
      </div>
      <div className="sc">
        {items.length === 0 ? (
          <div className="ssub" style={{ padding: '20px 0', textAlign: 'center' }}>{t('settings.custom.library.empty')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 9, marginTop: 8 }}>
            {items.map((it) => (
              <div
                key={it.id}
                className="mlm-card"
                onClick={() => onGalleryClick(it)}
                onContextMenu={(e) => { e.preventDefault(); setImgMenu({ pos: { x: e.clientX, y: e.clientY }, item: it }) }}
              >
                <img src={it.data} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.opacity = '0.2' }} />
                <button
                  className="mlm-card-del"
                  onClick={(e) => { e.stopPropagation(); removeItem(it.id) }}
                >
                  <Ico name="close" width={11} height={11} />
                </button>
                <div className="mlm-card-info">{it.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Пресеты */}
      <PresetsCard />

      {/* Контекстное меню фото */}
      <CtxMenu
        pos={imgMenu?.pos ?? null}
        onClose={() => setImgMenu(null)}
        items={imgMenu ? [
          { label: t('settings.custom.ctxmenu.delete'), icon: <Ico name="trash" width={13} height={13} />, danger: true, onClick: () => removeItem(imgMenu.item.id) },
        ] : []}
      />
    </div>
  )
}

// ── Пресеты (снимок 4-х контекстов) ───────────────────────────────────────
const PresetsCard = () => {
  const t = useT()
  const presets = usePresetsStore((s) => s.presets)
  const savePreset = usePresetsStore((s) => s.savePreset)
  const applyPreset = usePresetsStore((s) => s.applyPreset)
  const deletePreset = usePresetsStore((s) => s.deletePreset)
  const exportPresets = usePresetsStore((s) => s.exportPresets)
  const exportPreset = usePresetsStore((s) => s.exportPreset)
  const importPresets = usePresetsStore((s) => s.importPresets)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [menu, setMenu] = useState<{ pos: { x: number; y: number }; id: string } | null>(null)

  const onSave = () => {
    if (savePreset(name)) {
      setName('')
      setAdding(false)
    }
  }
  const cancelAdd = () => {
    setAdding(false)
    setName('')
  }

  return (
    <>
      <div className="s-cat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {t('settings.custom.presets')}
        </span>
        {adding ? (
          <button className="mlm-icon-btn" onClick={cancelAdd}>
            <Ico name="close" width={14} height={14} />
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="mlm-icon-btn" onClick={() => void importPresets()}>
              <Ico name="import" width={14} height={14} />
            </button>
            <button className="mlm-icon-btn" onClick={() => void exportPresets()}>
              <Ico name="export" width={14} height={14} />
            </button>
            <button className="mlm-icon-btn" onClick={() => setAdding(true)}>
              <Ico name="add" width={14} height={14} />
            </button>
          </div>
        )}
      </div>
      <div className="sc">
      {adding ? (
        <div className="presets-empty-box" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '26px 20px' }}>
          <input
            className="preset-name-inp"
            type="text"
            placeholder={t('settings.custom.presets.namePlaceholder')}
            maxLength={40}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); else if (e.key === 'Escape') cancelAdd() }}
            style={{ maxWidth: 360 }}
          />
          <button className="mlm-icon-btn" onClick={onSave}>
            <Ico name="check" width={15} height={15} />
          </button>
        </div>
      ) : presets.length === 0 ? (
        <div className="presets-empty-box">{t('settings.custom.presets.empty')}</div>
      ) : (
        <div className="presets-grid">
          {presets.map((p) => {
            const badges = [p.bg && t('settings.custom.badge.bg'), p.cover && t('settings.custom.badge.cover'), p.viz && t('settings.custom.badge.viz'), p.cursor && t('settings.custom.badge.cursor'), p.slider && t('settings.custom.badge.slider')].filter(Boolean) as string[]
            return (
              <div
                key={p.id}
                className="preset-card"
                onClick={() => applyPreset(p.id)}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ pos: { x: e.clientX, y: e.clientY }, id: p.id }) }}
              >
                <PresetThumb p={p} />
                <div className="preset-badges">
                  {badges.map((b) => <span key={b} className="preset-badge">{b}</span>)}
                </div>
                <div className="preset-name">{p.name || t('settings.custom.presets.untitled')}</div>
                <button className="preset-del-btn" onClick={(e) => { e.stopPropagation(); deletePreset(p.id) }}>
                  <Ico name="close" width={9} height={9} />
                </button>
              </div>
            )
          })}
        </div>
      )}
      </div>

      {/* Контекстное меню пресета */}
      <CtxMenu
        pos={menu?.pos ?? null}
        onClose={() => setMenu(null)}
        items={menu ? [
          { label: t('settings.custom.ctxmenu.export'), icon: <Ico name="export" width={13} height={13} />, onClick: () => void exportPreset(menu.id) },
          { label: t('settings.custom.ctxmenu.delete'), icon: <Ico name="trash" width={13} height={13} />, danger: true, onClick: () => deletePreset(menu.id) },
        ] : []}
      />
    </>
  )
}

// ── Превью пресета (карусель) ──────────────────────────────────────────────
// Все картинки пресета листаются авто-сменой (как страницы превью обновы);
// точки внизу — ручное переключение. Одна картинка — без точек, ноль — заглушка.
const PresetThumb = ({ p }: { p: Preset }) => {
  const items = useMediaLibStore((s) => s.items)
  // Поля пресета — id библиотеки; резолвим в данные картинок (инлайн — как есть).
  const imgs = [p.bg, p.cover, p.viz, p.slider, p.cursor]
    .map((f) => resolvePresetImg(f, items))
    .filter((x): x is string => !!x)
  const n = imgs.length
  const [i, setI] = useState(0)

  // Авто-смена страниц (только если их больше одной).
  useEffect(() => {
    if (n <= 1) return
    const id = setInterval(() => setI((v) => (v + 1) % n), 2200)
    return () => clearInterval(id)
  }, [n])

  if (n === 0) {
    return (
      <div className="preset-thumb">
        <div className="preset-thumb-empty">
          <Ico name="gallery" width={18} height={18} style={{ opacity: 0.3 }} />
        </div>
      </div>
    )
  }
  const idx = i % n
  return (
    <div className="preset-thumb">
      {imgs.map((src, k) => (
        <img
          key={k}
          className={`preset-thumb-slide${k === idx ? ' on' : ''}`}
          src={src}
          alt=""
          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
        />
      ))}
      {n > 1 && (
        <div className="preset-thumb-dots" onClick={(e) => e.stopPropagation()}>
          {imgs.map((_, k) => (
            <button
              key={k}
              className={`preset-thumb-dot${k === idx ? ' on' : ''}`}
              aria-label={`${k + 1}`}
              onClick={(e) => { e.stopPropagation(); setI(k) }}
            />
          ))}
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
}) => {
  const t = useT()
  return (
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
        {!current && <span className="mls-icon-sub">{disabled ? t('settings.custom.ctx.soon') : t('settings.custom.ctx.tap')}</span>}
      </div>
    </div>
    {current && !disabled && (
      <button className="mls-del-btn" style={{ opacity: 1 }} onClick={(e) => { e.stopPropagation(); onClear?.() }}>
        <Ico name="close" width={10} height={10} />
      </button>
    )}
  </div>
  )
}

const BgIcon = () => <Ico name="galleryWide" width={24} height={24} />
const CoverIcon = () => <Ico name="gallery" width={24} height={24} />
const VizIcon = () => <Ico name="wave" width={24} height={24} />
const CursorIcon = () => <Ico name="cursor" width={24} height={24} />
const SliderIcon = () => <Ico name="slider" width={24} height={24} />
