import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGamesStore } from '../model/gamesStore'
import { GAMES_LIST, type GameDef } from '../model/gamesList'
import { GAME_COMPONENTS } from './gameRegistry'
import { GamepadIcon } from './GamepadIcon'
import { PetMark } from './PetMark'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT, useLocale } from '@shared/i18n'
import './gamesShell.css'

/**
 * Модалка игр (#gamesOverlay) — теперь это «витрина» + хост полноэкранной игры.
 *
 * Два состояния одной `.games-modal`:
 *   - витрина (`current === null`): полка тематических карточек игр;
 *   - игра (`current` задан): игра монтируется **full-bleed**, без шапки
 *     приложения — свою тематическую шапку (топ-бар) рисует сама игра. Модалке
 *     проставляется `data-game=<theme>`, чтобы подстроить размер под игру.
 *
 * Открытие/закрытие — модальная конвенция `.open` (двойной rAF + onTransitionEnd
 * для размонтирования, см. [[project-modal-style]]). Esc закрывает модалку.
 */

/** Тематическая обложка карточки витрины (рисуется по теме игры). */
const GameCover = ({ theme }: { theme: GameDef['theme'] }) => {
  if (theme === 'clicker') {
    return (
      <div className="gl-cover gl-cover-coin">
        <div className="gl-coin">
          <span className="gl-coin-logo" />
        </div>
      </div>
    )
  }
  return (
    <div className="gl-cover gl-cover-pet">
      <PetMark size={58} className="gl-pet" />
    </div>
  )
}

export const GamesModal = () => {
  const t = useT()
  useLocale()
  const open = useGamesStore((s) => s.open)
  const current = useGamesStore((s) => s.current)
  const close = useGamesStore((s) => s.close)
  const openGame = useGamesStore((s) => s.openGame)
  const back = useGamesStore((s) => s.back)

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
      <div className="games-modal" data-game={game ? game.theme : 'launcher'}>
        {current && GameComp ? (
          /* Полноэкранная игра — свою шапку рисует сама. */
          <GameComp onBack={back} onClose={close} />
        ) : (
          /* Витрина игр. */
          <div className="games-launcher">
            <div className="games-launcher-head">
              <div className="games-launcher-title">
                <GamepadIcon size={26} />
                {t('home.games')}
              </div>
              <button className="games-launcher-close" onClick={close} aria-label={t('common.close')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="games-launcher-grid">
              {GAMES_LIST.map((g) => (
                <button key={g.id} className={'gl-card gl-card-' + g.theme} onClick={() => openGame(g.id)}>
                  <GameCover theme={g.theme} />
                  <div className="gl-card-body">
                    <div className="gl-card-title">{t(g.labelKey)}</div>
                    <div className="gl-card-tag">{t(g.tagKey)}</div>
                  </div>
                  <div className="gl-card-play">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
