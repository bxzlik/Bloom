import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { TrackAnimKind } from '@features/settings'
import { getSwapDir } from '../lib/trackSwapDir'

/**
 * Анимация смены трека: два слоя (уезжающий «прошлый» и приезжающий «текущий»)
 * поверх одной коробки. Используется обложкой и подписью в плеере, нижнем баре и
 * фуллскрине; стили — `shared/styles/track-swap.css`.
 *
 * Снимок прошлого трека — это ДЕТИ ПРЕДЫДУЩЕГО РЕНДЕРА: React-элемент держит
 * пропсы момента создания, поэтому старая обложка/название рисуются сами собой,
 * без ручного копирования значений в state.
 *
 * `layerClass` навешивается на ОБА слоя (а не на обёртку) намеренно: раскладка
 * снаружи местами завязана на прямых потомках (`.sl-text-wrap>div:first-child`,
 * `.cn-center-title>div:first-child`), и лишний слой между ними эти правила
 * разорвал бы.
 */
export const TrackSwap = ({
  id,
  kind,
  layerClass,
  fill = false,
  className,
  children,
}: {
  /** id текущего трека: его смена и запускает анимацию. */
  id: string | null
  /** Тип анимации из настроек ('none' — рендерим слои как есть). */
  kind: TrackAnimKind
  /** Класс раскладки, который был на исходном элементе (уезжает на оба слоя). */
  layerClass?: string
  /** Слои растянуты по коробке-родителю (обложка), а не стоят в потоке (текст). */
  fill?: boolean
  /** Доп. класс обёртки (ручки `--tsw-*` вешаем на него). */
  className?: string
  children: ReactNode
}) => {
  // Прошлый рендер: id + его дети. node обновляем и без смены id (обложка могла
  // поменяться от «заморозки»/кастомной картинки) — иначе уезжал бы протухший кадр.
  const prevRef = useRef<{ id: string | null; node: ReactNode }>({ id, node: children })
  const seqRef = useRef(0)
  const [anim, setAnim] = useState<{ seq: number; node: ReactNode; back: boolean } | null>(null)

  useLayoutEffect(() => {
    const prev = prevRef.current
    if (prev.id === id) {
      prev.node = children
      return
    }
    const from = prev.node
    const hadTrack = prev.id != null
    prevRef.current = { id, node: children }
    // Первый трек за сессию (нечему уезжать) и выключенная анимация — без слоёв.
    if (kind === 'none' || !hadTrack) {
      setAnim(null)
      return
    }
    seqRef.current += 1
    setAnim({ seq: seqRef.current, node: from, back: getSwapDir() < 0 })
  })

  // Уехавший слой снимаем по концу анимации. Сравнение seq — на случай, что за
  // время таймера успела начаться следующая смена (её слой убивать нельзя).
  useEffect(() => {
    if (!anim) return
    const id = window.setTimeout(
      () => setAnim((cur) => (cur && cur.seq === anim.seq ? null : cur)),
      TSW_MS,
    )
    return () => window.clearTimeout(id)
  }, [anim])

  const motion = anim ? ` tsw-${kind}${anim.back ? ' tsw-back' : ''}` : ''
  return (
    <div className={`tsw${fill ? ' tsw-fill' : ''}${className ? ` ${className}` : ''}`}>
      {/* key=id: новый трек — новый слой (иначе анимация не переиграется). */}
      <div key={id ?? '—'} className={`${layerClass ?? ''} tsw-l tsw-cur${motion}`}>
        {children}
      </div>
      {anim && (
        <div className={`${layerClass ?? ''} tsw-l tsw-prev${motion}`} aria-hidden>
          {anim.node}
        </div>
      )}
    </div>
  )
}

/** Сколько живёт уезжающий слой. Потолок всех длительностей из track-swap.css
 *  (`--tsw-dur`, самая долгая — 420ms у слайда) + запас на планировщик. */
const TSW_MS = 520
