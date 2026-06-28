import { useEffect } from 'react'
import { useCustomizationStore } from '@features/customization'
import { usePlayerStore } from '@features/player'
import { useTauriEvent } from '@shared/hooks'
import { useOptStore, type OptMode } from '../model/optStore'
import { isGifUrl, snapshotGif, warmGif, localGifSrc } from './gifFreeze'

/**
 * Движок «Оптимизации». Применяет/снимает упрощение графики по событиям окна
 * (`bloom-window-focus` / `bloom-window-minimized` из Rust).
 *
 * Эффекты — через CSS-классы (визуальный слой уже в main.css), флаг
 * vizPaused (стоп визуализатора) и заморозку GIF в 1-й кадр (обложка/фон/виз —
 * CSS их не останавливает): обложка/виз через optStore.frozenCover/frozenViz
 * (читают компоненты плеера), фон #bgl — императивно (он не под React).
 */

const BLUR_QUALITY_PX: Record<string, number> = { low: 4, medium: 8, high: 12 }

const bgl = (): HTMLElement | null => document.getElementById('bgl')
const psCover = (): Element | null => document.querySelector('.ps-cover')

// Оригинал GIF-фона (#bgl) для восстановления после заморозки.
let _bgGifOriginal: string | null = null

/** Применить упрощение для режима (unfocus/minimized). */
const applyMode = (mode: OptMode): void => {
  const s = useOptStore.getState()
  if (mode === 'unfocus' && !s.unfocusSimplify) return
  if (mode === 'minimized' && !s.minimizedSmart) return
  const fx = s.effects[mode]
  const root = document.documentElement
  const body = document.body

  // Размытие: снизить backdrop-filter (--opt-blur + класс opt-unfocused).
  if (!fx.blur) {
    root.classList.add('opt-unfocused')
    if (mode === 'unfocus') {
      root.style.setProperty('--opt-blur', `${BLUR_QUALITY_PX[s.unfocusBlurQuality] ?? 4}px`)
      const el = bgl()
      if (el && useCustomizationStore.getState().bgBlur > 0) {
        el.style.filter = `blur(${s.unfocusBlurStrength}px)`
      }
    }
  }
  // Обложки: приостановить анимацию (<2) / скрыть (===0) + заморозить GIF.
  if (fx.covers < 2) {
    psCover()?.classList.add('opt-cover-anim-paused')
    // Обложка в полноэкранном режиме (#bigPicOverlay) — та же пауза анимации.
    document.querySelector('#bigPicOverlay .bp-cover')?.classList.add('opt-cover-anim-paused')
    if (fx.covers === 0) psCover()?.classList.add('opt-hidden')
    // GIF-обложка (CSS не остановит <img>) → снимок 1-го кадра в optStore.
    const ps = usePlayerStore.getState()
    const cover = ps.coverOverride ?? ps.artwork
    if (isGifUrl(cover) && !useOptStore.getState().frozenCover) {
      void snapshotGif(cover!).then((png) => {
        if (png) useOptStore.getState().setFrozenCover(png)
      })
    }
  }
  // Визуализатор: остановить (флаг читает VizBlock) + скрыть бары + заморозить GIF.
  if (!fx.visualizers) {
    useOptStore.getState().setVizPaused(true)
    body.classList.add('bars-hidden')
    const viz = usePlayerStore.getState().vizPhoto
    if (isGifUrl(viz) && !useOptStore.getState().frozenViz) {
      void snapshotGif(viz!).then((png) => {
        if (png) useOptStore.getState().setFrozenViz(png)
      })
    }
  }
  // Marquee: остановить прокрутку текста.
  if (!fx.marquee) body.classList.add('opt-marquee-paused')
  // Динамический фон: заморозить (стоп transition/animation #bgl) + дрейф
  // размытой обложки в полноэкранном режиме (#bigPicOverlay .bp-blur).
  if (!fx.bg) {
    bgl()?.classList.add('opt-frozen')
    document.querySelector('#bigPicOverlay .bp-blur')?.classList.add('bp-frozen')
  }
  // GIF-фон #bgl: заморозить в 1-й кадр (императивно — #bgl не под React).
  if (!fx.bgGif) {
    const bgUrl = useCustomizationStore.getState().bgUrl
    const el = bgl()
    if (el && isGifUrl(bgUrl) && !_bgGifOriginal) {
      _bgGifOriginal = bgUrl!
      void snapshotGif(bgUrl!).then((png) => {
        if (png && _bgGifOriginal) el.style.backgroundImage = `url(${png})`
      })
    }
  }
}

/** Снять все оптимизации, вернуть полную графику. */
const restoreAll = (): void => {
  const root = document.documentElement
  const body = document.body
  root.classList.remove('opt-unfocused')
  body.classList.remove('opt-marquee-paused', 'bars-hidden')
  psCover()?.classList.remove('opt-cover-anim-paused', 'opt-hidden')
  document.querySelector('#bigPicOverlay .bp-cover')?.classList.remove('opt-cover-anim-paused')
  document.querySelector('#bigPicOverlay .bp-blur')?.classList.remove('bp-frozen')
  const el = bgl()
  el?.classList.remove('opt-frozen')
  if (el) {
    const b = useCustomizationStore.getState().bgBlur
    el.style.filter = b > 0 ? `blur(${b}px)` : ''
  }
  // Снять заморозку GIF: вернуть живые обложку/виз (компоненты) и фон #bgl.
  const opt = useOptStore.getState()
  opt.setVizPaused(false)
  opt.setFrozenCover(null)
  opt.setFrozenViz(null)
  if (_bgGifOriginal && el) {
    // Возвращаем «живую» гифку из локального кэша (data-URL) — без повторной
    // сетевой загрузки/декода, иначе после фокуса фон долго подгружается.
    el.style.backgroundImage = `url(${localGifSrc(_bgGifOriginal) ?? _bgGifOriginal})`
    _bgGifOriginal = null
  }
}

/**
 * Прогреть кэш текущих GIF (фон/обложка/виз), чтобы первая же заморозка была
 * мгновенной (без сетевого round-trip). Вызывается при старте и после возврата
 * фокуса — к следующему расфокусу снимок уже готов.
 */
const warmCurrentGifs = (): void => {
  const bgUrl = useCustomizationStore.getState().bgUrl
  if (isGifUrl(bgUrl)) void warmGif(bgUrl!)
  const ps = usePlayerStore.getState()
  const cover = ps.coverOverride ?? ps.artwork
  if (isGifUrl(cover)) void warmGif(cover!)
  if (isGifUrl(ps.vizPhoto)) void warmGif(ps.vizPhoto!)
}

// Состояние окна.
let _focused = true
let _minimized = false

const onFocus = (focused: boolean): void => {
  _focused = focused
  if (focused) {
    // Сфокусированное окно физически НЕ может быть свёрнутым → снимаем флаг
    // minimized и восстанавливаем. Это надёжно чинит «застрявшую» заморозку при
    // разворачивании: событие minimized(false) приходит ненадёжно/с устаревшим
    // _focused, а фокус — авторитетный сигнал «окно активно».
    _minimized = false
    restoreAll()
    // Прогреваем гифки к следующему расфокусу (заморозка станет мгновенной).
    warmCurrentGifs()
  } else {
    applyMode('unfocus')
  }
}

const onMinimized = (minimized: boolean): void => {
  if (minimized === _minimized) return
  _minimized = minimized
  if (minimized) applyMode('minimized')
  else if (_focused) restoreAll()
  else applyMode('unfocus')
}

/** Подписка на события окна. Подключается в App. */
export const useOptBootstrap = (): void => {
  useTauriEvent('bloom-window-focus', onFocus)
  useTauriEvent('bloom-window-minimized', onMinimized)
  // Прогрев кэша гифок при смене источника (фон/обложка/виз) — чтобы первая же
  // заморозка после назначения гифки была мгновенной (без сетевого round-trip).
  // warmGif идемпотентен и дедуплицирует, так что лишних загрузок нет.
  useEffect(() => {
    warmCurrentGifs()
    const unsubC = useCustomizationStore.subscribe((s, p) => {
      if (s.bgUrl !== p.bgUrl && isGifUrl(s.bgUrl)) void warmGif(s.bgUrl!)
    })
    const unsubP = usePlayerStore.subscribe((s, p) => {
      const cover = s.coverOverride ?? s.artwork
      const prevCover = p.coverOverride ?? p.artwork
      if (cover !== prevCover && isGifUrl(cover)) void warmGif(cover!)
      if (s.vizPhoto !== p.vizPhoto && isGifUrl(s.vizPhoto)) void warmGif(s.vizPhoto!)
    })
    return () => {
      unsubC()
      unsubP()
    }
  }, [])
}
