import { useEffect, useRef } from 'react'
import { useNavStore } from '@app/navigationStore'
import { useDetailStore } from '@features/search/model/detailStore'
import { usePlayerViewStore } from '@features/settings'
import { useQueueStore } from '../model/queueStore'
import { PlayerBar } from './PlayerBar'

/**
 * Боковая колонка вертикального бара (playerbar-left/right).
 * `#miniPlayerCol`/`#miniPlayerColRight` + `setPlayerBarPos`/`_applyMpColTransform`:
 * `PlayerBar` кладётся в колонку и поворачивается на 90° (ширина бара = высота
 * колонки → после поворота заполняет её). CSS (`.app.playerbar-left #miniPlayer`)
 * задаёт position:absolute/height/top/left/transform-origin; JS — только
 * width/margin/transform (замер высоты в двойном rAF, _updateMpColSize).
 *
 * Видимость колонки — когда есть трек и НЕ на странице плеера (как у бара);
 * `mp-col-visible` на `.app` сдвигает main-wrap (нужно в sidebar-top режиме).
 */
export const VerticalBarColumn = ({ side }: { side: 'left' | 'right' }) => {
  const curId = useQueueStore((s) => s.curId)
  const page = useNavStore((s) => s.page)
  const mpEnabled = usePlayerViewStore((s) => s.mpEnabled)
  // Как и у горизонтального бара: детальный оверлей (артист/альбом) поверх плеера
  // держит page='player', но полный плеер перекрыт → бар показываем.
  const detailOpen = useDetailStore((s) => s.stack.length > 0)
  const visible = !!curId && mpEnabled && (page !== 'player' || detailOpen)
  const colRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const app = document.querySelector('.app')
    app?.classList.toggle('mp-col-visible', visible)
    if (!visible) return () => app?.classList.remove('mp-col-visible')
    const apply = () => {
      const col = colRef.current
      const mp = col?.querySelector<HTMLElement>('#miniPlayer')
      if (!col || !mp) return
      const h = col.getBoundingClientRect().height
      if (h <= 0) return
      mp.style.width = `${h}px`
      mp.style.marginTop = '-36px'
      mp.style.marginLeft = `${-h / 2}px`
      mp.style.transformOrigin = 'center center'
      mp.style.transform = side === 'right' ? 'rotate(-90deg)' : 'rotate(90deg)'
    }
    // Двойной rAF — дождаться layout после display:none→flex.
    const raf = requestAnimationFrame(() => requestAnimationFrame(apply))
    // ResizeObserver на колонку: её высота меняется не только при resize окна, но
    // и при смене расположения сайдбара/бара, floating/compact, autohide и т.п.
    // Эффект на это НЕ перезапускается (deps те же), поэтому без наблюдателя бар
    // оставался бы со старой шириной и не дотягивался до низа колонки.
    const ro = new ResizeObserver(apply)
    if (colRef.current) ro.observe(colRef.current)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      app?.classList.remove('mp-col-visible')
    }
  }, [visible, side])

  return (
    <div
      id={side === 'left' ? 'miniPlayerCol' : 'miniPlayerColRight'}
      ref={colRef}
      style={{
        display: visible ? 'flex' : 'none',
        flexShrink: 0,
        width: 72,
        flexDirection: 'column',
        // position НЕ задаём инлайн: CSS сам выбирает relative (обычная раскладка,
        // player.css `#miniPlayerCol`) либо absolute (sidebar-top, чтобы колонка
        // встала плавающей полосой top:68/bottom:8). Инлайн position:relative
        // перебивал бы sidebar-top → высота колонки схлопывалась в 0 и бар не
        // появлялся (h<=0 в apply).
        overflow: 'hidden',
      }}
    >
      <PlayerBar />
    </div>
  )
}
