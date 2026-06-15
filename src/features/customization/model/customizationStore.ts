import { useEffect } from 'react'
import { create } from 'zustand'
import { usePlayerStore } from '@features/player'
import { applyBackground, applyBgDim, applyCustomCursor } from '../lib/apply'
import { saveAppImage, loadAppImages } from '../lib/mediaIdb'

/**
 * Текущие выборы кастомизации.
 *
 * Источник правды по «текущим картинкам» — IDB `_appimg_*` (saveAppImage),
 * параметры фона (blur/dim/coverAsBg) — localStorage[bloom_bg_prefs].
 *
 * Этой фазой АКТИВНЫ: Фон (#bgl), Курсор и Обложка плеера (override через
 * playerStore.coverOverride). Визуализатор (viz) — хранится, но применение к
 * визу подключим отдельным заходом.
 */

interface CustomizationState {
  bgUrl: string | null
  coverUrl: string | null
  vizUrl: string | null
  cursorUrl: string | null
  bgBlur: number
  bgDim: number
  coverAsBg: boolean

  setBg: (url: string | null) => void
  /** Обложка плеера-override (пишет playerStore.coverOverride; null = снять). */
  setCover: (url: string | null) => void
  /** Фото визуализатора (пишет playerStore.vizPhoto; null = снять). */
  setViz: (url: string | null) => void
  setCursor: (url: string | null) => void
  setBgBlur: (px: number) => void
  setBgDim: (pct: number) => void
  setCoverAsBg: (v: boolean) => void
  /** Сброс фона к дефолтам: убрать картинку, blur=0, dim=65, coverAsBg=off. */
  resetBg: () => void
}

const PREFS_KEY = 'bloom_bg_prefs'

interface BgPrefs {
  bgBlur: number
  bgDim: number
  coverAsBg: boolean
}

const loadPrefs = (): BgPrefs => {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    return {
      bgBlur: typeof p.bgBlur === 'number' ? p.bgBlur : 0,
      bgDim: typeof p.bgDim === 'number' ? p.bgDim : 65,
      coverAsBg: !!p.coverAsBg,
    }
  } catch {
    return { bgBlur: 0, bgDim: 65, coverAsBg: false }
  }
}

const savePrefs = (p: BgPrefs): void => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* игнор */
  }
}

const initPrefs = loadPrefs()

export const useCustomizationStore = create<CustomizationState>((set, get) => {
  /** Резолвит итоговый фон и применяет к #bgl + затемнение. */
  const applyBgNow = (): void => {
    const s = get()
    let url = s.bgUrl
    if (!url && s.coverAsBg) url = usePlayerStore.getState().artwork
    applyBackground(url, s.bgBlur)
    applyBgDim(s.bgDim)
  }
  const persistPrefs = (): void => {
    const s = get()
    savePrefs({ bgBlur: s.bgBlur, bgDim: s.bgDim, coverAsBg: s.coverAsBg })
  }

  return {
    bgUrl: null,
    coverUrl: null,
    vizUrl: null,
    cursorUrl: null,
    bgBlur: initPrefs.bgBlur,
    bgDim: initPrefs.bgDim,
    coverAsBg: initPrefs.coverAsBg,

    setBg: (url) => {
      set({ bgUrl: url })
      void saveAppImage('manualBgUrl', url)
      applyBgNow()
    },
    setCover: (url) => {
      set({ coverUrl: url })
      void saveAppImage('playerCoverUrl', url)
      // Override обложки плеера — через playerStore (его читают PagePlayer/PlayerBar).
      usePlayerStore.setState({ coverOverride: url })
    },
    setViz: (url) => {
      set({ vizUrl: url })
      void saveAppImage('vizPhoto', url)
      // Фото визуализатора — через playerStore (его читает VizBlock).
      usePlayerStore.setState({ vizPhoto: url })
    },
    setCursor: (url) => {
      set({ cursorUrl: url })
      void saveAppImage('customCursor', url)
      applyCustomCursor(url)
    },
    setBgBlur: (px) => {
      set({ bgBlur: px })
      persistPrefs()
      applyBgNow()
    },
    setBgDim: (pct) => {
      set({ bgDim: pct })
      persistPrefs()
      applyBgDim(pct)
    },
    setCoverAsBg: (v) => {
      set({ coverAsBg: v })
      persistPrefs()
      applyBgNow()
    },
    resetBg: () => {
      set({ bgUrl: null, bgBlur: 0, bgDim: 65, coverAsBg: false })
      void saveAppImage('manualBgUrl', null)
      persistPrefs()
      applyBgNow()
    },
  }
})

/**
 * Восстановить кастомизацию из IDB при старте + применить. Подключается в App.
 * Также переприменяет фон при смене обложки трека (когда включён coverAsBg).
 */
export const useCustomizationBootstrap = (): void => {
  useEffect(() => {
    let cancelled = false
    void loadAppImages().then((imgs) => {
      if (cancelled) return
      useCustomizationStore.setState({
        bgUrl: imgs.manualBgUrl ?? null,
        coverUrl: imgs.playerCoverUrl ?? null,
        vizUrl: imgs.vizPhoto ?? null,
        cursorUrl: imgs.customCursor ?? null,
      })
      // Применяем восстановленные.
      const s = useCustomizationStore.getState()
      const bg = s.bgUrl || (s.coverAsBg ? usePlayerStore.getState().artwork : null)
      applyBackground(bg, s.bgBlur)
      applyBgDim(s.bgDim)
      if (s.cursorUrl) applyCustomCursor(s.cursorUrl)
      if (s.coverUrl) usePlayerStore.setState({ coverOverride: s.coverUrl })
      if (s.vizUrl) usePlayerStore.setState({ vizPhoto: s.vizUrl })
    })

    // Обложка трека как фон: переприменяем при смене artwork.
    const unsub = usePlayerStore.subscribe((st, prev) => {
      if (st.artwork === prev.artwork) return
      const c = useCustomizationStore.getState()
      if (!c.bgUrl && c.coverAsBg) {
        applyBackground(st.artwork, c.bgBlur)
      }
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])
}
