import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { seek, usePlayerStore } from '@features/player'
import type { LyricsFill, LyricsFx } from '@features/settings'
import type { LrcLine } from '../lib/parseLrc'
import { useLyricsStore } from '../model/lyricsStore'
import { useLocale, t as tt } from '@shared/i18n'

/** Единица заливки: на что режем строку (`.kw`). У 'line' единиц нет. */
const fillUnit = (f: LyricsFill): 'word' | 'letter' | null =>
  f === 'letter' ? 'letter' : f === 'line' ? null : 'word'

/**
 * Переиспользуемое тело текста: рендер строк (синхро LRC / plain) + подсветка
 * активной строки + скролл-в-центр + заливка (`fill`).
 *
 * Используется и overlay-панелью над обложкой (`LyricsPanel`, контейнер
 * `.lyrics-content`), и глобальной правой панелью (контейнер `.lq-content`).
 *
 * @param active  рендерить эффекты (скролл/заливку) только когда поверхность видима.
 * @param offsetSec  собственный сдвиг синхронизации (секунды) — для BigPicture,
 *   где активная строка считается от `position - offsetSec` независимо от
 *   общего `curLine` стора.
 * @param fill  чем меряется прогресс по активной строке (строка/слово/буква/
 *   градиент), своя настройка у каждой поверхности (`playerViewStore.lyricsStyle`).
 * @param fx  эффект поверх заливки (нет / мягко / свечение).
 */
export const LyricsView = ({
  className,
  id,
  active,
  style,
  offsetSec,
  fill = 'word',
  fx = 'none',
}: {
  className: string
  id?: string
  active: boolean
  style?: CSSProperties
  offsetSec?: number
  fill?: LyricsFill
  fx?: LyricsFx
}) => {
  useLocale()
  const status = useLyricsStore((s) => s.status)
  const lines = useLyricsStore((s) => s.lines)
  const plain = useLyricsStore((s) => s.plain)
  const curLineStore = useLyricsStore((s) => s.curLine)
  const ref = useRef<HTMLDivElement>(null)

  // Локальная активная строка при заданном offsetSec (BigPicture): считаем от
  // сдвинутой позиции, не трогая общий curLine стора (он привязан к плееру).
  const usingOffset = offsetSec != null
  const [localActive, setLocalActive] = useState(-1)
  useEffect(() => {
    if (!usingOffset || !lines.length) return
    const compute = (pos: number) => {
      const adj = pos - (offsetSec ?? 0)
      let idx = -1
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.time <= adj + 0.25) idx = i
        else break
      }
      setLocalActive(idx)
    }
    compute(usePlayerStore.getState().position)
    return usePlayerStore.subscribe((s, p) => {
      if (s.position !== p.position) compute(s.position)
    })
  }, [usingOffset, offsetSec, lines])
  const curLine = usingOffset ? localActive : curLineStore

  // Скролл активной строки в центр; до первой строки — точки-интро.
  // Считаем scrollTop вручную (как в QueueBlock), а НЕ через scrollIntoView:
  // тот доводит строку до центра, доскролливая всех предков по цепочке. На
  // последних строках наш контейнер упирается в конец (нижнего padding'а не
  // хватает, чтобы вывести строку ровно в центр) — и браузер добирал недостачу
  // прокруткой внешнего блока, в фуллскрине сдвигая вверх сам #bigPicOverlay:
  // снизу проступала полоса окна под ним.
  useEffect(() => {
    if (!active) return
    const box = ref.current
    const el =
      curLine < 0
        ? box?.querySelector<HTMLElement>('.lyrics-intro')
        : box?.querySelector<HTMLElement>(`.lyrics-line[data-idx="${curLine}"]`)
    if (!box || !el) return
    const bRect = box.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const top = box.scrollTop + (eRect.top - bRect.top) - (box.clientHeight - eRect.height) / 2
    box.scrollTo({ top, behavior: 'smooth' })
  }, [active, curLine])

  useLyricsFill(ref, { fill, lines, curLine, active, offsetSec })

  return (
    <div className={`${className} lyr-fill-${fill} lyr-fx-${fx}`} id={id} ref={ref} style={style}>
      {renderBody({ status, lines, plain, curLine, fill, offsetSec })}
    </div>
  )
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Заливка активной строки: классы `.kw-on` (единица уже спета) / `.kw-cur`
 * (поётся сейчас) и переменная прогресса `--kwp` (заполнение внутри единицы,
 * нужна только заливке `wipe`). Императивно — чтобы не перерендеривать список.
 *
 * Позиция плеера тикает ~4 Гц, для градиентных режимов этого мало, поэтому
 * между тиками время экстраполируем по `performance.now()` и красим в rAF
 * (CSS-анимации с `animation-delay` тут не годятся: их пришлось бы
 * пересинхронизировать на каждой перемотке). Трогаем ТОЛЬКО активную строку —
 * обход всех строк каждый кадр на длинном тексте заметен, — а rAF крутится
 * лишь пока играет: на паузе красим по подписке.
 */
const useLyricsFill = (
  ref: RefObject<HTMLDivElement | null>,
  {
    fill,
    lines,
    curLine,
    active,
    offsetSec,
  }: { fill: LyricsFill; lines: LrcLine[]; curLine: number; active: boolean; offsetSec?: number },
): void => {
  useEffect(() => {
    if (!active || fill === 'line' || !lines.length || curLine < 0) return
    const el = ref.current?.querySelector<HTMLElement>(`.lyrics-line[data-idx="${curLine}"]`)
    if (!el) return
    const t0 = lines[curLine]!.time
    // Последняя строка не имеет конца — те же 4 с, что и в LyricsUnits.
    const t1 = lines[curLine + 1]?.time ?? t0 + 4
    const units = Array.from(el.querySelectorAll<HTMLElement>('.kw'))
    const starts = units.map((w) => parseFloat(w.dataset.start ?? '0'))

    let cur = -2
    let lastP = -1
    const paint = (sec: number) => {
      if (!units.length) return // пустая строка-разделитель
      let idx = -1
      for (let i = 0; i < starts.length; i++) {
        if (sec + 0.05 >= starts[i]!) idx = i
        else break
      }
      if (idx !== cur) {
        // Прошлую текущую единицу отпускаем в класс (`.kw-on` даёт --kwp:1),
        // иначе инлайновая переменная осталась бы недозалитой.
        if (cur >= 0) units[cur]?.style.removeProperty('--kwp')
        units.forEach((w, i) => {
          w.classList.toggle('kw-on', i <= idx)
          w.classList.toggle('kw-cur', i === idx)
        })
        cur = idx
        lastP = -1
      }
      if (fill !== 'wipe' || cur < 0) return
      const ws = starts[cur]!
      const p = clamp01((sec - ws) / Math.max((starts[cur + 1] ?? t1) - ws, 0.001))
      if (Math.abs(p - lastP) > 0.004) {
        units[cur]!.style.setProperty('--kwp', String(p))
        lastP = p
      }
    }

    // Сглаженные часы: базовая позиция из стора + время с её прихода.
    const shift = offsetSec ?? 0
    let basePos = usePlayerStore.getState().position
    let baseT = performance.now()
    const nowSec = (): number =>
      (usePlayerStore.getState().playing ? basePos + (performance.now() - baseT) / 1000 : basePos) - shift

    let raf = 0
    const loop = () => {
      paint(nowSec())
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (!raf) raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    paint(nowSec())
    if (usePlayerStore.getState().playing) start()
    const unsub = usePlayerStore.subscribe((s, p) => {
      if (s.position !== p.position) {
        basePos = s.position
        baseT = performance.now()
      }
      if (s.playing !== p.playing) {
        basePos = s.position
        baseT = performance.now()
        if (s.playing) start()
        else stop()
      }
      // Стоим (пауза/перемотка на паузе) — rAF не крутится, красим по тику.
      if (!raf) paint(nowSec())
    })

    return () => {
      stop()
      unsub()
      units.forEach((w) => {
        w.classList.remove('kw-on', 'kw-cur')
        w.style.removeProperty('--kwp')
      })
    }
  }, [ref, fill, lines, curLine, active, offsetSec])
}

interface BodyProps {
  status: ReturnType<typeof useLyricsStore.getState>['status']
  lines: LrcLine[]
  plain: string
  curLine: number
  fill: LyricsFill
  offsetSec?: number
}

const renderBody = ({ status, lines, plain, curLine, fill, offsetSec }: BodyProps): ReactNode => {
  if (status === 'loading') return <p className="lyrics-status">{tt('lyrics.loading')}</p>
  if (lines.length) {
    const unit = fillUnit(fill)
    return (
      <>
        <LyricsIntroDots until={lines[0]!.time} offsetSec={offsetSec} />
        {lines.map((l, i) => (
          <LyricsLine key={i} line={l} idx={i} next={lines[i + 1]} cls={lineClass(i, curLine)} unit={unit} />
        ))}
      </>
    )
  }
  if (plain) {
    return plain.split('\n').map((row, i) => (
      <p key={i} className="lyrics-line lyr-plain">
        {row || ' '}
      </p>
    ))
  }
  return <p className="lyrics-status">{tt('lyrics.notFound')}</p>
}

/**
 * Три точки вместо первой строки, пока играет вступление: заполняются по мере
 * приближения к первой строке (0 → все три), после неё гаснут до «прошедшей»
 * строки. Позицию слушаем подпиской, чтобы не перерендеривать весь список.
 *
 * Рендерятся у ЛЮБОГО синхронного текста, а не только при длинном вступлении:
 * порога нет, потому что ряд точек — постоянный маркер «до первой строки», и с
 * ним текст выглядит одинаково у всех треков (у половины LRC первая строка
 * начинается раньше 2.5 с, и точки просто пропадали).
 */
const LyricsIntroDots = ({ until, offsetSec }: { until: number; offsetSec?: number }) => {
  const [prog, setProg] = useState(until > 0 ? 0 : 1)
  useEffect(() => {
    // Вступления нет вовсе (первая строка в 00:00) — точки сразу «прошедшие»,
    // иначе adj/until дало бы NaN и они застряли бы потухшими.
    if (!(until > 0)) {
      setProg(1)
      return
    }
    const calc = (pos: number) => {
      const adj = pos - (offsetSec ?? 0)
      setProg(Math.max(0, Math.min(1, adj / until)))
    }
    calc(usePlayerStore.getState().position)
    return usePlayerStore.subscribe((s, p) => {
      if (s.position !== p.position) calc(s.position)
    })
  }, [until, offsetSec])
  return (
    <p className={`lyrics-intro${prog >= 1 ? ' lyr-past' : ' lyr-active'}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`lyrics-dot${prog >= i / 3 ? ' on' : ''}`} />
      ))}
    </p>
  )
}

const lineClass = (i: number, curLine: number): string => {
  if (i === curLine) return 'lyr-active'
  if (i === curLine + 1) return 'lyr-upcoming'
  return 'lyr-past'
}

const LyricsLine = ({
  line,
  idx,
  next,
  cls,
  unit,
}: {
  line: LrcLine
  idx: number
  next: LrcLine | undefined
  cls: string
  /** Единица заливки; `null` — заливка «по строкам», текст цельным куском. */
  unit: 'word' | 'letter' | null
}) => {
  const onClick = () => seek(line.time)
  return (
    <p className={`lyrics-line ${cls}`} data-idx={idx} onClick={onClick}>
      {unit ? <LyricsUnits line={line} next={next} unit={unit} /> : line.text}
    </p>
  )
}

/**
 * Разбивает строку на единицы заливки (слова или буквы) со временем старта:
 * LRC даёт время только строки, поэтому интервал делится пропорционально числу
 * символов — тайминги синтетические. Конец единицы = старт следующей (у
 * последней — конец строки), это же правило повторяет `useLyricsFill`.
 *
 * Пробелы остаются текстовыми узлами (не `.kw`): так они не «зажигаются»
 * отдельно и не мешают переносу строк.
 */
const LyricsUnits = ({
  line,
  next,
  unit,
}: {
  line: LrcLine
  next: LrcLine | undefined
  unit: 'word' | 'letter'
}) => {
  const t0 = line.time
  const t1 = next ? next.time : t0 + 4
  const parts = unit === 'letter' ? Array.from(line.text) : line.text.split(/(\s+)/)
  const totalChars = parts.reduce((a, w) => a + (/^\s+$/.test(w) ? 0 : w.length), 0) || 1
  let acc = 0
  return (
    <>
      {parts.map((w, i) => {
        if (/^\s+$/.test(w)) return w
        if (!w.length) return null
        const start = (t0 + (acc / totalChars) * (t1 - t0)).toFixed(3)
        acc += w.length
        return (
          <span key={i} className="kw" data-start={start}>
            {w}
          </span>
        )
      })}
    </>
  )
}
