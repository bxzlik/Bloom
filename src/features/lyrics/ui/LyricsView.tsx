import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { seek, usePlayerStore } from '@features/player'
import type { LrcLine } from '../lib/parseLrc'
import { useLyricsStore } from '../model/lyricsStore'
import { useLocale, t as tt } from '@shared/i18n'

/**
 * Переиспользуемое тело текста: рендер строк (синхро LRC / plain) + подсветка
 * активной строки + скролл-в-центр + караоке по словам.
 *
 * Используется и overlay-панелью над обложкой (`LyricsPanel`, контейнер
 * `.lyrics-content`), и глобальной правой панелью (контейнер `.lq-content`).
 *
 * @param active  рендерить эффекты (скролл/караоке) только когда поверхность видима.
 * @param offsetSec  собственный сдвиг синхронизации (секунды) — для BigPicture,
 *   где активная строка считается от `position - offsetSec` независимо от
 *   общего `curLine` стора.
 */
export const LyricsView = ({
  className,
  id,
  active,
  style,
  offsetSec,
}: {
  className: string
  id?: string
  active: boolean
  style?: CSSProperties
  offsetSec?: number
}) => {
  useLocale()
  const status = useLyricsStore((s) => s.status)
  const lines = useLyricsStore((s) => s.lines)
  const plain = useLyricsStore((s) => s.plain)
  const curLineStore = useLyricsStore((s) => s.curLine)
  const karaoke = useLyricsStore((s) => s.karaoke)
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

  // Скролл активной строки в центр.
  useEffect(() => {
    if (!active || curLine < 0) return
    const el = ref.current?.querySelector<HTMLElement>(`.lyrics-line[data-idx="${curLine}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [active, curLine])

  // Караоке: подсветка слов по времени. Императивно,
  // чтобы не перерендеривать список при каждом timeupdate (~4 Гц).
  useEffect(() => {
    if (!active || !karaoke || !lines.length) return
    const apply = (sec: number) => {
      const root = ref.current
      if (!root) return
      root.querySelectorAll<HTMLElement>('.lyrics-line').forEach((line) => {
        const words = line.querySelectorAll<HTMLElement>('.kw')
        if (!words.length) return
        if (!line.classList.contains('lyr-active')) {
          words.forEach((w) => w.classList.remove('kw-on'))
          return
        }
        words.forEach((w) => {
          const s = parseFloat(w.dataset.start ?? '0')
          if (sec + 0.05 >= s) w.classList.add('kw-on')
          else w.classList.remove('kw-on')
        })
      })
    }
    // BigPicture: караоке тоже сдвигаем на offsetSec ( _karaokeTick(bpAdj)).
    const adj = (sec: number) => sec - (offsetSec ?? 0)
    apply(adj(usePlayerStore.getState().position))
    const unsub = usePlayerStore.subscribe((s, p) => {
      if (s.position !== p.position) apply(adj(s.position))
    })
    return unsub
  }, [active, karaoke, lines, curLine, offsetSec])

  return (
    <div className={className} id={id} ref={ref} style={style}>
      {renderBody({ status, lines, plain, curLine, karaoke })}
    </div>
  )
}

interface BodyProps {
  status: ReturnType<typeof useLyricsStore.getState>['status']
  lines: LrcLine[]
  plain: string
  curLine: number
  karaoke: boolean
}

const renderBody = ({ status, lines, plain, curLine, karaoke }: BodyProps): ReactNode => {
  if (status === 'loading') return <p className="lyrics-status">{tt('lyrics.loading')}</p>
  if (lines.length) {
    return lines.map((l, i) => (
      <LyricsLine key={i} line={l} idx={i} next={lines[i + 1]} cls={lineClass(i, curLine)} karaoke={karaoke} />
    ))
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
  karaoke,
}: {
  line: LrcLine
  idx: number
  next: LrcLine | undefined
  cls: string
  karaoke: boolean
}) => {
  const onClick = () => seek(line.time)
  return (
    <p className={`lyrics-line ${cls}`} data-idx={idx} onClick={onClick}>
      {karaoke ? <KaraokeWords line={line} next={next} /> : line.text}
    </p>
  )
}

/**
 * Разбивает строку на слова со временем старта (равномерно по символам внутри
 * интервала строки). karaoke-блока в `_renderInto`.
 */
const KaraokeWords = ({ line, next }: { line: LrcLine; next: LrcLine | undefined }) => {
  const t0 = line.time
  const t1 = next ? next.time : t0 + 4
  const parts = line.text.split(/(\s+)/)
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
