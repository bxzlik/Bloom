import { RowReset, SectionReset } from '@features/settings/ui/controls/SectionReset'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '@shared/ui'
import { useT, type TranslationKey } from '@shared/i18n'
import { usePopupOpenAnimation } from '@shared/hooks'
import { useMediaLibStore } from '../model/mediaLibStore'
import { useCustomizationStore } from '../model/customizationStore'
import { usePresetsStore, resolvePresetImg, type Preset } from '../model/presetsStore'
import { BackgroundSliders } from './BackgroundSliders'
import type { MediaItem } from '../lib/mediaIdb'
import { Ico } from '@shared/ui/icons/solar'
// Глубокий путь (не barrel @features/player) — избегаем цикла с player/ui.
import { downloadImageFile } from '@features/player/lib/download'

/**
 * Раздел «Кастомизация» (`ssec-medialib`), одна страница сверху вниз:
 *
 * - плашки 5 контекстов (Фон / Обложка / Визуализатор / Курсор / Слайдер) —
 *   картинка ставится перетаскиванием из библиотеки, клик снимает;
 * - сегмент «Библиотека / Пресеты» с общей сеткой карточек (presetsStore);
 * - за разделительной полосой — параметры фонового слоя (BackgroundSliders).
 *
 * Вкладки `.s-ptabs` («Кастомизация»/«Фон») убраны: фон больше не отдельная
 * вкладка. Тоггл «обложка трека как фон» переехал в раздел «Интерфейс».
 */

type Ctx = 'bg' | 'cover' | 'viz' | 'cursor' | 'slider'

/** Панель под сегментом: медиа-библиотека или пресеты. */
type Pane = 'lib' | 'presets'

/** Длительность схлопывания строки добавления — держим в паре с `cz-addrow-out`. */
const ADD_ROW_EXIT_MS = 260

/** Плашки контекстов слева направо. */
const CTXS: { id: Ctx; labelKey: TranslationKey; icon: React.ReactNode }[] = [
  { id: 'bg', labelKey: 'settings.custom.ctx.bg', icon: <Ico name="galleryWide" width={24} height={24} /> },
  { id: 'cover', labelKey: 'settings.custom.ctx.cover', icon: <Ico name="gallery" width={24} height={24} /> },
  { id: 'viz', labelKey: 'settings.custom.ctx.viz', icon: <Ico name="wave" width={24} height={24} /> },
  { id: 'cursor', labelKey: 'settings.custom.ctx.cursor', icon: <Ico name="cursor" width={24} height={24} /> },
  { id: 'slider', labelKey: 'settings.custom.ctx.slider', icon: <Ico name="slider" width={24} height={24} /> },
]

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
  const resetBg = useCustomizationStore((s) => s.resetBg)

  return (
    <div className="s-section active" id="ssec-medialib">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="album" width={15} height={15} />{' '}
          {t('settings.nav.customization')}
        </div>
        {/* Сброс относится к параметрам фона (resetBg): картинки библиотеки
            удаляются поштучно, сбрасывать там нечего. */}
      </div>
      <SectionReset onReset={resetBg} />

      <MediaCards />
    </div>
  )
}

/** Содержимое раздела: контексты, галерея/пресеты, параметры фона. */
const MediaCards = () => {
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
  const coverMode = useCustomizationStore((s) => s.coverMode)
  const setCoverMode = useCustomizationStore((s) => s.setCoverMode)
  const coverAsBg = useCustomizationStore((s) => s.coverAsBg)

  const [urlVal, setUrlVal] = useState('')
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

  const addUrlAndClear = () => {
    addUrl(urlVal)
    setUrlVal('')
  }

  // ── Перетаскивание картинки на плашку контекста ───────────────────────
  // Нативный HTML5 drag'n'drop в этом окне не работает: у главного окна
  // включён `dragDropEnabled` (нужен для приёма аудиофайлов из проводника,
  // см. LibPage), а на Windows он вешает на webview OLE-drop-target и глушит
  // внутристраничные dragover/drop. Поэтому drag свой, на pointer events —
  // как в useSortable.
  const [drag, setDrag] = useState<{ item: MediaItem; x: number; y: number } | null>(null)
  const [overCtx, setOverCtx] = useState<Ctx | null>(null)

  /** Плашка под точкой (превью-призрак прозрачен для хит-теста). */
  const ctxUnder = (x: number, y: number): Ctx | null => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('.mls-card')
    const id = (el as HTMLElement | null)?.dataset.ctx
    return (id as Ctx | undefined) ?? null
  }

  const onCardPointerDown = (e: React.PointerEvent, it: MediaItem) => {
    if (e.button !== 0) return
    // Кнопки на карточке (скачать/удалить) — не ручки перетаскивания.
    if ((e.target as HTMLElement).closest('.cz-card-acts')) return
    e.preventDefault() // гасим нативный drag картинки и выделение текста
    const sx = e.clientX
    const sy = e.clientY
    let active = false
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
        active = true
      }
      setDrag({ item: it, x: ev.clientX, y: ev.clientY })
      setOverCtx(ctxUnder(ev.clientX, ev.clientY))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (active) {
        const target = ctxUnder(ev.clientX, ev.clientY)
        if (target) applyToCtx(target, it.data)
      }
      setDrag(null)
      setOverCtx(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const ctxCurrent: Record<Ctx, string | null> = { bg: bgUrl, cover: coverUrl, viz: vizUrl, cursor: cursorUrl, slider: sliderUrl }

  // Что показывать в блоке настроек под сеткой.
  const showCoverMode = !!coverUrl
  const showBgOpts = !!bgUrl || coverAsBg

  // ── Пресеты (живут в той же панели — второй таб) ──────────────────────
  const presets = usePresetsStore((s) => s.presets)
  const savePreset = usePresetsStore((s) => s.savePreset)
  const applyPreset = usePresetsStore((s) => s.applyPreset)
  const deletePreset = usePresetsStore((s) => s.deletePreset)
  const exportPreset = usePresetsStore((s) => s.exportPreset)
  const importPresets = usePresetsStore((s) => s.importPresets)

  const [pane, setPane] = useState<Pane>('lib')
  /** Куда переключились: 1 — вправо (к «Пресетам»), -1 — влево. */
  const [paneDir, setPaneDir] = useState<1 | -1>(1)
  const [adding, setAdding] = useState(false)
  const [closing, setClosing] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetMenu, setPresetMenu] = useState<{ pos: { x: number; y: number }; id: string } | null>(null)

  // Строка добавления живёт ещё ~200мс после закрытия — доигрывает анимацию
  // схлопывания. Поля чистим по её окончании, чтобы текст не пропадал раньше.
  const openAdd = () => {
    setClosing(false)
    setAdding(true)
  }
  const cancelAdd = () => {
    if (!adding) return
    setAdding(false)
    setClosing(true)
  }
  useEffect(() => {
    if (!closing) return
    const id = setTimeout(() => {
      setClosing(false)
      setUrlVal('')
      setPresetName('')
    }, ADD_ROW_EXIT_MS)
    return () => clearTimeout(id)
  }, [closing])

  const switchPane = (p: Pane) => {
    if (p === pane) return
    // Смена вкладки закрывает строку без анимации: у другой вкладки в ней
    // другое поле, доигрывать старое бессмысленно.
    setAdding(false)
    setClosing(false)
    setUrlVal('')
    setPresetName('')
    setPaneDir(p === 'presets' ? 1 : -1)
    setPane(p)
  }
  const onSavePreset = () => {
    if (savePreset(presetName)) cancelAdd()
  }

  return (
    <>
      {/* Контексты — плашки без бордера и подписей (одна иконка).
          Картинка ставится только перетаскиванием, клик — снимает её. */}
      <div className="cz-chips">
        {CTXS.map(({ id, labelKey, icon }) => (
          <CtxCard
            key={id}
            ctx={id}
            label={t(labelKey)}
            current={ctxCurrent[id]}
            dropOver={overCtx === id}
            onClear={() => clearCtx(id)}
            icon={icon}
          />
        ))}
      </div>

      {/* Сегмент «Библиотека / Пресеты» + инструменты справа */}
      <div className="cz-bar">
        <div className="cz-seg">
          <button className={`cz-seg-btn${pane === 'lib' ? ' active' : ''}`} onClick={() => switchPane('lib')}>
            {t('settings.custom.library')}
          </button>
          <button className={`cz-seg-btn${pane === 'presets' ? ' active' : ''}`} onClick={() => switchPane('presets')}>
            {t('settings.custom.presets')}
          </button>
        </div>
        <div className="cz-tools">
          {/* Первая кнопка не зависит от режима добавления; «+» превращается в «✕». */}
          {pane === 'lib' ? (
            <label className="cz-tool" aria-label={t('settings.custom.addFiles')}>
              <Ico name="export" width={16} height={16} />
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
          ) : (
            <button className="cz-tool" aria-label={t('settings.custom.presets.import')} onClick={() => void importPresets()}>
              <Ico name="import" width={16} height={16} />
            </button>
          )}
          {/* «+» — переключатель строки добавления; в открытом состоянии
              доворачивается на 45° и читается как крестик. */}
          <button
            className={`cz-tool cz-tool-plus${adding ? ' is-close' : ''}`}
            aria-label={
              adding
                ? t('settings.custom.presets.cancel')
                : pane === 'lib'
                  ? t('settings.custom.addUrl')
                  : t('settings.custom.presets.new')
            }
            onClick={() => (adding ? cancelAdd() : openAdd())}
          >
            <Ico name="add" width={16} height={16} />
          </button>
        </div>
      </div>

      {/* Строка добавления: ссылка (библиотека) / имя (пресет) */}
      {(adding || closing) && (
        <div className={`cz-addrow${closing ? ' out' : ''}`}>
          <div className="cz-field">
            <input
              className="cz-input"
              type="text"
              autoFocus
              maxLength={pane === 'lib' ? 2048 : 40}
              placeholder={pane === 'lib' ? t('settings.custom.addUrl.placeholder') : t('settings.custom.presets.namePlaceholder')}
              value={pane === 'lib' ? urlVal : presetName}
              onChange={(e) => (pane === 'lib' ? setUrlVal(e.target.value) : setPresetName(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (pane === 'lib') addUrlAndClear()
                  else onSavePreset()
                } else if (e.key === 'Escape') cancelAdd()
              }}
            />
            {/* Второй путь добавления прямо из строки — выбрать файлы с диска. */}
            {pane === 'lib' && (
              <label className="cz-field-btn" aria-label={t('settings.custom.addFiles')}>
                <Ico name="export" width={15} height={15} />
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
          <button
            className="cz-btn"
            disabled={pane === 'lib' ? !urlVal.trim() : false}
            onClick={() => (pane === 'lib' ? addUrlAndClear() : onSavePreset())}
          >
            {pane === 'lib' ? t('settings.custom.add') : t('common.save')}
          </button>
        </div>
      )}

      {/* key={pane} перемонтирует обёртку на каждом переключении — так CSS-
          анимация проигрывается заново; направление сдвига зависит от того, в
          какую сторону переключились. */}
      <div key={pane} className={`cz-pane ${paneDir === 1 ? 'from-right' : 'from-left'}`}>
      {pane === 'lib' ? (
        items.length === 0 ? (
          <EmptyBox title={t('settings.custom.library.empty')} sub={t('settings.custom.library.emptySub')} />
        ) : (
          <div className="cz-grid">
            {items.map((it) => (
              <div
                key={it.id}
                className={`cz-card${drag?.item.id === it.id ? ' dragging' : ''}`}
                onPointerDown={(e) => onCardPointerDown(e, it)}
                onContextMenu={(e) => { e.preventDefault(); setImgMenu({ pos: { x: e.clientX, y: e.clientY }, item: it }) }}
              >
                <img src={it.data} alt="" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.style.opacity = '0.2' }} />
                <div className="cz-card-name">{it.name}</div>
                <div className="cz-card-acts">
                  <button className="cz-act" aria-label={t('player.aria.download')} onClick={(e) => { e.stopPropagation(); void downloadImageFile(it.data, it.name) }}>
                    <Ico name="download" width={15} height={15} />
                  </button>
                  <button className="cz-act danger" aria-label={t('settings.custom.ctxmenu.delete')} onClick={(e) => { e.stopPropagation(); removeItem(it.id) }}>
                    <Ico name="trash" width={15} height={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : presets.length === 0 ? (
        <EmptyBox title={t('settings.custom.presets.empty')} sub={t('settings.custom.presets.emptySub')} />
      ) : (
        <div className="cz-grid">
          {presets.map((p) => (
            <div
              key={p.id}
              className="cz-card"
              onClick={() => applyPreset(p.id)}
              onContextMenu={(e) => { e.preventDefault(); setPresetMenu({ pos: { x: e.clientX, y: e.clientY }, id: p.id }) }}
            >
              <PresetThumb p={p} />
              <div className="cz-card-name">{p.name || t('settings.custom.presets.untitled')}</div>
              <div className="cz-card-acts">
                <button className="cz-act" aria-label={t('settings.custom.ctxmenu.export')} onClick={(e) => { e.stopPropagation(); void exportPreset(p.id) }}>
                  <Ico name="download" width={15} height={15} />
                </button>
                <button className="cz-act danger" aria-label={t('settings.custom.ctxmenu.delete')} onClick={(e) => { e.stopPropagation(); deletePreset(p.id) }}>
                  <Ico name="trash" width={15} height={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Настройки под сеткой — за такой же полосой, как у плашек контекстов.
          Каждая появляется только когда есть что настраивать: режим — при
          поставленной обложке, размытие/затемнение — при фоне (своя картинка
          или включённая «обложка трека как фон»). */}
      {(showCoverMode || showBgOpts) && (
        <div className="cz-sub">
          {showCoverMode && (
            <div className="sc">
              <div className="sr">
                <div>
                  <div className="sl2">
                    {t('settings.custom.coverMode')}
                    <RowReset onReset={() => setCoverMode('always')} />
                  </div>
                  <div className="ssub">{t('settings.custom.coverMode.sub')}</div>
                </div>
                <div className="cz-modes">
                  <button
                    className={`s-opt-btn ${coverMode === 'always' ? 'bta' : 'btg'}`}
                    onClick={() => setCoverMode('always')}
                  >
                    {t('settings.custom.coverMode.always')}
                  </button>
                  <button
                    className={`s-opt-btn ${coverMode === 'fallback' ? 'bta' : 'btg'}`}
                    onClick={() => setCoverMode('fallback')}
                  >
                    {t('settings.custom.coverMode.fallback')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {showBgOpts && <BackgroundSliders />}
        </div>
      )}

      {/* Контекстное меню фото */}
      <CtxMenu
        pos={imgMenu?.pos ?? null}
        onClose={() => setImgMenu(null)}
        items={imgMenu ? [
          { label: t('settings.custom.ctxmenu.delete'), icon: <Ico name="trash" width={13} height={13} />, danger: true, onClick: () => removeItem(imgMenu.item.id) },
        ] : []}
      />

      {/* Контекстное меню пресета */}
      <CtxMenu
        pos={presetMenu?.pos ?? null}
        onClose={() => setPresetMenu(null)}
        items={presetMenu ? [
          { label: t('settings.custom.ctxmenu.export'), icon: <Ico name="export" width={13} height={13} />, onClick: () => void exportPreset(presetMenu.id) },
          { label: t('settings.custom.ctxmenu.delete'), icon: <Ico name="trash" width={13} height={13} />, danger: true, onClick: () => deletePreset(presetMenu.id) },
        ] : []}
      />

      {/* Превью, летящее за курсором. В body — чтобы не обрезалось прокруткой
          настроек; pointer-events:none, иначе перекроет хит-тест плашек. */}
      {drag && createPortal(
        <div className="cz-drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <img src={drag.item.data} alt="" />
        </div>,
        document.body,
      )}
    </>
  )
}

/** Пустое состояние панели: иконка-коробка + заголовок + подпись. */
const EmptyBox = ({ title, sub }: { title: string; sub: string }) => (
  <div className="cz-empty">
    <Ico name="box" width={40} height={40} className="cz-empty-ico" />
    <div className="cz-empty-title">{title}</div>
    <div className="cz-empty-sub">{sub}</div>
  </div>
)

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
          <Ico name="box" width={30} height={30} />
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

// ── Плашка контекста ──────────────────────────────────────────────────────
// Только иконка: без бордера и без подписей (название уходит в aria-label).
const CtxCard = ({
  ctx,
  label,
  current,
  disabled,
  dropOver,
  onClear,
  icon,
}: {
  ctx: Ctx
  label: string
  current: string | null
  disabled?: boolean
  /** Курсор с перетаскиваемой картинкой сейчас над этой плашкой. */
  dropOver?: boolean
  onClear?: () => void
  icon: React.ReactNode
}) => (
  <div
    // data-ctx читает хит-тест перетаскивания (elementFromPoint → closest).
    data-ctx={ctx}
    className={`mls-card${current ? ' has-img' : ''}${dropOver ? ' drop-over' : ''}`}
    role="button"
    aria-label={label}
    onClick={() => { if (!disabled && current) onClear?.() }}
    style={disabled ? { opacity: 0.45, cursor: 'default' } : undefined}
  >
    <div className="mls-card-preview">
      {current && <img src={current} alt="" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none' }} />}
      <div className="mls-card-icon-wrap">{icon}</div>
    </div>
  </div>
)

