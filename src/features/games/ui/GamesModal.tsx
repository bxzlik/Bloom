import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGamesStore } from '../model/gamesStore'
import { GAMES_LIST } from '../model/gamesList'
import { GAME_COMPONENTS } from './gameRegistry'
import { GameNotifToggle } from './GameNotifToggle'
import { GamepadIcon } from './GamepadIcon'
import { runEnterAnimation } from '@shared/lib/enterAnimation'

/**
 * Модалка игр (#gamesOverlay).
 * Логика: openGamesModal/openGame/gamesBack.
 *
 * Два экрана внутри одной `.games-modal`:
 *   - грид плиток (#gamesGrid) — клик по плитке открывает игру;
 *   - вид игры (#gamesGameView) — шапка «Назад» + контент игры из реестра.
 *
 * Открытие/закрытие — модальная конвенция `.open` (двойной rAF + onTransitionEnd
 * для размонтирования, см. [[project-modal-style]]). Esc закрывает модалку.
 *
 * CSS — shared/styles/home.css + settings.css (#gamesOverlay/.games-modal/.game-tile,
 * перенесён без изменений).
 */
export const GamesModal = () => {
  const open = useGamesStore((s) => s.open)
  const current = useGamesStore((s) => s.current)
  const close = useGamesStore((s) => s.close)
  const openGame = useGamesStore((s) => s.openGame)
  const back = useGamesStore((s) => s.back)
  const controls = useGamesStore((s) => s.controls)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!mounted) return null

  const game = current ? GAMES_LIST.find((g) => g.id === current) : undefined
  const GameComp = current ? GAME_COMPONENTS[current] : undefined

  return createPortal(
    <div
      id="gamesOverlay"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div className="games-modal">
        {/* Грид плиток */}
        <div id="gamesGrid" style={{ display: current ? 'none' : 'flex', flexDirection: 'column' }}>
          <div className="games-modal-head">
            <div className="games-modal-head-title">
              <GamepadIcon size={30} />
              Игры
            </div>
            <button className="games-modal-close" onClick={close} aria-label="Закрыть">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="games-tiles">
            {GAMES_LIST.map((g) => (
              <div key={g.id} className="game-tile" onClick={() => openGame(g.id)}>
                <div className="game-tile-icon">{g.icon}</div>
                <div className="game-tile-name">{g.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Вид одной игры */}
        <div id="gamesGameView" style={{ display: current ? 'flex' : 'none' }}>
          <div className="games-modal-head" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
            <button className="games-modal-back" onClick={back} style={{ justifySelf: 'start' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Назад
            </button>
            <div className="games-modal-head-title">{game ? game.label : current}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
              {controls && (
                <>
                  <button
                    onClick={controls.onReset}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 11px', borderRadius: 'calc(var(--radius)*.5)', fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer', transition: '.15s', border: '1px solid var(--border)', background: 'none', color: 'var(--text2)' }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                    </svg>
                    Сбросить
                  </button>
                  <GameNotifToggle game={controls.notifGame} />
                </>
              )}
              <button className="games-modal-close" onClick={close} aria-label="Закрыть">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          <div id="gamesGameContent">
            {GameComp ? (
              <GameComp />
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '40px 0' }}>
                Скоро
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
