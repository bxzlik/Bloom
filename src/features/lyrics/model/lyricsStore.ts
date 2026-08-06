import { create } from 'zustand'
import type { LyricsResult } from '@shared/tauri'
import { t } from '@shared/i18n'
import { parseLrc, stripLrc, type LrcLine } from '../lib/parseLrc'

/** Человекочитаемая метка источника. srcMap. Бренды — литералы; локализуемые
 *  значения (тег файла) резолвятся через t() в момент использования. */
const SOURCE_LABELS: Record<string, string> = {
  'lrclib/exact': 'LRCLIB',
  'lrclib/search': 'LRCLIB',
  genius: 'Genius',
  none: '',
}

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'empty'

export interface LyricsState {
  /** Панель открыта (overlay поверх обложки).
   *  Оформление текста живёт не здесь, а в `playerViewStore.lyricsStyle` —
   *  оно своё у каждой поверхности и передаётся в `LyricsView` пропами. */
  open: boolean

  status: LyricsStatus
  /** Метка источника для бейджа (может быть пустой строкой). */
  source: string
  lines: LrcLine[]
  plain: string
  /** Индекс активной строки (−1 если до первой / нет синка). */
  curLine: number
  /** Монотонный счётчик запросов — отбрасывает устаревшие ответы. */
  requestId: number

  toggleOpen: () => void
  setOpen: (v: boolean) => void

  /** Начинает новый запрос: бампит requestId, ставит loading, чистит текст. */
  beginRequest: () => number
  /** Применяет ответ из Rust (событие bloom-lyrics). */
  applyResult: (r: LyricsResult) => void
  /** Пересчёт активной строки по времени воспроизведения (секунды). */
  setTime: (sec: number) => void
  /** Полный сброс (нет трека). */
  clear: () => void
}

export const useLyricsStore = create<LyricsState>((set, get) => ({
  open: false,

  status: 'idle',
  source: '',
  lines: [],
  plain: '',
  curLine: -1,
  requestId: 0,

  toggleOpen: () => set((s) => ({ open: !s.open })),
  setOpen: (v) => set({ open: v }),

  beginRequest: () => {
    const id = get().requestId + 1
    set({ requestId: id, status: 'loading', lines: [], plain: '', source: '', curLine: -1 })
    return id
  },

  applyResult: (r) => {
    // Отбрасываем ответы устаревших запросов (трек уже сменился).
    if (r.requestId != null) {
      const rid = Number(r.requestId)
      if (Number.isFinite(rid) && rid < get().requestId) return
    }
    if (!r.found) {
      set({ status: 'empty', lines: [], plain: '', source: '', curLine: -1 })
      return
    }
    const source =
      r.source === 'local_tag'
        ? t('lyrics.source.localTag')
        : (r.source && SOURCE_LABELS[r.source]) || ''
    if (r.synced && r.synced.trim()) {
      set({
        status: 'ready',
        lines: parseLrc(r.synced),
        plain: r.plain || stripLrc(r.synced),
        source,
        curLine: -1,
      })
    } else {
      set({ status: 'ready', lines: [], plain: r.plain || '', source, curLine: -1 })
    }
  },

  setTime: (sec) => {
    const { lines, curLine } = get()
    if (!lines.length) return
    let idx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.time <= sec + 0.25) idx = i
      else break
    }
    if (idx !== curLine) set({ curLine: idx })
  },

  clear: () => set({ status: 'idle', lines: [], plain: '', source: '', curLine: -1 }),
}))
